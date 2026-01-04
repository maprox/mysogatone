/**
 * Типы для DirectConnectionHandler
 */

import type { Logger } from "@shared/logger/types.ts";
import type { TcpConn } from "@src/connection/types.ts";
import type { SessionInfo as BaseSessionInfo } from "@src/yandex-disk-connection-handler/session/types.ts";

/**
 * Интерфейс для логирования (реэкспорт из shared)
 */
export type { Logger };

/**
 * Интерфейс для менеджера сессий
 */
export interface SessionManager {
  /**
   * Получает существующую сессию или создает новую
   */
  getOrCreateSession(
    targetAddress: string,
    targetPort: number,
    clientConnId?: string,
  ): BaseSessionInfo;
}

/**
 * Интерфейс для хранилища соединений
 */
export interface ConnectionStore {
  /** Сохраняет соединение для указанной сессии */
  set(sessionId: string, connection: TcpConn): void;
  /** Получает соединение для указанной сессии */
  get(sessionId: string): TcpConn | undefined;
  /** Проверяет, существует ли соединение для указанной сессии */
  has(sessionId: string): boolean;
  /** Закрывает соединение для указанной сессии */
  close(sessionId: string): void;
  /** Закрывает все активные соединения */
  closeAll(): void;
  /** Возвращает количество активных соединений */
  size(): number;
}

/**
 * Интерфейс для фабрики соединений
 */
export interface ConnectionFactory {
  /**
   * Создает новое TCP соединение с указанным адресом и портом
   */
  create(
    targetAddress: string,
    targetPort: number,
  ): Promise<TcpConn>;
}

/**
 * Информация о сессии для установки соединения
 */
export interface SessionInfo {
  /** ID сессии */
  sessionId: string;
  /** Является ли это первым запросом в сессии */
  isFirstInSession: boolean;
  /** Нужно ли использовать сессии */
  useSessions: boolean;
}

/**
 * Интерфейс для резолвера сессий
 */
export interface SessionResolver {
  /**
   * Определяет, нужно ли использовать сессии для указанного порта
   */
  shouldUseSessions(targetPort: number): boolean;
  /**
   * Получает информацию о сессии для указанного адреса и порта
   */
  resolveSession(
    targetAddress: string,
    targetPort: number,
  ): SessionInfo;
}
