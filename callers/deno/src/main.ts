/**
 * CALLER для Deno
 *
 * SOCKS5 сервер на Deno для тестирования на Windows/Linux/Mac.
 */

import { closeLogger, initializeLogger } from "@shared/logger/file-logger.ts";
import { LogLevel } from "@shared/logger/types.ts";
import { ProtocolPaths } from "@shared/protocol/paths.ts";
import {
  createDelayConfig,
  parseAppConfig,
  parseDelayEnvConfig,
} from "@src/config/index.ts";
import { createDelayedConnectionHandler } from "@src/delayed-connection-handler/factory.ts";
import { createDirectConnectionHandler } from "@src/direct-connection-handler/factory.ts";
import { Socks5Server } from "@src/socks5-server.ts";
import { YandexDiskProvider } from "@src/storage-provider/yandex-disk-provider.ts";
import { YandexDiskConnectionHandler } from "@src/yandex-disk-connection-handler/index.ts";
import { SessionManager } from "@src/yandex-disk-connection-handler/session/manager.ts";

/**
 * Точка входа в приложение.
 */
async function main(): Promise<void> {
  // Инициализируем логгер
  const logFilePath = Deno.env.get("CALLER_LOG_PATH") || "logs/caller.log";
  const logLevel = Deno.env.get("CALLER_LOG_LEVEL")?.toUpperCase() || "INFO";
  const minLevel = LogLevel[logLevel as keyof typeof LogLevel] ?? LogLevel.INFO;

  const logger = await initializeLogger(logFilePath, minLevel, "CALLER");

  // Парсим конфигурацию
  const config = parseAppConfig();

  // Создаем SessionManager для поддержки постоянных соединений (HTTPS)
  const sessionManager = new SessionManager();

  // Периодическая очистка неактивных сессий (каждые 60 секунд)
  const sessionCleanupInterval = setInterval(() => {
    sessionManager.cleanupInactiveSessions(60000); // 60 секунд неактивности
  }, 60000) as unknown as number;

  // Создаем connection handler в зависимости от конфигурации
  let connectionHandler;

  if (config.useDelayedHandler) {
    logger.info(
      "Используется DelayedConnectionHandler (прямое TCP соединение с эмуляцией задержек).",
    );

    const delayEnvConfig = parseDelayEnvConfig();
    const manualDelays = createDelayConfig(delayEnvConfig, logger);

    // ВАЖНО: Всегда передаем manualDelays, даже если он пустой (все значения 0)
    // Это явно указывает, что нужно использовать эти значения, а не загружать из лога
    // Если нужно использовать значения из лога, не передавайте delays вообще
    connectionHandler = await createDelayedConnectionHandler({
      sessionManager,
      delayLogPath: Object.keys(manualDelays).length === 0
        ? config.delayLogPath
        : undefined, // Загружаем из лога только если не заданы явные задержки
      delays: manualDelays, // Всегда передаем, даже если пустой
    });
  } else if (config.accessToken) {
    logger.info("Используется YandexDiskProvider для ConnectionHandler.");
    const storageProvider = new YandexDiskProvider(config.accessToken);
    const protocolPaths = new ProtocolPaths(
      config.requestsFolder,
      config.responsesFolder,
    );

    connectionHandler = new YandexDiskConnectionHandler({
      storageProvider,
      protocolPaths,
      pollInterval: config.pollInterval,
      responseTimeout: config.responseTimeout,
      sessionManager,
    });
  } else {
    logger.info(
      "YANDEX_DISK_TOKEN не найден. Используется DirectConnectionHandler.",
    );
    connectionHandler = createDirectConnectionHandler({
      sessionManager,
    });
  }

  const server = new Socks5Server(config.port, connectionHandler);

  // Обработка сигнала завершения
  const shutdown = async () => {
    logger.info("\nПолучен сигнал завершения, останавливаем сервер...");
    if (sessionCleanupInterval !== undefined) {
      clearInterval(sessionCleanupInterval);
    }
    server.stop();
    await closeLogger();
    Deno.exit(0);
  };

  Deno.addSignalListener("SIGINT", shutdown);

  // SIGTERM поддерживается не на всех платформах (например, Windows)
  try {
    Deno.addSignalListener("SIGTERM", shutdown);
  } catch (_error) {
    // Игнорируем ошибку, если SIGTERM не поддерживается
    // На Windows это нормально
  }

  try {
    await server.start();
  } catch (error) {
    logger.error("Ошибка при запуске сервера:", error);
    await closeLogger();
    Deno.exit(1);
  }
}

// Запускаем приложение
if (import.meta.main) {
  main();
}
