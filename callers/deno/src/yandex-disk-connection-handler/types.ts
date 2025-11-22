/**
 * Типы и конфигурация для YandexDiskConnectionHandler
 */

import type { StorageProvider } from "../storage-provider/index.ts";
import type { ProtocolPaths } from "@shared/protocol/types.ts";

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
}

