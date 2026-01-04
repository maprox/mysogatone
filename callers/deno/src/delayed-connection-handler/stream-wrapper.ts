/**
 * Сервис для создания оберток потоков с применением задержек.
 */

import type {
  DelayApplier,
  DelayConfig,
  Logger,
  StreamWrapper,
} from "./types.ts";

/**
 * Реализация создания оберток потоков с задержками
 */
export class StreamWrapperImpl implements StreamWrapper {
  constructor(
    private delayApplier: DelayApplier,
    private logger: Logger,
  ) {}

  wrap(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    writer: WritableStreamDefaultWriter<Uint8Array>,
    delays: DelayConfig,
  ): {
    reader: ReadableStreamDefaultReader<Uint8Array>;
    writer: WritableStreamDefaultWriter<Uint8Array>;
  } {
    const delayApplier = this.delayApplier;
    const logger = this.logger;

    let lastWriteTime: number | null = null;

    // Общая переменная для отслеживания получения ответа (для определения второго раунда)
    let responseReceived = false;
    let isSecondRound = false; // Флаг второго раунда TLS handshake

    // Writer с задержками между чанками
    let totalBytesWritten = 0; // Счетчик всех отправленных байт

    const delayedWriter = new WritableStream({
      write: async (chunk: Uint8Array) => {
        const now = Date.now();

        // КРИТИЧНО: Если это второй раунд TLS handshake, применяем задержки между раундами
        // Это эмулирует задержки YandexDiskConnectionHandler между раундами
        if (responseReceived && !isSecondRound) {
          isSecondRound = true;
          logger.info(
            `🔄 Второй раунд TLS handshake обнаружен, применяем задержки между раундами...`,
          );

          // Задержка между ответом и созданием следующего запроса (из логов: ~2424ms)
          const nextRequestDelay = delays.nextRequestDelay ?? 0;
          if (nextRequestDelay > 0) {
            await delayApplier.apply(nextRequestDelay, "next_request_delay");
          }

          // Задержка создания метаданных для следующего запроса (из логов: ~1083ms)
          const nextRequestMetadataDelay = delays.nextRequestMetadataDelay ??
            delays.secondRoundMetadataDelay ?? delays.metadataDelay ?? 0;
          if (nextRequestMetadataDelay > 0) {
            await delayApplier.apply(
              nextRequestMetadataDelay,
              "next_request_metadata_delay",
            );
          }

          // Задержка загрузки данных для следующего запроса (из логов: ~1234ms)
          const nextRequestUploadDelay = delays.nextRequestUploadDelay ??
            delays.secondRoundUploadDelay ?? delays.uploadDelay ?? 0;
          if (nextRequestUploadDelay > 0) {
            await delayApplier.apply(
              nextRequestUploadDelay,
              "next_request_upload_delay",
            );
          }

          // Общая задержка между раундами (roundDelay) - можно задать вручную для переопределения
          const roundDelay = delays.roundDelay || 0;
          if (roundDelay > 0) {
            await delayApplier.apply(roundDelay, "round_delay");
          }

          logger.info(
            `✅ Задержки между раундами применены, отправляем данные второго раунда`,
          );
        }

        // Применяем задержку между чанками (только если она разумная, < 1000ms)
        if (
          lastWriteTime !== null && delays.chunkInterval &&
          delays.chunkInterval > 0 && delays.chunkInterval < 1000
        ) {
          const timeSinceLastWrite = now - lastWriteTime;
          if (timeSinceLastWrite < delays.chunkInterval) {
            const delayNeeded = delays.chunkInterval - timeSinceLastWrite;
            await delayApplier.apply(delayNeeded, "chunk_interval");
          }
        }

        // 1. Задержка при отправке первого чанка
        if (lastWriteTime === null) {
          const firstChunkDelay = delays.firstChunkDelay || 0;
          if (firstChunkDelay > 0) {
            await delayApplier.apply(firstChunkDelay, "first_chunk_delay");
          }
        }

        // 2. КРИТИЧНО: Задержки внутри первых байтов (TLS handshake)
        // Это самая важная задержка для TLS handshake - разбиение ClientHello
        const firstBytesCount = delays.firstBytesCount || 0;
        const bytesPerDelayInFirst = delays.bytesPerDelayInFirstBytes || 0;
        const byteDelayInFirst = delays.byteDelayInFirstBytes || 0;

        if (firstBytesCount > 0 && totalBytesWritten < firstBytesCount) {
          // Мы еще в области первых байтов - применяем специальную обработку
          const remainingFirstBytes = firstBytesCount - totalBytesWritten;
          const bytesToProcess = Math.min(chunk.length, remainingFirstBytes);

          if (byteDelayInFirst > 0 && bytesToProcess > 0) {
            // Задержка между каждым байтом в первых байтах (самый агрессивный режим)
            // Это должно сломать TLS handshake, так как ClientHello будет отправляться очень медленно
            for (let i = 0; i < bytesToProcess; i++) {
              if (i > 0) {
                await delayApplier.apply(
                  byteDelayInFirst,
                  "byte_delay_in_first_bytes",
                );
              }
              const singleByte = chunk.slice(i, i + 1);
              await writer.write(singleByte);
              totalBytesWritten++;
            }

            // Отправляем оставшуюся часть
            if (bytesToProcess < chunk.length) {
              await writer.write(chunk.slice(bytesToProcess));
              totalBytesWritten += chunk.length - bytesToProcess;
            }
          } else if (
            bytesPerDelayInFirst > 0 && bytesToProcess > bytesPerDelayInFirst
          ) {
            // Разбиваем на маленькие части с задержками
            for (let i = 0; i < bytesToProcess; i += bytesPerDelayInFirst) {
              const end = Math.min(i + bytesPerDelayInFirst, bytesToProcess);
              const subChunk = chunk.slice(i, end);

              if (i > 0 && byteDelayInFirst > 0) {
                // Задержка между каждыми N байтами в первых байтах
                await delayApplier.apply(
                  byteDelayInFirst,
                  "byte_delay_in_first_bytes",
                );
              }

              await writer.write(subChunk);
              totalBytesWritten += subChunk.length;
            }

            // Отправляем оставшуюся часть чанка без специальной обработки
            if (bytesToProcess < chunk.length) {
              await writer.write(chunk.slice(bytesToProcess));
              totalBytesWritten += chunk.length - bytesToProcess;
            }
          } else {
            // Обычная отправка первых байтов
            await writer.write(chunk);
            totalBytesWritten += chunk.length;
          }
        } else {
          // Обычная обработка для остальных данных
          const bytesPerDelay = delays.bytesPerDelay || 0;
          if (bytesPerDelay > 0 && chunk.length > bytesPerDelay) {
            // Разбиваем большой чанк на части с задержками
            const chunksNeeded = Math.ceil(chunk.length / bytesPerDelay);
            for (let i = 0; i < chunksNeeded; i++) {
              const start = i * bytesPerDelay;
              const end = Math.min(start + bytesPerDelay, chunk.length);
              const subChunk = chunk.slice(start, end);

              if (i > 0) {
                const interChunkDelay = delays.interChunkDelay || 0;
                if (interChunkDelay > 0) {
                  await delayApplier.apply(
                    interChunkDelay,
                    "inter_chunk_delay",
                  );
                }
              }

              await writer.write(subChunk);
            }
            totalBytesWritten += chunk.length;
          } else {
            // Обычная отправка без разбиения
            await writer.write(chunk);
            totalBytesWritten += chunk.length;
          }
        }

        lastWriteTime = Date.now();
      },
      async close() {
        await writer.close();
      },
      abort(reason) {
        writer.abort(reason);
      },
    }).getWriter();

    // Reader с задержками при чтении ответа (эмуляция задержек polling)
    // Отслеживаем, когда получен ответ, чтобы определить начало второго раунда
    let firstResponseReceived = false; // Флаг первого полученного ответа
    const simulateIdle = delays.simulateIdleConnection ?? false; // Эмуляция "висящего" соединения

    const delayedReader = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            // Эмулируем задержку polling перед чтением
            if (delays.pollInterval && delays.pollInterval > 0) {
              await delayApplier.apply(
                delays.pollInterval,
                "poll_interval_read",
              );
            }

            const result = await reader.read();

            if (result.done) {
              controller.close();
              break;
            }

            // Эмулируем задержку чтения ответа
            if (delays.responseReadDelay && delays.responseReadDelay > 0) {
              await delayApplier.apply(
                delays.responseReadDelay,
                "response_read_delay",
              );
            }

            // Отмечаем, что получен ответ (для определения второго раунда)
            if (!firstResponseReceived && result.value.length > 0) {
              firstResponseReceived = true;
              responseReceived = true;
              logger.info(
                `✅ Получен первый ответ (${result.value.length} байт), следующий чанк будет вторым раундом`,
              );

              // КРИТИЧНО: Если включена эмуляция "висящего" соединения, останавливаем чтение после первого ответа
              // Это эмулирует поведение LISTENER, где соединение не используется между раундами
              if (simulateIdle) {
                logger.warn(
                  `⚠️  ЭМУЛЯЦИЯ "ВИСЯЩЕГО" СОЕДИНЕНИЯ: останавливаем чтение после первого ответа`,
                );
                logger.warn(
                  `⚠️  Соединение будет "висеть" без активности между раундами (как в LISTENER)`,
                );
                // Отправляем первый ответ и останавливаемся
                controller.enqueue(result.value);
                // НЕ продолжаем читать - соединение будет "висеть" как в LISTENER
                // Второй раунд начнется только когда writer получит следующий чанк
                break;
              }
            }

            controller.enqueue(result.value);
          }
        } catch (error) {
          controller.error(error);
        }
      },
      cancel(reason) {
        reader.cancel(reason);
      },
    }).getReader();

    return {
      reader: delayedReader,
      writer: delayedWriter,
    };
  }
}
