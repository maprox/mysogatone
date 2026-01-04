/**
 * LISTENER для Яндекс Диск
 *
 * Точка входа приложения.
 */

import { closeLogger, initializeLogger } from "@shared/logger/file-logger.ts";
import { LogLevel } from "@shared/logger/types.ts";
import { getConfigFromEnv } from "@src/listener/config.ts";
import { Listener } from "@src/listener/listener.ts";
import { YandexDiskProvider } from "@src/storage-provider/index.ts";

/**
 * Точка входа
 */
async function main(): Promise<void> {
  // Инициализируем логгер
  const logFilePath = Deno.env.get("LISTENER_LOG_PATH") || "logs/listener.log";
  const logLevel = Deno.env.get("LISTENER_LOG_LEVEL")?.toUpperCase() || "INFO";
  const minLevel = LogLevel[logLevel as keyof typeof LogLevel] ?? LogLevel.INFO;

  const logger = await initializeLogger(logFilePath, minLevel, "LISTENER");

  try {
    logger.info("🚀 LISTENER для Яндекс Диск запускается...");

    const config = getConfigFromEnv();
    const storageProvider = new YandexDiskProvider(config.accessToken);
    const listener = new Listener(config, storageProvider);
    await listener.start();
  } catch (error) {
    const logger = await import("@shared/logger/file-logger.ts").then((m) =>
      m.getLogger()
    );
    logger.error("❌ Критическая ошибка:", error);
    await closeLogger();
    Deno.exit(1);
  }
}

// Запускаем только если файл выполняется напрямую
if (import.meta.main) {
  await main();
}
