/**
 * Типы для управления сессиями на стороне CALLER
 */

export interface Session {
  sessionId: string;
  targetAddress: string;
  targetPort: number;
  createdAt: Date;
  lastActivityAt: Date;
  requestIds: string[];
  clientConnId?: string;
}

export interface SessionInfo {
  sessionId: string;
  isFirstInSession: boolean;
}

export interface SessionStats {
  totalSessions: number;
  sessions: Array<{
    sessionId: string;
    targetAddress: string;
    targetPort: number;
    requestCount: number;
    age: number;
    idleTime: number;
  }>;
}
