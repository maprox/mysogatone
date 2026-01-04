/**
 * Чтение ответа от TCP соединения
 */

import { getLogger } from "@shared/logger/file-logger.ts";
import type { TcpConn, NetAddr } from "@src/connection/types.ts";

/**
 * Читает ответ от TCP соединения с таймаутом
 *
 * Для TLS handshake важно читать все доступные данные, так как сервер может отправлять
 * данные в несколько раундов (ServerHello, Certificate, ServerKeyExchange и т.д.)
 *
 * ВАЖНО: Для keep-alive соединений (HTTPS) эта функция читает только один ответ.
 * Следующие ответы будут прочитаны при обработке следующих запросов в той же сессии.
 */
export async function readResponse(
  conn: TcpConn,
  readTimeout: number = 5000,
): Promise<Uint8Array> {
  const logger = getLogger();
  const buffer = new Uint8Array(16384); // Увеличиваем буфер для TLS (может быть до 16KB)
  const chunks: Uint8Array[] = [];
  let lastReadTime = Date.now();
  const startTime = Date.now();

  // Проверяем состояние соединения перед чтением
  try {
    const remoteAddr = conn.remoteAddr as NetAddr;
    logger.info(
      `[readResponse] [${Date.now()}] 🔌 TCP соединение: ${remoteAddr.hostname}:${remoteAddr.port}, состояние: активно`,
    );
  } catch (e) {
    logger.info(
      `[readResponse] [${Date.now()}] ⚠️  Не удалось получить информацию о соединении:`,
      e,
    );
  }

  // Читаем данные до закрытия соединения или таймаута
  while (true) {
    const now = Date.now();

    // Проверяем общий таймаут: если прошло больше времени с начала чтения, завершаем
    if (now - startTime > readTimeout) {
      logger.info(
        `[readResponse] [${now}] Общий таймаут чтения (${readTimeout}ms), завершаем чтение`,
      );
      break;
    }

    // Проверяем таймаут бездействия: если прошло больше времени с последнего чтения, завершаем
    // Но только если уже есть данные (для TLS handshake сервер может отправлять данные с задержкой)
    // Для HTTPS увеличиваем таймаут бездействия до 10 секунд, так как TLS handshake может занимать больше времени
    const idleTimeout = readTimeout > 10000 ? 10000 : 5000; // 10 секунд для HTTPS, 5 секунд для остальных
    if (now - lastReadTime > idleTimeout && chunks.length > 0) {
      logger.info(
        `[readResponse] [${now}] Таймаут бездействия (${idleTimeout}ms), но есть данные (${chunks.length} чанков), завершаем`,
      );
      break;
    }

    // Пытаемся прочитать данные с небольшим таймаутом
    try {
      const iterationStart = Date.now();
      const readPromise = conn.read(buffer);
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 2000); // Увеличиваем до 2 секунд для TLS
      });

      const result = await Promise.race([readPromise, timeoutPromise]);
      const iterationTime = Date.now() - iterationStart;

      const now = Date.now();

      if (result === null) {
        // Таймаут чтения
        logger.info(
          `[readResponse] [${now}] ⏰ Таймаут чтения (${iterationTime}ms), chunks: ${chunks.length}, elapsed: ${
            now - startTime
          }ms`,
        );
        if (chunks.length > 0) {
          logger.info(
            `[readResponse] [${now}] Таймаут чтения, но есть данные (${chunks.length} чанков), завершаем`,
          );
          break;
        }
        // Если данных нет и прошло много времени, завершаем
        // Для HTTPS увеличиваем порог, так как сервер может отвечать с задержкой
        const noDataTimeout = readTimeout > 10000
          ? readTimeout * 0.6
          : readTimeout / 2; // 60% для HTTPS, 50% для остальных
        if (now - startTime > noDataTimeout) {
          logger.info(
            `[readResponse] [${now}] Таймаут чтения без данных, завершаем (прошло ${
              now - startTime
            }ms из ${readTimeout}ms, порог: ${noDataTimeout}ms)`,
          );
          // Проверяем, не закрыто ли соединение
          try {
            const testBuffer = new Uint8Array(1);
            const testRead = await conn.read(testBuffer);
            if (testRead === null) {
              logger.info(
                `[readResponse] [${now}] 🔌 Соединение закрыто сервером (обнаружено при проверке)`,
              );
            }
          } catch (testError) {
            logger.info(
              `[readResponse] [${now}] 🔌 Соединение закрыто сервером (ошибка при проверке: ${testError})`,
            );
          }
          break;
        }
        logger.info(`[readResponse] [${now}] Продолжаем ждать данные...`);
        continue;
      }

      const bytesRead = result;
      if (bytesRead === null) {
        // Соединение закрыто
        logger.info(
          `[readResponse] [${now}] 🔌 Соединение закрыто сервером (итерация: ${iterationTime}ms, всего: ${
            now - startTime
          }ms)`,
        );
        break;
      }

      if (bytesRead > 0) {
        chunks.push(buffer.slice(0, bytesRead));
        lastReadTime = now;
        logger.info(
          `[readResponse] [${now}] ✅ Прочитано ${bytesRead} байт за ${iterationTime}ms, всего чанков: ${chunks.length}, всего байт: ${
            chunks.reduce((sum, c) => sum + c.length, 0)
          }`,
        );
      } else {
        logger.info(
          `[readResponse] [${now}] ⚠️  Прочитано 0 байт за ${iterationTime}ms, продолжаем...`,
        );
      }
    } catch (error) {
      const now = Date.now();
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[readResponse] [${now}] ❌ Ошибка при чтении:`, error);

      // Проверяем, не закрыто ли соединение
      if (
        errorMsg.includes("10054") || errorMsg.includes("ConnectionReset") ||
        errorMsg.includes("Broken pipe") ||
        errorMsg.includes("connection closed")
      ) {
        logger.info(
          `[readResponse] [${now}] 🔌 Соединение закрыто сервером (обнаружено через ошибку)`,
        );
        // Если уже есть данные, возвращаем их вместо ошибки
        if (chunks.length > 0) {
          logger.info(
            `[readResponse] [${now}] Соединение закрыто, но есть данные, возвращаем их`,
          );
          break;
        }
        // Возвращаем пустой ответ вместо ошибки
        return new Uint8Array(0);
      }

      // Если уже есть данные, возвращаем их вместо ошибки
      if (chunks.length > 0) {
        logger.info(
          `[readResponse] [${now}] Ошибка при чтении, но есть данные, возвращаем их`,
        );
        break;
      }
      throw error;
    }
  }

  // Объединяем все чанки
  const endTime = Date.now();
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  logger.info(
    `[readResponse] [${endTime}] Всего прочитано: ${totalLength} байт из ${chunks.length} чанков`,
  );

  // Если данных нет, возвращаем пустой массив вместо ошибки
  // Это может быть нормально для некоторых протоколов или когда запрос был пустым
  if (totalLength === 0) {
    logger.warn(
      `[readResponse] [${endTime}] ⚠️  Данных не получено, возвращаем пустой ответ`,
    );
    return new Uint8Array(0);
  }

  const responseData = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    responseData.set(chunk, offset);
    offset += chunk.length;
  }

  const sum = responseData.reduce((a, b) => a + b, 0);
  logger.info(
    `[readResponse] [${endTime}] [DEBUG] Ответ собран: ${totalLength} байт, CRC-сумма: ${sum}`,
  );

  return responseData;
}
