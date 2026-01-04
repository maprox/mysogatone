/**
 * Управление сессиями для поддержки постоянных TCP соединений
 */

import type { Session, SessionStats } from "@src/listener/session/types.ts";
import {
  closeConnection,
  connectWithTimeout,
  createSession,
  getBufferedData,
  isSessionInactive,
  mapSessionToStats,
  readFromSessionReader,
  startContinuousReading,
  updateSessionActivity,
} from "@src/listener/session/utils.ts";

export class SessionManager {
  private sessions = new Map<string, Session>();

  async getOrCreateSession(
    sessionId: string,
    targetAddress: string,
    targetPort: number,
    isFirstInSession: boolean,
    connectionTimeout: number = 60000,
  ): Promise<Session> {
    if (!isFirstInSession) {
      const existing = this.sessions.get(sessionId);
      if (!existing) {
        throw new Error(
          `Session ${sessionId} not found, but isFirstInSession=false`,
        );
      }
      updateSessionActivity(existing);
      return existing;
    }

    return await this.createSession(
      sessionId,
      targetAddress,
      targetPort,
      connectionTimeout,
    );
  }

  private async createSession(
    sessionId: string,
    targetAddress: string,
    targetPort: number,
    connectionTimeout: number,
  ): Promise<Session> {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      console.log(
        `[SessionManager] Сессия ${sessionId} уже существует, переиспользуем`,
      );
      updateSessionActivity(existing);
      return existing;
    }

    console.log(
      `[SessionManager] Создание новой сессии ${sessionId} для ${targetAddress}:${targetPort}`,
    );

    const tcpConnection = await connectWithTimeout(
      targetAddress,
      targetPort,
      connectionTimeout,
    );
    const session = createSession(
      sessionId,
      targetAddress,
      targetPort,
      tcpConnection,
    );

    this.sessions.set(sessionId, session);
    console.log(
      `[SessionManager] Сессия ${sessionId} создана, TCP соединение установлено`,
    );

    return session;
  }

  addRequestToSession(sessionId: string, requestId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.requestIds.push(requestId);
      updateSessionActivity(session);
    }
  }

  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Останавливаем непрерывное чтение
    session.reading = false;

    // Освобождаем reader
    if (session.reader) {
      try {
        session.reader.releaseLock();
      } catch (_e) {
        // Игнорируем ошибки при освобождении lock
      }
      session.reader = null;
    }

    closeConnection(session.tcpConnection, sessionId);
    this.sessions.delete(sessionId);
    console.log(
      `[SessionManager] Сессия ${sessionId} закрыта (${session.requestIds.length} запросов)`,
    );
  }

  /**
   * Запускает непрерывное чтение для сессии (для поддержания соединения активным между раундами)
   */
  startContinuousReading(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      startContinuousReading(session);
    }
  }

  /**
   * Получает данные из буфера сессии (прочитанные между раундами)
   */
  getBufferedData(sessionId: string): Uint8Array {
    const session = this.sessions.get(sessionId);
    if (session) {
      return getBufferedData(session);
    }
    return new Uint8Array(0);
  }

  /**
   * Читает данные из reader сессии с таймаутом
   * Используется для чтения ответа, когда буфер пуст
   */
  async readFromSessionReader(
    sessionId: string,
    timeout: number = 5000,
  ): Promise<Uint8Array> {
    const session = this.sessions.get(sessionId);
    if (session && session.reader) {
      return await readFromSessionReader(session, timeout);
    }
    return new Uint8Array(0);
  }

  cleanupInactiveSessions(maxIdleTime: number = 60000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions) {
      if (isSessionInactive(session, maxIdleTime, now)) {
        this.closeSession(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(
        `[SessionManager] Очищено ${cleaned} неактивных сессий (idle > ${maxIdleTime}ms)`,
      );
    }

    return cleaned;
  }

  getStats(): SessionStats {
    const now = Date.now();
    return {
      totalSessions: this.sessions.size,
      sessions: Array.from(this.sessions.values()).map((s) =>
        mapSessionToStats(s, now)
      ),
    };
  }

  closeAllSessions(): void {
    for (const sessionId of this.sessions.keys()) {
      this.closeSession(sessionId);
    }
  }
}
