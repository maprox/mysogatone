/**
 * Создание потоков для передачи данных
 *
 * Поддерживает множественные раунды для HTTPS (TLS handshake)
 */

import { getLogger } from "@shared/logger/file-logger.ts";
import { pollForResponse } from "@src/yandex-disk-connection-handler/response-poller/index.ts";
import type { CreateStreamsParams } from "@src/yandex-disk-connection-handler/streams/types.ts";

/**
 * Логирует задержку в файл
 */
async function logDelay(
  operation: string,
  data: {
    requestId: string;
    stage: string;
    delay: number;
    totalDelay?: number;
    combineDelay?: number;
    dataSize?: number;
    chunks?: number;
    chunkSize?: number;
    timestamp: number;
    // Дополнительные поля для timeline
    delayFromFileCreated?: number;
    delayFromPollingStart?: number;
    delayFromResponse?: number;
  },
): Promise<void> {
  try {
    const logEntry = JSON.stringify({
      operation,
      ...data,
    }) + "\n";

    const logPath = "delay-log.jsonl";
    const cwd = Deno.cwd();
    const fullPath = `${cwd}/${logPath}`;

    await Deno.writeTextFile(
      logPath,
      logEntry,
      { append: true, create: true },
    );

    console.log(
      `[logDelay] ✅ Записано в ${fullPath}: ${operation}/${data.stage}, delay=${data.delay}ms`,
    );
  } catch (err) {
    // Выводим ошибку явно для отладки
    const cwd = Deno.cwd();
    console.error(`[logDelay] ❌ Ошибка записи в лог delay-log.jsonl:`, err);
    console.error(`[logDelay] Текущая рабочая директория: ${cwd}`);
    console.error(`[logDelay] Полный путь: ${cwd}/delay-log.jsonl`);
  }
}

/**
 * Создает потоки для передачи данных
 */
export function createStreams(
  params: CreateStreamsParams,
): {
  reader: ReadableStreamDefaultReader<Uint8Array>;
  writer: WritableStreamDefaultWriter<Uint8Array>;
} {
  const {
    requestId: initialRequestId,
    dataBuffer,
    storageProvider,
    protocolPaths,
    pollInterval,
    responseTimeout,
    onDataUploaded,
    onConnectionClosed,
    keepSessionAlive = false,
    sessionId: _sessionId,
    targetAddress: _targetAddress,
    targetPort: _targetPort,
    onCreateNextRequest,
  } = params;

  let pollingStarted = false;
  let uploadError: Error | null = null;
  let dataFileCreated = false;
  let readerClosed = false;
  let responseReceived = false; // Флаг, что был получен ответ
  let pendingDataAfterResponse: Uint8Array[] = []; // Данные, полученные после ответа
  let currentRequestId = initialRequestId;
  let _activePolling = false; // Флаг активного polling

  // Временные метки для отслеживания интервалов между шагами
  let firstChunkTime: number | null = null; // Время получения первого чанка
  let fileCreatedTime: number | null = null; // Время создания файла данных
  let pollingStartTime: number | null = null; // Время начала polling
  let responseReceivedTime: number | null = null; // Время получения ответа
  let _nextRequestCreatedTime: number | null = null; // Время создания следующего запроса

  // Reader для чтения ответа от LISTENER
  const reader = new ReadableStream({
    async start(controller) {
      // Ждем пока данные будут загружены в хранилище
      while (!pollingStarted && !uploadError) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // Если была ошибка при загрузке данных, передаем ее сразу
      if (uploadError) {
        controller.error(uploadError);
        return;
      }

      // Для HTTPS продолжаем polling в цикле для множественных раундов
      if (keepSessionAlive) {
        _activePolling = true;

        // Цикл для обработки множественных раундов
        while (!readerClosed) {
          const reqId = currentRequestId;

          console.log(`[createStreams] Polling для requestId: ${reqId}`);

          try {
            await pollForResponse(
              reqId,
              storageProvider,
              protocolPaths,
              pollInterval,
              responseTimeout,
              async (data: Uint8Array) => {
                const responseTime = Date.now();
                responseReceivedTime = responseTime;

                const delayFromFileCreated = fileCreatedTime
                  ? responseTime - fileCreatedTime
                  : 0;
                const delayFromPollingStart = pollingStartTime
                  ? responseTime - pollingStartTime
                  : 0;
                const delayFromFirstChunk = firstChunkTime
                  ? responseTime - firstChunkTime
                  : 0;

                console.log(
                  `[createStreams] Получен ответ для ${reqId}: ${data.length} байт`,
                );

                // КРИТИЧНО: Устанавливаем responseReceived ДО передачи данных, чтобы избежать race condition
                responseReceived = true;

                // Передаем ответ клиенту, даже если он пустой (для TLS handshake это может быть нормально)
                const enqueueTime = Date.now();
                console.log(
                  `[createStreams] [${enqueueTime}] 📤 Отправка ответа клиенту через controller.enqueue() для ${reqId}: ${data.length} байт`,
                );
                controller.enqueue(data);
                const enqueuedTime = Date.now();
                console.log(
                  `[createStreams] [${enqueuedTime}] ✅ Ответ отправлен клиенту для ${reqId} (задержка enqueue: ${
                    enqueuedTime - enqueueTime
                  }ms)`,
                );
                if (data.length === 0) {
                  console.log(
                    `[createStreams] Получен пустой ответ для ${reqId}, это может быть нормально для TLS handshake`,
                  );
                }

                // Логируем временную метку получения ответа
                await logDelay("timeline", {
                  requestId: reqId,
                  stage: "response_received",
                  delay: delayFromFirstChunk,
                  delayFromFileCreated,
                  delayFromPollingStart,
                  timestamp: responseTime,
                });
                console.log(
                  `[createStreams] [TIMELINE] [${responseTime}] ⏱️  Ответ получен (от первого чанка: ${delayFromFirstChunk}ms, от файла: ${delayFromFileCreated}ms, от polling: ${delayFromPollingStart}ms)`,
                );
              },
              (err: Error) => {
                console.error(
                  `[createStreams] Ошибка при получении ответа для ${reqId}:`,
                  err,
                );
                controller.error(err);
                readerClosed = true;
                if (onConnectionClosed) {
                  console.log(
                    `[createStreams] Вызов onConnectionClosed из-за ошибки для ${reqId}`,
                  );
                  onConnectionClosed();
                }
              },
            );

            // После получения ответа проверяем наличие ожидающих данных
            const afterPollTime = Date.now();
            console.log(
              `[createStreams] [${afterPollTime}] После pollForResponse для ${reqId}: responseReceived=${responseReceived}, readerClosed=${readerClosed}, pending chunks=${pendingDataAfterResponse.length}`,
            );

            if (responseReceived) {
              const waitStartTime = Date.now();
              const delayFromResponse = responseReceivedTime
                ? waitStartTime - responseReceivedTime
                : 0;

              console.log(
                `[createStreams] [${waitStartTime}] Начинаем ожидание данных для ${reqId} (от ответа: ${delayFromResponse}ms, readerClosed: ${readerClosed})`,
              );

              // Ждем немного, чтобы дать время writer получить дополнительные данные
              console.log(
                `[createStreams] [${waitStartTime}] Ожидание дополнительных данных после ответа для ${reqId}... (от ответа: ${delayFromResponse}ms)`,
              );

              // Логируем начало ожидания
              await logDelay("timeline", {
                requestId: reqId,
                stage: "waiting_for_next_data",
                delay: delayFromResponse,
                timestamp: waitStartTime,
              });

              // Для keep-alive соединений нужно ждать дольше, чтобы дать время клиенту отправить следующий запрос
              // Для TLS это особенно важно - после handshake клиент отправит HTTP запрос
              // НО: если клиент закрыл соединение (readerClosed=true), сразу закрываем поток
              const maxWaitIterations = 150; // 15 секунд (150 * 100ms)

              for (let i = 0; i < maxWaitIterations && !readerClosed; i++) {
                await new Promise((resolve) => setTimeout(resolve, 100));

                // Проверяем, не закрыт ли reader (клиент закрыл соединение)
                if (readerClosed) {
                  console.log(
                    `[createStreams] Reader закрыт клиентом для ${reqId}, прерываем ожидание после ${
                      i * 100
                    }ms`,
                  );
                  break;
                }

                const currentWaitTime = Date.now();
                const totalWaitTime = currentWaitTime - waitStartTime;

                // Логируем каждые 2 секунды
                if (i > 0 && i % 20 === 0) {
                  console.log(
                    `[createStreams] [${currentWaitTime}] Ожидание данных для ${reqId}: ${totalWaitTime}ms прошло, pending chunks: ${pendingDataAfterResponse.length}, readerClosed: ${readerClosed}`,
                  );
                }

                // Если есть ожидающие данные, создаем новый запрос
                if (
                  pendingDataAfterResponse.length > 0 && onCreateNextRequest
                ) {
                  console.log(
                    `[createStreams] Обнаружены данные после ответа (${pendingDataAfterResponse.length} чанков) для ${reqId} после ${
                      i * 100
                    }ms ожидания, создаем новый запрос...`,
                  );
                  const pendingData = [...pendingDataAfterResponse];
                  pendingDataAfterResponse = [];

                  try {
                    const nextRequestStartTime = Date.now();
                    const delayFromResponse = responseReceivedTime
                      ? nextRequestStartTime - responseReceivedTime
                      : 0;

                    const { requestId: newRequestId } =
                      await onCreateNextRequest(pendingData);
                    const nextRequestEndTime = Date.now();
                    _nextRequestCreatedTime = nextRequestEndTime;

                    const delayFromResponseToNextRequest = responseReceivedTime
                      ? nextRequestEndTime - responseReceivedTime
                      : 0;

                    console.log(
                      `[createStreams] Новый запрос создан: ${newRequestId}, продолжаем polling`,
                    );

                    // Логируем временную метку создания следующего запроса
                    await logDelay("timeline", {
                      requestId: newRequestId,
                      stage: "next_request_created",
                      delay: delayFromResponseToNextRequest,
                      delayFromResponse,
                      timestamp: nextRequestEndTime,
                    });
                    console.log(
                      `[createStreams] [TIMELINE] [${nextRequestEndTime}] ⏱️  Следующий запрос создан (от ответа: ${delayFromResponseToNextRequest}ms)`,
                    );

                    // Сбрасываем временные метки для нового запроса
                    firstChunkTime = null;
                    fileCreatedTime = null;
                    pollingStartTime = null;
                    responseReceivedTime = null;
                    firstChunkTime = nextRequestEndTime; // Время создания запроса = время получения первого "чанка" (метаданных)

                    currentRequestId = newRequestId;
                    responseReceived = false;
                    break; // Выходим из цикла ожидания и продолжаем polling для нового запроса
                  } catch (err) {
                    console.error(
                      `[createStreams] Ошибка при создании нового запроса:`,
                      err,
                    );
                    controller.error(
                      err instanceof Error ? err : new Error(String(err)),
                    );
                    readerClosed = true;
                    break;
                  }
                }
              }

              const waitEndTime = Date.now();
              const totalWaitTime = waitEndTime - waitStartTime;
              const delayFromResponseToEnd = responseReceivedTime
                ? waitEndTime - responseReceivedTime
                : 0;

              console.log(
                `[createStreams] [${waitEndTime}] Завершено ожидание данных для ${reqId}, pending chunks: ${pendingDataAfterResponse.length}, readerClosed: ${readerClosed}, общее время ожидания: ${totalWaitTime}ms`,
              );

              // Логируем завершение ожидания
              await logDelay("timeline", {
                requestId: reqId,
                stage: "waiting_ended",
                delay: delayFromResponseToEnd,
                timestamp: waitEndTime,
              });
            } else {
              const noResponseTime = Date.now();
              console.log(
                `[createStreams] [${noResponseTime}] responseReceived=false для ${reqId}, пропускаем ожидание данных`,
              );
            }

            // Если создан новый запрос, продолжаем цикл для него
            if (currentRequestId !== reqId) {
              const switchTime = Date.now();
              console.log(
                `[createStreams] [${switchTime}] Переход к следующему запросу: ${currentRequestId}`,
              );
              continue;
            }

            // Если нет ожидающих данных и нет следующего запроса после ожидания, завершаем
            if (
              pendingDataAfterResponse.length === 0 &&
              currentRequestId === reqId && !readerClosed
            ) {
              const closeTime = Date.now();
              console.log(
                `[createStreams] [${closeTime}] Нет следующих данных после ожидания для ${reqId}, закрываем reader`,
              );
              controller.close();
              readerClosed = true;
              break;
            }
          } catch (err) {
            console.error(
              `[createStreams] Ошибка в цикле polling для ${reqId}:`,
              err,
            );
            controller.error(
              err instanceof Error ? err : new Error(String(err)),
            );
            readerClosed = true;
            break;
          }
        }
        _activePolling = false;
      } else {
        // Для не-HTTPS - один ответ и закрытие
        _activePolling = true;
        try {
          await pollForResponse(
            currentRequestId,
            storageProvider,
            protocolPaths,
            pollInterval,
            responseTimeout,
            (data: Uint8Array) => {
              console.log(
                `[createStreams] Получен ответ для ${currentRequestId}: ${data.length} байт`,
              );
              controller.enqueue(data);
              controller.close();
              readerClosed = true;
            },
            (err: Error) => {
              console.error(
                `[createStreams] Ошибка при получении ответа для ${currentRequestId}:`,
                err,
              );
              controller.error(err);
              readerClosed = true;
              if (onConnectionClosed) {
                console.log(
                  `[createStreams] Вызов onConnectionClosed из-за ошибки для ${currentRequestId}`,
                );
                onConnectionClosed();
              }
            },
          );
        } catch (err) {
          controller.error(err instanceof Error ? err : new Error(String(err)));
          readerClosed = true;
        }
        _activePolling = false;
      }
    },
    cancel() {
      console.log(
        `[createStreams] Reader отменен для ${initialRequestId} (клиент закрыл соединение)`,
      );
      readerClosed = true;
      _activePolling = false;
    },
  }).getReader();

  // Writer для записи данных от клиента
  let lastChunkTime: number | null = null;
  let chunkIndex = 0; // Счетчик чанков для текущего запроса
  const writer = new WritableStream({
    async write(chunk: Uint8Array) {
      const timestamp = Date.now();
      const timeSinceLastChunk = lastChunkTime ? timestamp - lastChunkTime : 0;

      // Если уже был получен ответ и это HTTPS, сохраняем данные для следующего запроса
      if (responseReceived && keepSessionAlive) {
        console.log(
          `[createStreams] [${timestamp}] Получены данные ПОСЛЕ ответа для ${currentRequestId}: ${chunk.length} байт (HTTPS следующий раунд)`,
        );
        pendingDataAfterResponse.push(chunk);
        console.log(
          `[createStreams] [${timestamp}] Всего ожидающих данных: ${pendingDataAfterResponse.length} чанков`,
        );
        // НЕ логируем задержку для данных после ответа - это уже следующий раунд
        // Сбрасываем lastChunkTime для следующего раунда
        lastChunkTime = null;
        return;
      }

      // Логируем задержку между чанками только для данных ДО ответа (в рамках одного запроса)
      if (timeSinceLastChunk > 0) {
        await logDelay("write", {
          requestId: currentRequestId,
          stage: "chunk_interval",
          delay: timeSinceLastChunk,
          chunkSize: chunk.length,
          timestamp,
        });
        console.log(
          `[createStreams] [${timestamp}] Задержка между чанками: ${timeSinceLastChunk}ms, размер чанка: ${chunk.length} байт`,
        );
      }

      lastChunkTime = timestamp;

      // Обычная обработка данных для первого запроса
      const chunkReceivedTime = Date.now();

      // Отслеживаем время получения первого чанка
      if (firstChunkTime === null) {
        firstChunkTime = chunkReceivedTime;
        await logDelay("timeline", {
          requestId: currentRequestId,
          stage: "first_chunk_received",
          delay: 0,
          timestamp: chunkReceivedTime,
        });
        const logger = getLogger();
        logger.info(
          `[createStreams] [TIMELINE] [${chunkReceivedTime}] ⏱️  Первый чанк получен от клиента`,
        );
      }

      dataBuffer.push(chunk);
      const totalBytes = dataBuffer.reduce(
        (sum, chunk) => sum + chunk.length,
        0,
      );
      const currentChunkIndex = chunkIndex++;

      const logger = getLogger();
      logger.info(
        `[createStreams] [${chunkReceivedTime}] Получены данные ДО ответа от клиента для ${currentRequestId}: ${chunk.length} байт (чанк #${currentChunkIndex}, всего: ${totalBytes} байт)`,
      );

      // КРИТИЧНО: Создаем отдельный файл для каждого чанка вместо обновления одного файла
      // Это избегает race condition, когда LISTENER читает файл во время его обновления
      const chunkPath = protocolPaths.requestDataChunk(
        currentRequestId,
        currentChunkIndex,
      );
      const chunkUploadStartTime = Date.now();

      try {
        await storageProvider.uploadFile(chunkPath, chunk);
        const chunkUploadEndTime = Date.now();
        const chunkUploadDelay = chunkUploadEndTime - chunkUploadStartTime;

        const logger = getLogger();
        logger.info(
          `[createStreams] [${chunkUploadEndTime}] Чанк #${currentChunkIndex} загружен для ${currentRequestId}: ${chunk.length} байт, задержка: ${chunkUploadDelay}ms`,
        );

        // Логируем задержку загрузки чанка
        await logDelay("write", {
          requestId: currentRequestId,
          stage: "chunk_upload",
          delay: chunkUploadDelay,
          chunkSize: chunk.length,
          dataSize: totalBytes,
          timestamp: chunkUploadEndTime,
        });

        // Если это первый чанк, создаем предварительный файл .ready
        // Он будет обновлен в close() с финальными данными
        if (currentChunkIndex === 0 && !dataFileCreated) {
          dataFileCreated = true;
          fileCreatedTime = chunkUploadEndTime;

          // Создаем предварительный файл .ready (будет обновлен в close())
          try {
            const readyPath = protocolPaths.requestDataReady(currentRequestId);
            const readyInfo = {
              totalChunks: 1, // Предварительно, будет обновлено в close()
              totalBytes: totalBytes,
            };
            const readyData = new TextEncoder().encode(
              JSON.stringify(readyInfo),
            );
            await storageProvider.uploadFile(readyPath, readyData);
            const logger = getLogger();
            logger.info(
              `[createStreams] [${chunkUploadEndTime}] Предварительный файл готовности создан для ${currentRequestId}: 1 чанк, ${totalBytes} байт`,
            );
          } catch (err) {
            const logger = getLogger();
            logger.error(
              `[createStreams] [${chunkUploadEndTime}] Ошибка при создании предварительного файла готовности:`,
              err,
            );
          }

          // КРИТИЧНО: Запускаем polling сразу после создания .ready файла, а не ждать close()
          // Иначе curl закроет соединение до того, как мы начнем искать ответ
          if (!pollingStarted) {
            onDataUploaded();
            pollingStarted = true;
            const logger = getLogger();
            logger.info(
              `[createStreams] [${chunkUploadEndTime}] Polling запущен после создания .ready файла для ${currentRequestId}`,
            );
          }

          await logDelay("timeline", {
            requestId: currentRequestId,
            stage: "file_created",
            delay: chunkUploadEndTime - firstChunkTime!,
            timestamp: chunkUploadEndTime,
          });
          const logger = getLogger();
          logger.info(
            `[createStreams] [TIMELINE] [${chunkUploadEndTime}] ⏱️  Первый чанк загружен`,
          );
        }
      } catch (err) {
        const logger = getLogger();
        logger.error(
          `[createStreams] [${chunkReceivedTime}] Ошибка при загрузке чанка #${currentChunkIndex} для ${currentRequestId}:`,
          err,
        );
      }
    },
    async close() {
      const timestamp = Date.now();
      const logger = getLogger();
      logger.info(
        `[createStreams] [${timestamp}] Writer закрыт для ${currentRequestId}, responseReceived: ${responseReceived}, readerClosed: ${readerClosed}, pending chunks: ${pendingDataAfterResponse.length}`,
      );

      // Если reader уже закрыт, не нужно обновлять файлы
      if (readerClosed) {
        logger.info(
          `[createStreams] [${timestamp}] Reader уже закрыт, пропускаем обновление файлов`,
        );
        return;
      }

      // Если файл .ready уже был создан при первом чанке, не нужно обновлять его в close()
      // LISTENER уже обработал запрос и может удалить файлы до того, как мы обновим .ready
      // Предварительный .ready файл содержит правильные данные (1 чанк), поэтому обновление не требуется
      if (dataFileCreated) {
        logger.info(
          `[createStreams] [${timestamp}] Файл готовности уже создан для ${currentRequestId}, пропускаем обновление в close()`,
        );
        // Polling уже должен быть запущен при создании .ready файла, но на всякий случай проверяем
        if (!pollingStarted) {
          logger.warn(
            `[createStreams] [${timestamp}] ⚠️  Polling не был запущен ранее, запускаем сейчас`,
          );
          onDataUploaded();
          pollingStarted = true;
        }
        return;
      }

      // Если файл .ready еще не создан (не было ни одного чанка), создаем его
      const totalBytes = dataBuffer.reduce(
        (sum, chunk) => sum + chunk.length,
        0,
      );

      try {
        const readyPath = protocolPaths.requestDataReady(currentRequestId);
        const readyInfo = {
          totalChunks: chunkIndex,
          totalBytes: totalBytes,
        };
        const readyData = new TextEncoder().encode(JSON.stringify(readyInfo));

        await storageProvider.uploadFile(readyPath, readyData);
        logger.info(
          `[createStreams] [${timestamp}] Файл готовности создан в close() для ${currentRequestId}: ${readyInfo.totalChunks} чанков, ${readyInfo.totalBytes} байт`,
        );
        dataFileCreated = true;
        onDataUploaded();
        pollingStarted = true;
      } catch (err) {
        logger.error(
          `[createStreams] [${timestamp}] Ошибка при создании файла готовности для ${currentRequestId}:`,
          err,
        );
        uploadError = err instanceof Error ? err : new Error(String(err));
        if (!pollingStarted) {
          pollingStarted = true;
        }
      }
    },
  }).getWriter();

  return {
    reader,
    writer,
  };
}
