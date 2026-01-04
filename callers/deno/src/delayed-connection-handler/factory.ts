/**
 * Фабрика для создания DelayedConnectionHandler с дефолтными реализациями.
 * Создает все необходимые зависимости и собирает DelayedConnectionHandler.
 */

import { ConsoleLoggerAdapter } from "@shared/logger/console-logger.ts";
import { ConnectionFactory } from "@src/direct-connection-handler/connection-factory.ts";
import { ConnectionStore } from "@src/direct-connection-handler/connection-store.ts";
import { SessionResolver } from "@src/direct-connection-handler/session-resolver.ts";

import { DelayApplierImpl } from "./delay-applier.ts";
import { DelayLogParserImpl } from "./delay-log-parser.ts";
import { DelayedConnectionHandler } from "./index.ts";
import { StreamWrapperImpl } from "./stream-wrapper.ts";
import type { DelayConfig, Logger, SessionManager } from "./types.ts";

/**
 * Конфигурация для фабрики DelayedConnectionHandler
 */
export interface DelayedConnectionHandlerFactoryConfig {
  /** Менеджер сессий для поддержки постоянных соединений (HTTPS) */
  sessionManager?: SessionManager;
  /** Логгер для записи сообщений (если не указан, используется ConsoleLoggerAdapter) */
  logger?: Logger;
  /** Конфигурация задержек */
  delays?: DelayConfig;
  /** Путь к файлу с логом задержек для анализа */
  delayLogPath?: string;
}

/**
 * Создает DelayedConnectionHandler с дефолтными реализациями всех зависимостей
 */
export async function createDelayedConnectionHandler(
  config: DelayedConnectionHandlerFactoryConfig = {},
): Promise<DelayedConnectionHandler> {
  const logger = config.logger ??
    new ConsoleLoggerAdapter("DelayedConnectionHandler");
  const connectionStore = new ConnectionStore(logger);
  const sessionResolver = new SessionResolver(config.sessionManager);
  const connectionFactory = new ConnectionFactory(logger);
  const delayLogParser = new DelayLogParserImpl(logger);
  const delayApplier = new DelayApplierImpl();
  const streamWrapper = new StreamWrapperImpl(delayApplier, logger);

  // Определяем задержки
  let delays: DelayConfig;

  if (config.delays !== undefined) {
    delays = config.delays;
    logger.info(`Используются явно заданные задержки:`, delays);
  } else {
    delays = {};
    // Если delays не передан, загружаем из лога
    if (config.delayLogPath) {
      try {
        delays = await delayLogParser.parse(config.delayLogPath);
        logger.info(`Задержки загружены из лога:`, delays);
      } catch (err) {
        logger.warn(`Не удалось загрузить задержки из лога:`, err);
      }
    }
  }

  return new DelayedConnectionHandler({
    logger,
    connectionStore,
    sessionResolver,
    connectionFactory,
    delayLogParser,
    streamWrapper,
    delays,
  });
}
