/**
 * Фабрика для создания DirectConnectionHandler с дефолтными реализациями.
 * Создает все необходимые зависимости и собирает DirectConnectionHandler.
 */

import { ConsoleLoggerAdapter } from "@shared/logger/console-logger.ts";

import { ConnectionFactory } from "./connection-factory.ts";
import { ConnectionStore } from "./connection-store.ts";
import { DirectConnectionHandler } from "./index.ts";
import { SessionResolver } from "./session-resolver.ts";
import type { SessionManager } from "./types.ts";

/**
 * Конфигурация для фабрики DirectConnectionHandler
 */
export interface DirectConnectionHandlerFactoryConfig {
  /** Менеджер сессий для поддержки постоянных соединений (HTTPS) */
  sessionManager?: SessionManager;
  /** Логгер для записи сообщений (если не указан, используется ConsoleLoggerAdapter) */
  logger?: import("./types.ts").Logger;
}

/**
 * Создает DirectConnectionHandler с дефолтными реализациями всех зависимостей
 */
export function createDirectConnectionHandler(
  config: DirectConnectionHandlerFactoryConfig = {},
): DirectConnectionHandler {
  const logger = config.logger ??
    new ConsoleLoggerAdapter("DirectConnectionHandler");
  const connectionStore = new ConnectionStore(logger);
  const sessionResolver = new SessionResolver(config.sessionManager);
  const connectionFactory = new ConnectionFactory(logger);

  return new DirectConnectionHandler({
    logger,
    connectionStore,
    sessionResolver,
    connectionFactory,
  });
}
