/**
 * Сервис для управления хранением и жизненным циклом TCP соединений.
 * Отвечает за создание, хранение и закрытие TCP соединений по sessionId.
 */

import type { TcpConn } from "@src/connection/types.ts";

import type {
  ConnectionStore as ConnectionStoreInterface,
  Logger,
} from "./types.ts";

/**
 * Хранилище активных TCP соединений
 */
export class ConnectionStore implements ConnectionStoreInterface {
  private connections = new Map<string, TcpConn>();

  constructor(private logger: Logger) {}

  /**
   * Сохраняет соединение для указанной сессии
   */
  set(sessionId: string, connection: TcpConn): void {
    this.connections.set(sessionId, connection);
  }

  /**
   * Получает соединение для указанной сессии
   */
  get(sessionId: string): TcpConn | undefined {
    return this.connections.get(sessionId);
  }

  /**
   * Проверяет, существует ли соединение для указанной сессии
   */
  has(sessionId: string): boolean {
    return this.connections.has(sessionId);
  }

  /**
   * Закрывает соединение для указанной сессии
   */
  close(sessionId: string): void {
    const conn = this.connections.get(sessionId);
    if (conn) {
      try {
        conn.close();
        this.connections.delete(sessionId);
        this.logger.info(`Закрыто соединение для сессии ${sessionId}`);
      } catch (error) {
        this.logger.warn(`Ошибка при закрытии соединения ${sessionId}:`, error);
      }
    }
  }

  /**
   * Закрывает все активные соединения
   */
  closeAll(): void {
    for (const [sessionId, conn] of this.connections) {
      try {
        conn.close();
        this.logger.info(`Закрыто соединение для сессии ${sessionId}`);
      } catch (error) {
        this.logger.warn(`Ошибка при закрытии соединения ${sessionId}:`, error);
      }
    }
    this.connections.clear();
  }

  /**
   * Возвращает количество активных соединений
   */
  size(): number {
    return this.connections.size;
  }
}
