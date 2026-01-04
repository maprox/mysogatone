/**
 * Обработка подключений к целевым серверам (GOAL)
 *
 * Устанавливает TCP соединения с целевыми серверами и записывает ответы в Яндекс Диск.
 */

import { getLogger } from "@shared/logger/file-logger.ts";
import type { ProtocolPaths } from "@shared/protocol/paths.ts";
import { RequestMetadata } from "@shared/protocol/types.ts";
import { handleConnectionError } from "@src/connection/error-handler.ts";
import { readResponse } from "@src/connection/response-reader.ts";
import { connectWithTimeout } from "@src/connection/tcp-connection.ts";
import type { SessionManager } from "@src/listener/session/manager.ts";
import { decodeAllTLSRecords } from "@src/listener/utils.ts";
import type { StorageProvider } from "@src/storage-provider/index.ts";

export interface ConnectionRequest extends RequestMetadata {
  requestData: Uint8Array | ReadableStream<Uint8Array>;
}

export class ConnectionHandler {
  private storageProvider: StorageProvider;
  private protocolPaths: ProtocolPaths;
  private connectionTimeout: number; // в миллисекундах
  private sessionManager?: SessionManager;

  constructor(
    storageProvider: StorageProvider,
    protocolPaths: ProtocolPaths,
    connectionTimeout: number = 60000, // 60 секунд по умолчанию
    sessionManager?: SessionManager,
  ) {
    this.storageProvider = storageProvider;
    this.protocolPaths = protocolPaths;
    this.connectionTimeout = connectionTimeout;
    this.sessionManager = sessionManager;
  }

  /**
   * Обрабатывает запрос на подключение согласно протоколу
   */
  async handleConnection(request: ConnectionRequest): Promise<void> {
    const logger = getLogger();
    const startTime = Date.now();
    logger.info(
      `[${request.requestId}] [${startTime}] 🔌 Начало обработки запроса к ${request.targetAddress}:${request.targetPort}`,
    );

    // Определяем, потоковые данные или массив
    const isStream = request.requestData instanceof ReadableStream;
    if (isStream) {
      logger.info(
        `[${request.requestId}] [${startTime}] 📦 Данные для отправки: поток (streaming mode)`,
      );
    } else {
      const requestData = request.requestData as Uint8Array;
      logger.info(
        `[${request.requestId}] [${startTime}] 📦 Размер данных для отправки: ${requestData.length} байт`,
      );
      if (requestData.length > 0) {
        const previewLength = Math.min(100, requestData.length);
        const preview = requestData.slice(0, previewLength);
        // Пытаемся декодировать как текст, если не получается - показываем hex
        try {
          const textPreview = new TextDecoder().decode(preview);
          logger.info(
            `[${request.requestId}] [${startTime}] 📄 Первые ${previewLength} байт данных (текст): ${textPreview}`,
          );
        } catch {
          const hexPreview = Array.from(preview).map((b: number) =>
            b.toString(16).padStart(2, "0")
          ).join(" ");
          logger.info(
            `[${request.requestId}] [${startTime}] 📄 Первые ${previewLength} байт данных (hex): ${
              hexPreview.substring(0, 100)
            }...`,
          );
        }
      }
    }

    // Проверяем, используем ли мы сессии
    const useSessions = !!(this.sessionManager && request.sessionId);
    const isFirstInSession = request.isFirstInSession ?? true;
    const keepSessionAlive = request.keepSessionAlive ?? false;
    const isHttps = request.targetPort === 443; // Определяем заранее для использования в finally

    if (useSessions) {
      logger.info(
        `[${request.requestId}] [${startTime}] 🔗 Сессия: ${request.sessionId}, первый в сессии: ${isFirstInSession}, keep-alive: ${keepSessionAlive}`,
      );
    }

    let conn: Deno.TcpConn | null = null;
    const sessionId: string | undefined = request.sessionId;

    try {
      // Получаем или создаем TCP соединение через SessionManager
      if (useSessions && this.sessionManager && sessionId) {
        const session = await this.sessionManager.getOrCreateSession(
          sessionId,
          request.targetAddress,
          request.targetPort,
          isFirstInSession,
          this.connectionTimeout,
        );

        conn = session.tcpConnection;
        this.sessionManager.addRequestToSession(sessionId, request.requestId);

        const connTime = Date.now();
        logger.info(
          `[${request.requestId}] [${connTime}] ✅ TCP соединение получено (сессия: ${sessionId}, переиспользовано: ${!isFirstInSession})`,
        );

        // КРИТИЧНО: Запускаем непрерывное чтение сразу после создания/получения сессии
        // Это поддерживает соединение активным между раундами (как в DelayedConnectionHandler)
        if (isHttps && !session.reading) {
          this.sessionManager.startContinuousReading(sessionId);
          logger.info(
            `[${request.requestId}] [${connTime}] 🔄 Запущено непрерывное чтение для сессии ${sessionId} (поддержание соединения активным)`,
          );
        }

        // Для переиспользованных соединений проверяем буфер (непрерывное чтение уже работает)
        // Если в буфере есть данные, значит соединение активно
        if (!isFirstInSession) {
          const checkStartTime = Date.now();
          // Проверяем буфер без очистки (только для проверки)
          const session = this.sessionManager.getSession(sessionId);
          const bufferLength = session
            ? session.readBuffer.reduce((sum, chunk) => sum + chunk.length, 0)
            : 0;
          const checkEndTime = Date.now();

          if (bufferLength > 0) {
            // В буфере есть данные - соединение активно, данные уже прочитаны
            logger.info(
              `[${request.requestId}] [${checkEndTime}] ℹ️  Проверка соединения: найдено ${bufferLength} байт в буфере (соединение активно, проверка заняла: ${
                checkEndTime - checkStartTime
              }ms)`,
            );
          } else {
            // Буфер пуст - это нормально, соединение открыто, но данных нет
            logger.info(
              `[${request.requestId}] [${checkEndTime}] ℹ️  Проверка соединения: буфер пуст (нормально, соединение открыто, проверка заняла: ${
                checkEndTime - checkStartTime
              }ms)`,
            );
          }
        }
      } else {
        // Старая логика: создаем новое соединение для каждого запроса
        const connectStartTime = Date.now();
        logger.info(
          `[${request.requestId}] [${connectStartTime}] 🔗 Попытка подключения к ${request.targetAddress}:${request.targetPort} (TCP)...`,
        );
        conn = await connectWithTimeout(
          request.targetAddress,
          request.targetPort,
          this.connectionTimeout,
        );
        const connectEndTime = Date.now();

        logger.info(
          `[${request.requestId}] [${connectEndTime}] ✅ Соединение установлено с ${request.targetAddress}:${request.targetPort} (задержка подключения: ${
            connectEndTime - connectStartTime
          }ms)`,
        );
      }

      // Проверяем, что соединение установлено
      if (!conn) {
        throw new Error("TCP connection is null");
      }

      // Сохраняем ссылку на соединение для использования в sendData
      const connection = conn;

      // Отправляем данные на целевой сервер
      // Для переиспользованных соединений (второй раунд TLS handshake) важно отправлять данные немедленно
      const sendData = async (
        data: Uint8Array | ReadableStream<Uint8Array>,
      ): Promise<void> => {
        if (data instanceof ReadableStream) {
          // Потоковая отправка данных
          const streamStartTime = Date.now();
          logger.info(
            `[${request.requestId}] [${streamStartTime}] 📤 Начало потоковой отправки данных на GOAL... (переиспользовано: ${!isFirstInSession})`,
          );
          const reader = data.getReader();
          let totalBytesWritten = 0;
          let chunkCount = 0;

          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) {
                break;
              }
              if (value && value.length > 0) {
                chunkCount++;
                // Логируем первые байты для отладки
                if (chunkCount === 1) {
                  const previewLength = Math.min(32, value.length);
                  const preview = Array.from(value.slice(0, previewLength))
                    .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
                    .join(" ");
                  const chunkWriteStart = Date.now();

                  // Декодируем все TLS-записи, если это TLS
                  const tlsRecords = decodeAllTLSRecords(value);
                  if (tlsRecords.length > 0 && tlsRecords[0].isTLS) {
                    logger.info(
                      `[${request.requestId}] [${chunkWriteStart}] 📤 Отправка чанка #${chunkCount} на GOAL: ${value.length} байт`,
                    );
                    logger.info(
                      `[${request.requestId}] [${chunkWriteStart}] 🔐 TLS: ${tlsRecords.length} Record(s) в чанке`,
                    );
                    tlsRecords.forEach((record, index) => {
                      logger.info(
                        `[${request.requestId}] [${chunkWriteStart}]   Record #${
                          index + 1
                        } (offset ${record.offset}): ${record.contentType}, ${record.version}, длина данных: ${record.dataLength} байт${
                          record.handshakeType
                            ? `, Handshake Type: ${record.handshakeType}`
                            : ""
                        }`,
                      );
                    });
                    logger.info(
                      `[${request.requestId}] [${chunkWriteStart}] 📄 Первые ${previewLength} байт (hex): ${preview}`,
                    );
                  } else {
                    // Пытаемся декодировать как текст (HTTP)
                    try {
                      const textPreview = new TextDecoder().decode(
                        value.slice(0, Math.min(200, value.length)),
                      );
                      logger.info(
                        `[${request.requestId}] [${chunkWriteStart}] 📤 Отправка чанка #${chunkCount} на GOAL: ${value.length} байт (HTTP запрос)`,
                      );
                      logger.info(
                        `[${request.requestId}] [${chunkWriteStart}] 📄 Первые ${
                          Math.min(200, value.length)
                        } байт (текст): ${textPreview.substring(0, 200)}`,
                      );
                    } catch {
                      logger.info(
                        `[${request.requestId}] [${chunkWriteStart}] 📤 Отправка чанка #${chunkCount} на GOAL: ${value.length} байт, первые ${previewLength} байт: ${preview}`,
                      );
                    }
                  }

                  const bytesWritten = await connection.write(value);
                  const chunkWriteEnd = Date.now();
                  totalBytesWritten += bytesWritten;
                  logger.info(
                    `[${request.requestId}] [${chunkWriteEnd}] 📤 Чанк #${chunkCount} отправлен: ${bytesWritten} байт из ${value.length} байт (всего: ${totalBytesWritten} байт, задержка записи: ${
                      chunkWriteEnd - chunkWriteStart
                    }ms)`,
                  );

                  if (bytesWritten !== value.length) {
                    logger.warn(
                      `[${request.requestId}] [${chunkWriteEnd}] ⚠️  Отправлено не все в чанке #${chunkCount}: ${bytesWritten} из ${value.length} байт`,
                    );
                  }
                } else {
                  const chunkWriteStart = Date.now();
                  const bytesWritten = await connection.write(value);
                  const chunkWriteEnd = Date.now();
                  totalBytesWritten += bytesWritten;
                  logger.info(
                    `[${request.requestId}] [${chunkWriteEnd}] 📤 Чанк #${chunkCount} отправлен: ${bytesWritten} байт из ${value.length} байт (всего: ${totalBytesWritten} байт, задержка записи: ${
                      chunkWriteEnd - chunkWriteStart
                    }ms)`,
                  );

                  if (bytesWritten !== value.length) {
                    logger.warn(
                      `[${request.requestId}] [${chunkWriteEnd}] ⚠️  Отправлено не все в чанке #${chunkCount}: ${bytesWritten} из ${value.length} байт`,
                    );
                  }
                }
              }
            }
            reader.releaseLock();
            const streamEndTime = Date.now();
            logger.info(
              `[${request.requestId}] [${streamEndTime}] ✅ Потоковая отправка завершена: ${totalBytesWritten} байт в ${chunkCount} чанках (общее время: ${
                streamEndTime - streamStartTime
              }ms)`,
            );

            // Проверяем состояние соединения после отправки
            try {
              const remoteAddr = connection.remoteAddr as Deno.NetAddr;
              logger.info(
                `[${request.requestId}] [${streamEndTime}] 🔌 Состояние соединения после отправки: ${remoteAddr.hostname}:${remoteAddr.port}, активно`,
              );
            } catch (e) {
              logger.warn(
                `[${request.requestId}] [${streamEndTime}] ⚠️  Не удалось проверить состояние соединения после отправки:`,
                e,
              );
            }
          } catch (streamError) {
            const streamErrorTime = Date.now();
            reader.releaseLock();
            logger.error(
              `[${request.requestId}] [${streamErrorTime}] ❌ Ошибка при потоковой отправке данных:`,
              streamError,
            );
            throw streamError;
          }
        } else {
          // Отправка массива данных (обратная совместимость)
          const arraySendStartTime = Date.now();
          logger.info(
            `[${request.requestId}] [${arraySendStartTime}] 📤 Отправка ${data.length} байт данных на GOAL... (переиспользовано: ${!isFirstInSession})`,
          );
          if (data.length > 0) {
            const bytesWritten = await connection.write(data);
            const arraySendEndTime = Date.now();
            logger.info(
              `[${request.requestId}] [${arraySendEndTime}] ✅ Данные отправлены успешно: ${bytesWritten} байт записано из ${data.length} байт (задержка отправки: ${
                arraySendEndTime - arraySendStartTime
              }ms)`,
            );

            if (bytesWritten !== data.length) {
              logger.warn(
                `[${request.requestId}] [${arraySendEndTime}] ⚠️  Отправлено не все: ${bytesWritten} из ${data.length} байт`,
              );
            }

            // Проверяем состояние соединения после отправки
            try {
              const remoteAddr = connection.remoteAddr as Deno.NetAddr;
              logger.info(
                `[${request.requestId}] [${arraySendEndTime}] 🔌 Состояние соединения после отправки: ${remoteAddr.hostname}:${remoteAddr.port}, активно`,
              );
            } catch (e) {
              logger.warn(
                `[${request.requestId}] [${arraySendEndTime}] ⚠️  Не удалось проверить состояние соединения после отправки:`,
                e,
              );
            }
          } else {
            logger.info(
              `[${request.requestId}] [${arraySendStartTime}] ⚠️  Данных для отправки нет (0 байт), пропускаем отправку`,
            );
          }
        }
      };

      try {
        await sendData(request.requestData);
      } catch (writeError) {
        logger.error(
          `[${request.requestId}] ❌ Ошибка при отправке данных:`,
          writeError,
        );

        // Если соединение закрыто при переиспользовании, закрываем сессию и создаем новую
        if (
          !isFirstInSession && useSessions && sessionId && this.sessionManager
        ) {
          const errorMsg = writeError instanceof Error
            ? writeError.message
            : String(writeError);
          if (
            errorMsg.includes("10054") ||
            errorMsg.includes("ConnectionReset") ||
            errorMsg.includes("Broken pipe")
          ) {
            logger.info(
              `[${request.requestId}] 🔄 Соединение закрыто сервером, закрываем сессию ${sessionId}`,
            );
            this.sessionManager.closeSession(sessionId);

            // Создаем новую сессию для этого запроса
            try {
              const newSession = await this.sessionManager.getOrCreateSession(
                sessionId,
                request.targetAddress,
                request.targetPort,
                true, // Теперь это первый запрос в новой сессии
                this.connectionTimeout,
              );
              conn = newSession.tcpConnection;
              logger.info(
                `[${request.requestId}] ✅ Создано новое TCP соединение для сессии ${sessionId}`,
              );

              // Пытаемся отправить данные снова
              await sendData(request.requestData);
              logger.info(
                `[${request.requestId}] ✅ Данные отправлены после переподключения`,
              );
            } catch (retryError) {
              logger.error(
                `[${request.requestId}] ❌ Ошибка при повторной отправке:`,
                retryError,
              );
              throw retryError;
            }
          } else {
            // Другая ошибка - просто закрываем сессию
            logger.info(
              `[${request.requestId}] 🔄 Закрываем сессию ${sessionId} из-за ошибки записи`,
            );
            this.sessionManager.closeSession(sessionId);
            throw writeError;
          }
        } else {
          throw writeError;
        }
      }

      // Читаем ответ от целевого сервера
      // Для HTTPS (порт 443) увеличиваем таймаут чтения, так как TLS handshake может занимать больше времени
      // Для второго раунда (HTTP запрос после TLS handshake) также нужен достаточный таймаут
      const isSecondRound = !isFirstInSession && isHttps;
      const readTimeout = isHttps
        ? (isSecondRound ? 20000 : 30000) // 20 секунд для второго раунда (HTTP запрос), 30 секунд для первого (TLS handshake)
        : 5000; // 5 секунд для остальных

      const readStartTime = Date.now();
      logger.info(
        `[${request.requestId}] [${readStartTime}] 📥 Чтение ответа от GOAL... (таймаут: ${readTimeout}ms, второй раунд: ${isSecondRound})`,
      );

      // Проверяем состояние соединения перед чтением ответа
      try {
        const remoteAddr = conn.remoteAddr as Deno.NetAddr;
        logger.info(
          `[${request.requestId}] [${readStartTime}] 🔌 Проверка соединения перед чтением: ${remoteAddr.hostname}:${remoteAddr.port}`,
        );
      } catch (e) {
        logger.warn(
          `[${request.requestId}] [${readStartTime}] ⚠️  Не удалось получить информацию о соединении:`,
          e,
        );
      }

      // КРИТИЧНО: Для второго раунда проверяем буфер сессии (данные, прочитанные между раундами)
      // Используем общий reader для чтения (как в DelayedConnectionHandler)
      let bufferedData: Uint8Array = new Uint8Array(0);
      if (isSecondRound && useSessions && sessionId && this.sessionManager) {
        logger.info(
          `[${request.requestId}] [${readStartTime}] 🔍 Проверка буфера сессии для второго раунда...`,
        );
        bufferedData = this.sessionManager.getBufferedData(sessionId);
        if (bufferedData.length > 0) {
          logger.info(
            `[${request.requestId}] [${readStartTime}] 📦 Получено ${bufferedData.length} байт из буфера сессии (прочитано между раундами)`,
          );
        } else {
          logger.info(
            `[${request.requestId}] [${readStartTime}] 📦 Буфер сессии пуст (непрерывное чтение не прочитало данных между раундами)`,
          );
        }
      }

      let responseData: Uint8Array;

      try {
        // КРИТИЧНО: Используем общий reader для чтения (как в DelayedConnectionHandler)
        // Это поддерживает соединение активным между раундами
        let readData: Uint8Array;
        if (useSessions && sessionId && this.sessionManager) {
          // Читаем из reader сессии
          readData = await this.sessionManager.readFromSessionReader(
            sessionId,
            readTimeout,
          );
        } else {
          // Для не-HTTPS соединений используем обычное чтение
          readData = await readResponse(conn, readTimeout);
        }
        const readEndTime = Date.now();

        // Объединяем данные из буфера с прочитанными данными
        if (bufferedData.length > 0 && readData.length > 0) {
          const combined = new Uint8Array(
            bufferedData.length + readData.length,
          );
          combined.set(bufferedData, 0);
          combined.set(readData, bufferedData.length);
          responseData = combined;
          logger.info(
            `[${request.requestId}] [${readEndTime}] ✅ Получено ${readData.length} байт от GOAL + ${bufferedData.length} байт из буфера = ${responseData.length} байт (задержка чтения: ${
              readEndTime - readStartTime
            }ms)`,
          );
        } else if (bufferedData.length > 0) {
          responseData = bufferedData;
          logger.info(
            `[${request.requestId}] [${readEndTime}] ✅ Использованы данные из буфера: ${responseData.length} байт (задержка чтения: ${
              readEndTime - readStartTime
            }ms)`,
          );
        } else {
          responseData = readData;
          logger.info(
            `[${request.requestId}] [${readEndTime}] ✅ Получено ${responseData.length} байт ответа от GOAL (задержка чтения: ${
              readEndTime - readStartTime
            }ms)`,
          );
        }

        if (responseData.length === 0 && isSecondRound) {
          logger.warn(
            `[${request.requestId}] [${readEndTime}] ⚠️  Пустой ответ от GOAL для второго раунда HTTPS`,
          );
          logger.warn(
            `[${request.requestId}] [${readEndTime}] 💡 Возможные причины:`,
          );
          logger.warn(
            `[${request.requestId}] [${readEndTime}]   1. TLS handshake не завершен - сервер ожидает больше данных`,
          );
          logger.warn(
            `[${request.requestId}] [${readEndTime}]   2. GOAL закрыл соединение между раундами`,
          );
          logger.warn(
            `[${request.requestId}] [${readEndTime}]   3. Отправлены неправильные данные (не HTTP запрос, а TLS продолжение)`,
          );
          logger.warn(
            `[${request.requestId}] [${readEndTime}]   4. Сервер не отвечает на HTTP запрос после TLS handshake`,
          );

          // Проверяем, не закрыто ли соединение
          // Используем reader для проверки (непрерывное чтение уже работает)
          let connectionClosed = false;
          if (useSessions && sessionId && this.sessionManager) {
            const session = this.sessionManager.getSession(sessionId);
            if (session && session.reader) {
              try {
                // Пытаемся прочитать из reader с коротким таймаутом
                const testReadPromise = session.reader.read();
                const testTimeoutPromise = new Promise<
                  { done: true; value: undefined }
                >((resolve) => {
                  setTimeout(
                    () => resolve({ done: true, value: undefined }),
                    100,
                  );
                });
                const testResult = await Promise.race([
                  testReadPromise,
                  testTimeoutPromise,
                ]);

                if (testResult.done) {
                  connectionClosed = true;
                  logger.warn(
                    `[${request.requestId}] [${readEndTime}] 🔌 Соединение закрыто сервером (reader закрыт)`,
                  );
                } else if (testResult.value && testResult.value.length > 0) {
                  // Есть данные - сохраняем в буфер
                  session.readBuffer.push(testResult.value);
                  logger.info(
                    `[${request.requestId}] [${readEndTime}] 📦 Обнаружены данные в reader (${testResult.value.length} байт), сохранены в буфер`,
                  );
                }
              } catch (testError) {
                const errorMsg = testError instanceof Error
                  ? testError.message
                  : String(testError);
                if (
                  errorMsg.includes("10054") ||
                  errorMsg.includes("ConnectionReset") ||
                  errorMsg.includes("Broken pipe") ||
                  errorMsg.includes("connection closed")
                ) {
                  connectionClosed = true;
                  logger.warn(
                    `[${request.requestId}] [${readEndTime}] 🔌 Соединение закрыто сервером (обнаружено через ошибку: ${errorMsg})`,
                  );
                }
              }
            } else {
              // Reader не найден - возможно, соединение закрыто
              connectionClosed = true;
              logger.warn(
                `[${request.requestId}] [${readEndTime}] 🔌 Reader не найден для сессии ${sessionId}, возможно соединение закрыто`,
              );
            }
          } else {
            // Для не-HTTPS соединений используем обычную проверку
            try {
              const testBuffer = new Uint8Array(1);
              const testRead = await conn.read(testBuffer);
              if (testRead === null) {
                connectionClosed = true;
                logger.warn(
                  `[${request.requestId}] [${readEndTime}] 🔌 Соединение закрыто сервером (обнаружено при проверке после пустого ответа)`,
                );
              }
            } catch (testError) {
              const errorMsg = testError instanceof Error
                ? testError.message
                : String(testError);
              if (
                errorMsg.includes("10054") ||
                errorMsg.includes("ConnectionReset") ||
                errorMsg.includes("Broken pipe") ||
                errorMsg.includes("connection closed")
              ) {
                connectionClosed = true;
                logger.warn(
                  `[${request.requestId}] [${readEndTime}] 🔌 Соединение закрыто сервером (обнаружено через ошибку: ${errorMsg})`,
                );
              }
            }
          }

          // Если соединение закрыто, закрываем сессию
          // ВАЖНО: Для TLS handshake сервер может закрывать соединение между раундами
          // Это означает, что keep-alive не работает для TLS handshake
          if (
            connectionClosed && useSessions && sessionId && this.sessionManager
          ) {
            logger.info(
              `[${request.requestId}] [${readEndTime}] 🔄 Закрываем сессию ${sessionId} из-за закрытого соединения`,
            );
            logger.warn(
              `[${request.requestId}] [${readEndTime}] ⚠️  Сервер закрыл соединение между раундами TLS handshake - keep-alive не поддерживается`,
            );
            logger.warn(
              `[${request.requestId}] [${readEndTime}] 💡 Это означает, что TLS handshake не может быть завершен через keep-alive соединение`,
            );
            logger.warn(
              `[${request.requestId}] [${readEndTime}] 💡 Возможные причины: сервер не поддерживает keep-alive для TLS handshake или закрывает соединение из-за таймаута`,
            );
            this.sessionManager.closeSession(sessionId);
            // Устанавливаем флаг, чтобы не пытаться сохранить соединение в finally
            conn = null;
          }
        }
        if (responseData.length > 0) {
          const previewTime = Date.now();
          const previewLength = Math.min(200, responseData.length);
          const preview = responseData.slice(0, previewLength);

          // Декодируем все TLS-записи, если это TLS
          const tlsRecords = decodeAllTLSRecords(responseData);
          if (tlsRecords.length > 0 && tlsRecords[0].isTLS) {
            logger.info(
              `[${request.requestId}] [${previewTime}] 🔐 Ответ от GOAL: ${tlsRecords.length} TLS Record(s), всего ${responseData.length} байт`,
            );
            tlsRecords.forEach((record, index) => {
              logger.info(
                `[${request.requestId}] [${previewTime}]   Record #${
                  index + 1
                } (offset ${record.offset}): ${record.contentType}, ${record.version}, длина записи: ${record.recordLength} байт, длина данных: ${record.dataLength} байт${
                  record.handshakeType
                    ? `, Handshake Type: ${record.handshakeType}`
                    : ""
                }`,
              );
            });
            const hexPreview = Array.from(preview).map((b) =>
              b.toString(16).padStart(2, "0")
            ).join(" ");
            logger.info(
              `[${request.requestId}] [${previewTime}] 📄 Первые ${previewLength} байт ответа (hex): ${
                hexPreview.substring(0, 100)
              }...`,
            );
          } else {
            // Пытаемся декодировать как текст (HTTP)
            try {
              const textPreview = new TextDecoder().decode(preview);
              logger.info(
                `[${request.requestId}] [${previewTime}] 📄 Первые ${previewLength} байт ответа (текст): ${textPreview}`,
              );
            } catch {
              // Если не удалось декодировать, выводим hex
              const hexPreview = Array.from(preview).map((b) =>
                b.toString(16).padStart(2, "0")
              ).join(" ");
              logger.info(
                `[${request.requestId}] [${previewTime}] 📄 Первые ${previewLength} байт ответа (hex): ${
                  hexPreview.substring(0, 100)
                }...`,
              );
            }
          }
        }
      } catch (error) {
        const errorTime = Date.now();
        // Если данных не было отправлено и сервер не отвечает, это может быть нормально
        // Например, для HTTPS соединений нужен TLS handshake, который не выполнен
        const hasNoData = isStream
          ? false
          : (request.requestData as Uint8Array).length === 0;
        if (
          hasNoData && error instanceof Error &&
          error.message === "No data received from server"
        ) {
          logger.info(
            `[${request.requestId}] [${errorTime}] ⚠️  Сервер не ответил на пустой запрос, это может быть нормально для некоторых протоколов`,
          );
          logger.info(
            `[${request.requestId}] [${errorTime}] 💡 Возможно, требуется TLS handshake или данные будут отправлены позже`,
          );
          // Используем данные из буфера, если есть, иначе пустой ответ
          responseData = bufferedData.length > 0
            ? bufferedData
            : new Uint8Array(0);
        } else if (
          error instanceof Error &&
          (error.name === "ConnectionReset" ||
            error.message.includes("10054") ||
            error.message.includes("Broken pipe"))
        ) {
          // Если соединение было закрыто сервером при переиспользовании, это может быть нормально
          // для TLS handshake, если сервер закрыл соединение из-за таймаута или неправильных данных
          logger.info(
            `[${request.requestId}] [${errorTime}] ⚠️  Соединение закрыто сервером (ConnectionReset/Broken pipe)`,
          );
          logger.info(
            `[${request.requestId}] [${errorTime}] 💡 Это может быть нормально для TLS handshake, если сервер закрыл соединение`,
          );
          logger.info(
            `[${request.requestId}] [${errorTime}] 💡 Переиспользовано соединение: ${!isFirstInSession}, keep-alive: ${keepSessionAlive}`,
          );

          // Если это переиспользованное соединение и keep-alive, закрываем сессию
          if (
            !isFirstInSession && keepSessionAlive && useSessions && sessionId &&
            this.sessionManager
          ) {
            logger.info(
              `[${request.requestId}] [${errorTime}] 🔄 Закрываем сессию ${sessionId} из-за ConnectionReset`,
            );
            this.sessionManager.closeSession(sessionId);
          }

          // Используем данные из буфера, если есть, иначе пустой ответ
          responseData = bufferedData.length > 0
            ? bufferedData
            : new Uint8Array(0);
        } else if (
          error instanceof Error && error.message.includes("timeout") &&
          !isFirstInSession && isHttps
        ) {
          // Для второго раунда TLS handshake таймаут может означать, что сервер не отвечает
          // Это может быть нормально, если сервер закрыл соединение или ожидает другие данные
          logger.info(
            `[${request.requestId}] [${errorTime}] ⚠️  Таймаут чтения для второго раунда TLS handshake`,
          );
          logger.info(
            `[${request.requestId}] [${errorTime}] 💡 Сервер может не отвечать, если соединение закрыто или данные неправильные`,
          );

          // Используем данные из буфера, если есть, иначе пустой ответ
          responseData = bufferedData.length > 0
            ? bufferedData
            : new Uint8Array(0);
        } else {
          throw error;
        }
      }

      // Записываем ответ в файл согласно протоколу (даже если он пустой)
      const writeStartTime = Date.now();
      const responsePath = this.protocolPaths.response(request.requestId);
      logger.info(
        `[${request.requestId}] [${writeStartTime}] 💾 Запись ответа в ${responsePath}...`,
      );
      await this.storageProvider.uploadFile(responsePath, responseData);
      const writeEndTime = Date.now();

      logger.info(
        `[${request.requestId}] [${writeEndTime}] ✅ Ответ записан в ${responsePath} (${responseData.length} байт, задержка записи: ${
          writeEndTime - writeStartTime
        }ms)`,
      );
    } catch (error) {
      const errorTime = Date.now();
      logger.error(
        `[${request.requestId}] [${errorTime}] ❌ Ошибка при обработке запроса:`,
        error,
      );
      await handleConnectionError(
        request.requestId,
        error,
        this.storageProvider,
        this.protocolPaths,
      );
      throw error;
    } finally {
      // Закрываем соединение только если не нужно сохранять сессию
      // Соединение НЕ должно закрываться, если:
      // - keepSessionAlive = true И useSessions = true (для HTTPS)
      // В противном случае закрываем соединение
      const shouldKeepAlive = keepSessionAlive && useSessions;
      const finallyTime = Date.now();

      if (conn !== null && !shouldKeepAlive) {
        try {
          conn.close();
          logger.info(
            `[${request.requestId}] [${finallyTime}] 🔌 Соединение закрыто`,
          );

          // Если использовалась сессия, закрываем её
          if (useSessions && sessionId && this.sessionManager) {
            this.sessionManager.closeSession(sessionId);
          }
        } catch (closeError) {
          const closeErrorTime = Date.now();
          logger.warn(
            `[${request.requestId}] [${closeErrorTime}] ⚠️  Ошибка при закрытии соединения:`,
            closeError,
          );
        }
      } else if (shouldKeepAlive && conn !== null) {
        logger.info(
          `[${request.requestId}] [${finallyTime}] 🔗 Соединение сохранено для сессии ${sessionId} (keep-alive: ${keepSessionAlive}, useSessions: ${useSessions})`,
        );

        // КРИТИЧНО: Запускаем непрерывное чтение для поддержания соединения активным между раундами
        // Это предотвращает закрытие соединения сервером по таймауту неактивности
        // Используем общий reader (как в DelayedConnectionHandler)
        if (useSessions && sessionId && this.sessionManager && isHttps) {
          const session = this.sessionManager.getSession(sessionId);
          if (session && !session.reading) {
            // Запускаем непрерывное чтение только если оно еще не запущено
            this.sessionManager.startContinuousReading(sessionId);
            logger.info(
              `[${request.requestId}] [${finallyTime}] 🔄 Запущено непрерывное чтение для сессии ${sessionId} (поддержание соединения активным)`,
            );
          } else if (session && session.reading) {
            // Непрерывное чтение уже активно - это нормально
            logger.info(
              `[${request.requestId}] [${finallyTime}] ✅ Непрерывное чтение уже активно для сессии ${sessionId}`,
            );
          }
        }
      } else if (shouldKeepAlive && conn === null) {
        logger.info(
          `[${request.requestId}] [${finallyTime}] ⚠️  Соединение было закрыто, не сохраняем для сессии ${sessionId}`,
        );
      }
    }
  }
}
