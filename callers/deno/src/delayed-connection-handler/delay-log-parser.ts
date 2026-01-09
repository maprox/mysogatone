/**
 * Сервис для парсинга лога задержек и извлечения статистики.
 */

import type { DelayConfig, DelayLogParser, Logger } from "./types.ts";

/**
 * Реализация парсера лога задержек
 */
export class DelayLogParserImpl implements DelayLogParser {
  constructor(private logger: Logger) {}

  async parse(logPath: string): Promise<DelayConfig> {
    try {
      const logContent = await Deno.readTextFile(logPath);
      const lines = logContent.trim().split("\n").filter((line: string) =>
        line.trim()
      );

      const delays: {
        chunkInterval: number[];
        metadataDelay: number[];
        uploadDelay: number[];
        pollInterval: number[];
        responseReadDelay: number[];
        nextRequestDelay: number[];
        nextRequestMetadataDelay: number[];
        nextRequestUploadDelay: number[];
      } = {
        chunkInterval: [],
        metadataDelay: [],
        uploadDelay: [],
        pollInterval: [],
        responseReadDelay: [],
        nextRequestDelay: [],
        nextRequestMetadataDelay: [],
        nextRequestUploadDelay: [],
      };

      for (const line of lines) {
        try {
          const entry = JSON.parse(line);

          if (entry.operation === "write" && entry.stage === "chunk_interval") {
            delays.chunkInterval.push(entry.delay);
          } else if (
            entry.operation === "createRequestMetadata" &&
            entry.stage === "upload"
          ) {
            delays.metadataDelay.push(entry.delay);
          } else if (
            entry.operation === "uploadRequestData" && entry.stage === "upload"
          ) {
            delays.uploadDelay.push(entry.delay);
          } else if (
            entry.operation === "pollForResponse" &&
            entry.stage === "poll_interval"
          ) {
            delays.pollInterval.push(entry.delay);
          } else if (
            entry.operation === "pollForResponse" &&
            entry.stage === "response_received"
          ) {
            delays.responseReadDelay.push(entry.delay);
          } else if (
            entry.operation === "timeline" &&
            entry.stage === "next_request_created"
          ) {
            // Задержка между ответом и созданием следующего запроса
            // Используем delay (полная задержка от ответа), а не delayFromResponse
            if (entry.delay !== undefined && entry.delay > 0) {
              delays.nextRequestDelay.push(entry.delay);
            }
          }
        } catch (err) {
          this.logger.warn(`Ошибка парсинга строки лога:`, err);
        }
      }

      // Вычисляем средние значения
      const median = (arr: number[]) => {
        if (arr.length === 0) return 0;
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0
          ? (sorted[mid - 1] + sorted[mid]) / 2
          : sorted[mid];
      };

      const config: DelayConfig = {};

      if (delays.chunkInterval.length > 0) {
        // Исключаем аномально большие задержки (> 1000ms) - это скорее всего задержки между раундами
        const reasonableDelays = delays.chunkInterval.filter((d) => d <= 1000);
        if (reasonableDelays.length > 0) {
          config.chunkInterval = Math.round(median(reasonableDelays));
          this.logger.info(
            `Задержка между чанками: медиана=${config.chunkInterval}ms (из ${reasonableDelays.length} разумных записей, всего ${delays.chunkInterval.length})`,
          );
        } else {
          // Если все задержки большие, используем минимальную разумную задержку
          config.chunkInterval = 0;
          this.logger.info(
            `Все задержки между чанками слишком большие (>1000ms), используем 0ms (из ${delays.chunkInterval.length} записей)`,
          );
        }
      }

      if (delays.metadataDelay.length > 0) {
        config.metadataDelay = Math.round(median(delays.metadataDelay));
        this.logger.info(
          `Задержка создания метаданных: медиана=${config.metadataDelay}ms (из ${delays.metadataDelay.length} записей)`,
        );
      }

      if (delays.uploadDelay.length > 0) {
        config.uploadDelay = Math.round(median(delays.uploadDelay));
        this.logger.info(
          `Задержка загрузки данных: медиана=${config.uploadDelay}ms (из ${delays.uploadDelay.length} записей)`,
        );
      }

      if (delays.pollInterval.length > 0) {
        config.pollInterval = Math.round(median(delays.pollInterval));
        this.logger.info(
          `Задержка polling: медиана=${config.pollInterval}ms (из ${delays.pollInterval.length} записей)`,
        );
      }

      if (delays.responseReadDelay.length > 0) {
        config.responseReadDelay = Math.round(median(delays.responseReadDelay));
        this.logger.info(
          `Задержка чтения ответа: медиана=${config.responseReadDelay}ms (из ${delays.responseReadDelay.length} записей)`,
        );
      }

      if (delays.nextRequestDelay.length > 0) {
        config.nextRequestDelay = Math.round(median(delays.nextRequestDelay));
        this.logger.info(
          `Задержка между ответом и следующим запросом: медиана=${config.nextRequestDelay}ms (из ${delays.nextRequestDelay.length} записей)`,
        );
      }

      // Извлекаем задержки создания метаданных и загрузки для следующего запроса
      // Ищем createRequestMetadata и uploadRequestData, которые идут после next_request_created
      let _foundNextRequest = false;
      const nextRequestMetadataDelays: number[] = [];
      const nextRequestUploadDelays: number[] = [];

      for (let i = 0; i < lines.length; i++) {
        try {
          const entry = JSON.parse(lines[i]);
          if (
            entry.operation === "timeline" &&
            entry.stage === "next_request_created"
          ) {
            _foundNextRequest = true;
            // Ищем следующие createRequestMetadata и uploadRequestData
            for (let j = i + 1; j < lines.length && j < i + 5; j++) {
              try {
                const nextEntry = JSON.parse(lines[j]);
                if (
                  nextEntry.operation === "createRequestMetadata" &&
                  nextEntry.stage === "upload"
                ) {
                  nextRequestMetadataDelays.push(nextEntry.delay);
                } else if (
                  nextEntry.operation === "uploadRequestData" &&
                  nextEntry.stage === "upload"
                ) {
                  nextRequestUploadDelays.push(nextEntry.delay);
                  _foundNextRequest = false; // Сброс после нахождения upload
                  break;
                }
              } catch {
                // Пропускаем некорректные строки
              }
            }
          }
        } catch {
          // Пропускаем некорректные строки
        }
      }

      if (nextRequestMetadataDelays.length > 0) {
        config.nextRequestMetadataDelay = Math.round(
          median(nextRequestMetadataDelays),
        );
        this.logger.info(
          `Задержка создания метаданных для следующего запроса: медиана=${config.nextRequestMetadataDelay}ms (из ${nextRequestMetadataDelays.length} записей)`,
        );
      }

      if (nextRequestUploadDelays.length > 0) {
        config.nextRequestUploadDelay = Math.round(
          median(nextRequestUploadDelays),
        );
        this.logger.info(
          `Задержка загрузки данных для следующего запроса: медиана=${config.nextRequestUploadDelay}ms (из ${nextRequestUploadDelays.length} записей)`,
        );
      }

      return config;
    } catch (err) {
      this.logger.warn(`Ошибка чтения лога задержек:`, err);
      return {};
    }
  }
}
