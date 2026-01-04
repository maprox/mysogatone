/**
 * Утилиты для работы с сессиями на стороне CALLER
 */

import { generateRequestId } from "@shared/protocol/utils.ts";

import type {
  Session,
  SessionInfo,
} from "@src/yandex-disk-connection-handler/session/types.ts";

export function shouldUsePersistentSession(targetPort: number): boolean {
  return targetPort === 443; // HTTPS
}

export function createEphemeralSession(): SessionInfo {
  return { sessionId: generateRequestId(), isFirstInSession: true };
}

export function createSession(
  targetAddress: string,
  targetPort: number,
  clientConnId?: string,
): Session {
  return {
    sessionId: generateRequestId(),
    targetAddress,
    targetPort,
    createdAt: new Date(),
    lastActivityAt: new Date(),
    requestIds: [],
    clientConnId,
  };
}

export function updateSessionActivity(session: Session): void {
  session.lastActivityAt = new Date();
}

export function findSessionByAddress(
  sessions: Map<string, Session>,
  targetAddress: string,
  targetPort: number,
): Session | undefined {
  for (const session of sessions.values()) {
    if (
      session.targetAddress === targetAddress &&
      session.targetPort === targetPort
    ) {
      return session;
    }
  }
  return undefined;
}

export function isSessionInactive(
  session: Session,
  maxIdleTime: number,
  now: number = Date.now(),
): boolean {
  return now - session.lastActivityAt.getTime() > maxIdleTime;
}

export function mapSessionToStats(
  session: Session,
  now: number = Date.now(),
) {
  return {
    sessionId: session.sessionId,
    targetAddress: session.targetAddress,
    targetPort: session.targetPort,
    requestCount: session.requestIds.length,
    age: now - session.createdAt.getTime(),
    idleTime: now - session.lastActivityAt.getTime(),
  };
}
