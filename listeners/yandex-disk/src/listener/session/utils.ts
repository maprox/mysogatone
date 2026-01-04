/**
 * Утилиты для работы с сессиями
 */

import { getLogger } from "@shared/logger/file-logger.ts";
import type { TcpConn } from "@src/connection/types.ts";
import type { Session } from "@src/listener/session/types.ts";

export function updateSessionActivity(session: Session): void {
  session.lastActivityAt = new Date();
}

export function createSession(
  sessionId: string,
  targetAddress: string,
  targetPort: number,
  tcpConnection: TcpConn,
): Session {
  // Создаем общий reader для непрерывного чтения (как в DelayedConnectionHandler)
  const reader = tcpConnection.readable.getReader();

  return {
    sessionId,
    targetAddress,
    targetPort,
    tcpConnection,
    createdAt: new Date(),
    lastActivityAt: new Date(),
    requestIds: [],
    reader, // Общий reader для непрерывного чтения
    readBuffer: [], // Буфер для данных, прочитанных между раундами
    reading: false, // Флаг чтения
  };
}

export async function connectWithTimeout(
  targetAddress: string,
  targetPort: number,
  timeout: number,
): Promise<TcpConn> {
  const connectPromise = Deno.connect({
    hostname: targetAddress,
    port: targetPort,
  });
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(
      () => reject(new Error(`Connection timeout after ${timeout}ms`)),
      timeout,
    );
  });

  try {
    const conn = await Promise.race([connectPromise, timeoutPromise]);
    // Отключаем алгоритм Nagle для немедленной отправки данных (критично для TLS)
    conn.setNoDelay(true);
    console.log(
      `[connectWithTimeout] ✅ TCP_NODELAY установлен для ${targetAddress}:${targetPort}`,
    );
    return conn;
  } catch (error) {
    throw new Error(
      `Failed to connect to ${targetAddress}:${targetPort}: ${error}`,
    );
  }
}

export function closeConnection(conn: TcpConn, sessionId: string): void {
  try {
    conn.close();
    console.log(
      `[SessionManager] TCP соединение закрыто для сессии ${sessionId}`,
    );
  } catch (error) {
    console.warn(
      `[SessionManager] Ошибка при закрытии TCP соединения для сессии ${sessionId}:`,
      error,
    );
  }
}

export function isSessionInactive(
  session: Session,
  maxIdleTime: number,
  now: number = Date.now(),
): boolean {
  return now - session.lastActivityAt.getTime() > maxIdleTime;
}

export function mapSessionToStats(session: Session, now: number = Date.now()) {
  return {
    sessionId: session.sessionId,
    targetAddress: session.targetAddress,
    targetPort: session.targetPort,
    requestCount: session.requestIds.length,
    age: now - session.createdAt.getTime(),
    idleTime: now - session.lastActivityAt.getTime(),
  };
}

/**
 * Запускает непрерывное чтение из соединения для поддержания его активным между раундами
 * Прочитанные данные сохраняются в буфер сессии
 * Использует общий reader для сессии (как в DelayedConnectionHandler)
 */
export function startContinuousReading(session: Session): void {
  const logger = getLogger();

  if (session.reading) {
    logger.info(
      `[startContinuousReading] Непрерывное чтение уже активно для сессии ${session.sessionId}`,
    );
    return;
  }

  if (!session.reader) {
    logger.warn(
      `[startContinuousReading] ⚠️  Reader не найден для сессии ${session.sessionId}, создаем новый`,
    );
    session.reader = session.tcpConnection.readable.getReader();
  }

  session.reading = true;
  logger.info(
    `[startContinuousReading] Запуск непрерывного чтения для сессии ${session.sessionId}`,
  );

  // Запускаем непрерывное чтение асинхронно (как в DelayedConnectionHandler)
  (async () => {
    try {
      while (session.reading && session.reader) {
        try {
          // Читаем из reader (как в DelayedConnectionHandler)
          const result = await session.reader.read();

          if (result.done) {
            // Reader закрыт
            logger.info(
              `[startContinuousReading] Reader закрыт для сессии ${session.sessionId}`,
            );
            session.reading = false;
            break;
          }

          if (result.value && result.value.length > 0) {
            // Прочитали данные - сохраняем в буфер
            session.readBuffer.push(result.value);
            updateSessionActivity(session);
            logger.info(
              `[startContinuousReading] Прочитано ${result.value.length} байт для сессии ${session.sessionId}, буфер: ${session.readBuffer.length} чанков`,
            );
          }
        } catch (error) {
          const errorMsg = error instanceof Error
            ? error.message
            : String(error);
          if (
            errorMsg.includes("10054") ||
            errorMsg.includes("ConnectionReset") ||
            errorMsg.includes("Broken pipe") ||
            errorMsg.includes("connection closed") ||
            errorMsg.includes("Bad file descriptor")
          ) {
            logger.warn(
              `[startContinuousReading] ⚠️  Соединение закрыто для сессии ${session.sessionId}: ${errorMsg}`,
            );
            session.reading = false;
            break;
          }
          // Другие ошибки - логируем и продолжаем
          logger.warn(
            `[startContinuousReading] Ошибка при чтении для сессии ${session.sessionId}:`,
            error,
          );
          // Не останавливаем чтение при других ошибках - возможно, это временная проблема
        }
      }
    } catch (error) {
      logger.error(
        `[startContinuousReading] Критическая ошибка непрерывного чтения для сессии ${session.sessionId}:`,
        error,
      );
      session.reading = false;
    }
  })();
}

/**
 * Получает данные из буфера сессии и очищает буфер
 */
export function getBufferedData(session: Session): Uint8Array {
  const logger = getLogger();

  if (session.readBuffer.length === 0) {
    return new Uint8Array(0);
  }

  // Объединяем все чанки из буфера
  const totalLength = session.readBuffer.reduce(
    (sum, chunk) => sum + chunk.length,
    0,
  );
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of session.readBuffer) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  // Очищаем буфер
  session.readBuffer = [];
  logger.info(
    `[getBufferedData] Получено ${totalLength} байт из буфера сессии ${session.sessionId}`,
  );

  return result;
}

/**
 * Читает данные из reader сессии с таймаутом
 * Используется для чтения ответа, когда буфер пуст
 */
export async function readFromSessionReader(
  session: Session,
  timeout: number = 5000,
): Promise<Uint8Array> {
  const logger = getLogger();

  if (!session.reader) {
    throw new Error(`Reader не найден для сессии ${session.sessionId}`);
  }

  const chunks: Uint8Array[] = [];
  const startTime = Date.now();
  let lastReadTime = Date.now();

  try {
    while (true) {
      const now = Date.now();

      // Проверяем общий таймаут
      if (now - startTime > timeout) {
        logger.info(
          `[readFromSessionReader] Общий таймаут чтения (${timeout}ms) для сессии ${session.sessionId}`,
        );
        break;
      }

      // Проверяем таймаут бездействия
      const idleTimeout = timeout > 10000 ? 10000 : 5000;
      if (now - lastReadTime > idleTimeout && chunks.length > 0) {
        logger.info(
          `[readFromSessionReader] Таймаут бездействия (${idleTimeout}ms) для сессии ${session.sessionId}, но есть данные (${chunks.length} чанков)`,
        );
        break;
      }

      try {
        // Читаем из reader с таймаутом
        const readPromise = session.reader.read();
        const timeoutPromise = new Promise<{ done: true; value: undefined }>(
          (resolve) => {
            setTimeout(() => resolve({ done: true, value: undefined }), 2000);
          },
        );

        const result = await Promise.race([readPromise, timeoutPromise]);

        if (result.done) {
          logger.info(
            `[readFromSessionReader] Reader закрыт для сессии ${session.sessionId}`,
          );
          break;
        }

        if (result.value && result.value.length > 0) {
          chunks.push(result.value);
          lastReadTime = Date.now();
          updateSessionActivity(session);
        }
      } catch (readError) {
        const errorMsg = readError instanceof Error
          ? readError.message
          : String(readError);
        if (
          errorMsg.includes("10054") || errorMsg.includes("ConnectionReset") ||
          errorMsg.includes("Broken pipe") ||
          errorMsg.includes("connection closed")
        ) {
          logger.warn(
            `[readFromSessionReader] Соединение закрыто для сессии ${session.sessionId}: ${errorMsg}`,
          );
          break;
        }
        throw readError;
      }
    }
  } catch (error) {
    logger.error(
      `[readFromSessionReader] Ошибка при чтении для сессии ${session.sessionId}:`,
      error,
    );
    throw error;
  }

  // Объединяем все чанки
  if (chunks.length === 0) {
    return new Uint8Array(0);
  }

  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  logger.info(
    `[readFromSessionReader] Прочитано ${totalLength} байт для сессии ${session.sessionId} из ${chunks.length} чанков`,
  );
  return result;
}
