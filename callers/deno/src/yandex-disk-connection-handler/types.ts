/**
 * Типы и конфигурация для YandexDiskConnectionHandler
 */

import type { ProtocolPaths } from "@shared/protocol/paths.ts";
import type { StorageProvider } from "@src/storage-provider/index.ts";
import type { SessionManager } from "@src/yandex-disk-connection-handler/session/manager.ts";

/**
 * Конфигурация для ConnectionHandler
 */
export interface YandexDiskConnectionHandlerConfig {
  /** Провайдер хранилища */
  storageProvider: StorageProvider;
  /** Пути к папкам протокола */
  protocolPaths: ProtocolPaths;
  /** Интервал polling для проверки ответов (в миллисекундах) */
  pollInterval: number;
  /** Таймаут ожидания ответа (в миллисекундах) */
  responseTimeout: number;
  /** Менеджер сессий для поддержки постоянных соединений */
  sessionManager?: SessionManager;
}
