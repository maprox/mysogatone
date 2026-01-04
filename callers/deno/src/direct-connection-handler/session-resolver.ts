/**
 * Сервис для определения логики работы с сессиями.
 * Отвечает за определение необходимости использования сессий и получение информации о сессии.
 */

import type {
  SessionInfo,
  SessionManager as SessionManagerInterface,
  SessionResolver as SessionResolverInterface,
} from "./types.ts";

/**
 * Сервис для работы с сессиями при установке соединений
 */
export class SessionResolver implements SessionResolverInterface {
  constructor(private sessionManager?: SessionManagerInterface) {}

  /**
   * Определяет, нужно ли использовать сессии для указанного порта
   */
  shouldUseSessions(targetPort: number): boolean {
    return this.sessionManager !== undefined && targetPort === 443;
  }

  /**
   * Получает информацию о сессии для указанного адреса и порта
   */
  resolveSession(
    targetAddress: string,
    targetPort: number,
  ): SessionInfo {
    const useSessions = this.shouldUseSessions(targetPort);

    if (!useSessions || !this.sessionManager) {
      return {
        sessionId: "",
        isFirstInSession: true,
        useSessions: false,
      };
    }

    const sessionInfo = this.sessionManager.getOrCreateSession(
      targetAddress,
      targetPort,
    );

    return {
      sessionId: sessionInfo.sessionId,
      isFirstInSession: sessionInfo.isFirstInSession,
      useSessions: true,
    };
  }
}
