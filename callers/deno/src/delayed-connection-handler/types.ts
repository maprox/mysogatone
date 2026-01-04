/**
 * Типы для DelayedConnectionHandler
 */

// Переиспользуем интерфейсы из direct-connection-handler
export type {
  ConnectionFactory,
  ConnectionStore,
  Logger,
  SessionInfo,
  SessionManager,
  SessionResolver,
} from "@src/direct-connection-handler/types.ts";

/**
 * Конфигурация задержек для эмуляции
 */
export interface DelayConfig {
  /** Задержка между чанками данных (мс) */
  chunkInterval?: number;
  /** Задержка при создании метаданных (мс) */
  metadataDelay?: number;
  /** Задержка при загрузке данных (мс) */
  uploadDelay?: number;
  /** Задержка при polling (мс) */
  pollInterval?: number;
  /** Задержка при чтении ответа (мс) */
  responseReadDelay?: number;
  /** Задержка перед отправкой первого чанка (мс) - критична для TLS handshake */
  firstChunkDelay?: number;
  /** Задержка между частями большого чанка при разбиении (мс) */
  interChunkDelay?: number;
  /** Размер чанка для разбиения (байт). Если > 0, большие чанки будут разбиты с задержками */
  bytesPerDelay?: number;
  /** Задержка между каждыми N байтами в первых M байтах (для разбиения TLS handshake) */
  bytesPerDelayInFirstBytes?: number;
  /** Количество первых байтов, к которым применяется bytesPerDelayInFirstBytes */
  firstBytesCount?: number;
  /** Задержка между байтами в первых байтах (мс) - критично для TLS handshake */
  byteDelayInFirstBytes?: number;
  /** Задержка между раундами TLS handshake - эмуляция задержек YandexDiskConnectionHandler (мс) */
  roundDelay?: number;
  /** Задержка создания метаданных для второго раунда (мс) */
  secondRoundMetadataDelay?: number;
  /** Задержка загрузки данных для второго раунда (мс) */
  secondRoundUploadDelay?: number;
  /** Задержка между ответом и созданием следующего запроса (мс) - критично для TLS handshake */
  nextRequestDelay?: number;
  /** Задержка создания метаданных для следующего запроса (мс) */
  nextRequestMetadataDelay?: number;
  /** Задержка загрузки данных для следующего запроса (мс) */
  nextRequestUploadDelay?: number;
  /** Эмулировать "висящее" соединение между раундами (как в LISTENER) - не читать из соединения между раундами */
  simulateIdleConnection?: boolean;
}

/**
 * Интерфейс для парсера лога задержек
 */
export interface DelayLogParser {
  /**
   * Парсит лог задержек и извлекает статистику
   */
  parse(logPath: string): Promise<DelayConfig>;
}

/**
 * Интерфейс для применения задержек
 */
export interface DelayApplier {
  /**
   * Применяет задержку если она настроена
   */
  apply(delayMs: number | undefined, stage: string): Promise<void>;
}

/**
 * Интерфейс для создания оберток потоков с задержками
 */
export interface StreamWrapper {
  /**
   * Создает обертки для reader и writer с применением задержек
   */
  wrap(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    writer: WritableStreamDefaultWriter<Uint8Array>,
    delays: DelayConfig,
  ): {
    reader: ReadableStreamDefaultReader<Uint8Array>;
    writer: WritableStreamDefaultWriter<Uint8Array>;
  };
}
