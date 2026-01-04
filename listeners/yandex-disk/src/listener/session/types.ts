/**
 * Типы для управления сессиями
 */

import type { TcpConn } from "@src/connection/types.ts";

export interface Session {
  sessionId: string;
  targetAddress: string;
  targetPort: number;
  tcpConnection: TcpConn;
  createdAt: Date;
  lastActivityAt: Date;
  requestIds: string[];
  // Общий reader для непрерывного чтения из соединения (как в DelayedConnectionHandler)
  reader: ReadableStreamDefaultReader<Uint8Array> | null;
  // Буфер для данных, прочитанных между раундами (для поддержания соединения активным)
  readBuffer: Uint8Array[];
  // Флаг, что чтение активно
  reading: boolean;
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
