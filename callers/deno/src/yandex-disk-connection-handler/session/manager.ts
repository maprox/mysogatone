/**
 * Управление сессиями для поддержки постоянных соединений
 */

import type {
  Session,
  SessionInfo,
  SessionStats,
} from "@src/yandex-disk-connection-handler/session/types.ts";
import {
  createEphemeralSession,
  createSession,
  findSessionByAddress,
  isSessionInactive,
  mapSessionToStats,
  shouldUsePersistentSession,
  updateSessionActivity,
} from "@src/yandex-disk-connection-handler/session/utils.ts";

export class SessionManager {
  private sessions = new Map<string, Session>();
  private clientConnToSession = new Map<string, string>();

  getOrCreateSession(
    targetAddress: string,
    targetPort: number,
    clientConnId?: string,
  ): SessionInfo {
    if (!shouldUsePersistentSession(targetPort)) {
      return createEphemeralSession();
    }

    const existing = findSessionByAddress(
      this.sessions,
      targetAddress,
      targetPort,
    );
    if (existing) {
      return this.reuseSession(existing, clientConnId);
    }

    return this.createNewSession(targetAddress, targetPort, clientConnId);
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

  getSessionByClientConn(clientConnId: string): Session | undefined {
    const sessionId = this.clientConnToSession.get(clientConnId);
    return sessionId ? this.sessions.get(sessionId) : undefined;
  }

  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.log(
        `[SessionManager] Попытка закрыть несуществующую сессию ${sessionId}`,
      );
      return;
    }

    console.log(
      `[SessionManager] Закрытие сессии ${sessionId} для ${session.targetAddress}:${session.targetPort} (${session.requestIds.length} запросов)`,
    );
    this.unmapClientConn(session);
    this.sessions.delete(sessionId);
    console.log(
      `[SessionManager] Сессия ${sessionId} закрыта (${session.requestIds.length} запросов)`,
    );
  }

  closeSessionByClientConn(clientConnId: string): void {
    console.log(
      `[SessionManager] closeSessionByClientConn вызван для clientConnId: ${clientConnId}`,
    );
    const sessionId = this.clientConnToSession.get(clientConnId);
    if (sessionId) {
      console.log(
        `[SessionManager] Найдена сессия ${sessionId} для clientConnId: ${clientConnId}, закрываем`,
      );
      this.closeSession(sessionId);
    } else {
      console.log(
        `[SessionManager] Сессия не найдена для clientConnId: ${clientConnId}`,
      );
    }
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

  private reuseSession(session: Session, clientConnId?: string): SessionInfo {
    updateSessionActivity(session);
    if (clientConnId) {
      this.clientConnToSession.set(clientConnId, session.sessionId);
    }
    return { sessionId: session.sessionId, isFirstInSession: false };
  }

  private createNewSession(
    targetAddress: string,
    targetPort: number,
    clientConnId?: string,
  ): SessionInfo {
    const session = createSession(targetAddress, targetPort, clientConnId);
    this.sessions.set(session.sessionId, session);
    if (clientConnId) {
      this.clientConnToSession.set(clientConnId, session.sessionId);
    }
    console.log(
      `[SessionManager] Создана сессия ${session.sessionId} для ${targetAddress}:${targetPort}`,
    );
    return { sessionId: session.sessionId, isFirstInSession: true };
  }

  private unmapClientConn(session: Session): void {
    if (session.clientConnId) {
      this.clientConnToSession.delete(session.clientConnId);
    }
  }
}
