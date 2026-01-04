/**
 * Конфигурация приложения и парсинг переменных окружения
 */

import type { Logger } from "@shared/logger/types.ts";
import type { DelayConfig } from "@src/delayed-connection-handler/types.ts";

import type { AppConfig, DelayEnvConfig } from "./types.ts";

/**
 * Парсит переменные окружения и создает конфигурацию приложения
 */
export function parseAppConfig(): AppConfig {
  const port = parseInt(Deno.env.get("SOCKS5_PORT") || "1080", 10);
  const accessToken = Deno.env.get("YANDEX_DISK_TOKEN");
  const requestsFolder = Deno.env.get("REQUESTS_FOLDER") ||
    ".mysogatone/requests";
  const responsesFolder = Deno.env.get("RESPONSES_FOLDER") ||
    ".mysogatone/responses";
  const pollInterval = parseInt(Deno.env.get("POLL_INTERVAL_MS") || "2000", 10);
  const responseTimeout = parseInt(
    Deno.env.get("RESPONSE_TIMEOUT_MS") || "60000",
    10,
  );
  const useDirectHandler = Deno.env.get("USE_DIRECT_HANDLER") === "true";
  const useDelayedHandler = Deno.env.get("USE_DELAYED_HANDLER") === "true";
  const delayLogPath = Deno.env.get("DELAY_LOG_PATH") || "delay-log.jsonl";

  return {
    port,
    accessToken,
    requestsFolder,
    responsesFolder,
    pollInterval,
    responseTimeout,
    useDirectHandler,
    useDelayedHandler,
    delayLogPath,
  };
}

/**
 * Парсит переменные окружения для конфигурации задержек
 */
export function parseDelayEnvConfig(): DelayEnvConfig {
  return {
    firstChunkDelay: parseInt(Deno.env.get("FIRST_CHUNK_DELAY_MS") || "0", 10),
    chunkInterval: parseInt(Deno.env.get("CHUNK_INTERVAL_MS") || "0", 10),
    interChunkDelay: parseInt(Deno.env.get("INTER_CHUNK_DELAY_MS") || "0", 10),
    bytesPerDelay: parseInt(Deno.env.get("BYTES_PER_DELAY") || "0", 10),
    bytesPerDelayInFirstBytes: parseInt(
      Deno.env.get("BYTES_PER_DELAY_IN_FIRST_BYTES") || "0",
      10,
    ),
    firstBytesCount: parseInt(Deno.env.get("FIRST_BYTES_COUNT") || "0", 10),
    byteDelayInFirstBytes: parseInt(
      Deno.env.get("BYTE_DELAY_IN_FIRST_BYTES_MS") || "0",
      10,
    ),
    secondRoundMetadataDelay: parseInt(
      Deno.env.get("SECOND_ROUND_METADATA_DELAY_MS") || "0",
      10,
    ),
    secondRoundUploadDelay: parseInt(
      Deno.env.get("SECOND_ROUND_UPLOAD_DELAY_MS") || "0",
      10,
    ),
    roundDelay: parseInt(Deno.env.get("ROUND_DELAY_MS") || "0", 10),
    nextRequestDelay: parseInt(
      Deno.env.get("NEXT_REQUEST_DELAY_MS") || "0",
      10,
    ),
    nextRequestMetadataDelay: parseInt(
      Deno.env.get("NEXT_REQUEST_METADATA_DELAY_MS") || "0",
      10,
    ),
    nextRequestUploadDelay: parseInt(
      Deno.env.get("NEXT_REQUEST_UPLOAD_DELAY_MS") || "0",
      10,
    ),
    simulateIdleConnection: Deno.env.get("SIMULATE_IDLE_CONNECTION") === "true",
  };
}

/**
 * Создает конфигурацию задержек из переменных окружения с логированием
 */
export function createDelayConfig(
  envConfig: DelayEnvConfig,
  logger: Logger,
): DelayConfig {
  const manualDelays: DelayConfig = {};

  if (envConfig.firstChunkDelay > 0) {
    manualDelays.firstChunkDelay = envConfig.firstChunkDelay;
    logger.info(
      `[DelayedConnectionHandler] Задержка первого чанка: ${envConfig.firstChunkDelay}ms`,
    );
  }
  if (envConfig.chunkInterval > 0) {
    manualDelays.chunkInterval = envConfig.chunkInterval;
    logger.info(
      `[DelayedConnectionHandler] Задержка между чанками: ${envConfig.chunkInterval}ms`,
    );
  }
  if (envConfig.interChunkDelay > 0) {
    manualDelays.interChunkDelay = envConfig.interChunkDelay;
    logger.info(
      `[DelayedConnectionHandler] Задержка между частями чанка: ${envConfig.interChunkDelay}ms`,
    );
  }
  if (envConfig.bytesPerDelay > 0) {
    manualDelays.bytesPerDelay = envConfig.bytesPerDelay;
    logger.info(
      `[DelayedConnectionHandler] Разбиение чанков по ${envConfig.bytesPerDelay} байт`,
    );
  }
  if (envConfig.bytesPerDelayInFirstBytes > 0) {
    manualDelays.bytesPerDelayInFirstBytes =
      envConfig.bytesPerDelayInFirstBytes;
    logger.info(
      `[DelayedConnectionHandler] Разбиение первых байтов по ${envConfig.bytesPerDelayInFirstBytes} байт`,
    );
  }
  if (envConfig.firstBytesCount > 0) {
    manualDelays.firstBytesCount = envConfig.firstBytesCount;
    logger.info(
      `[DelayedConnectionHandler] Обработка первых ${envConfig.firstBytesCount} байт с задержками`,
    );
  }
  if (envConfig.byteDelayInFirstBytes > 0) {
    manualDelays.byteDelayInFirstBytes = envConfig.byteDelayInFirstBytes;
    logger.info(
      `[DelayedConnectionHandler] Задержка между байтами в первых байтах: ${envConfig.byteDelayInFirstBytes}ms`,
    );
  }
  if (envConfig.secondRoundMetadataDelay > 0) {
    manualDelays.secondRoundMetadataDelay = envConfig.secondRoundMetadataDelay;
    logger.info(
      `[DelayedConnectionHandler] Задержка создания метаданных для второго раунда: ${envConfig.secondRoundMetadataDelay}ms`,
    );
  }
  if (envConfig.secondRoundUploadDelay > 0) {
    manualDelays.secondRoundUploadDelay = envConfig.secondRoundUploadDelay;
    logger.info(
      `[DelayedConnectionHandler] Задержка загрузки данных для второго раунда: ${envConfig.secondRoundUploadDelay}ms`,
    );
  }
  if (envConfig.roundDelay > 0) {
    manualDelays.roundDelay = envConfig.roundDelay;
    logger.info(
      `[DelayedConnectionHandler] Общая задержка между раундами: ${envConfig.roundDelay}ms`,
    );
  }
  if (envConfig.nextRequestDelay > 0) {
    manualDelays.nextRequestDelay = envConfig.nextRequestDelay;
    logger.info(
      `[DelayedConnectionHandler] Задержка между ответом и следующим запросом: ${envConfig.nextRequestDelay}ms`,
    );
  }
  if (envConfig.nextRequestMetadataDelay > 0) {
    manualDelays.nextRequestMetadataDelay = envConfig.nextRequestMetadataDelay;
    logger.info(
      `[DelayedConnectionHandler] Задержка создания метаданных для следующего запроса: ${envConfig.nextRequestMetadataDelay}ms`,
    );
  }
  if (envConfig.nextRequestUploadDelay > 0) {
    manualDelays.nextRequestUploadDelay = envConfig.nextRequestUploadDelay;
    logger.info(
      `[DelayedConnectionHandler] Задержка загрузки данных для следующего запроса: ${envConfig.nextRequestUploadDelay}ms`,
    );
  }
  if (envConfig.simulateIdleConnection) {
    manualDelays.simulateIdleConnection = true;
    logger.info(
      `[DelayedConnectionHandler] ⚠️  ЭМУЛЯЦИЯ "ВИСЯЩЕГО" СОЕДИНЕНИЯ: соединение не будет использоваться между раундами (как в LISTENER)`,
    );
  }

  return manualDelays;
}
