/**
 * Polling для проверки ответов от LISTENER
 */

import type { ProtocolPaths } from "@shared/protocol/paths.ts";
import { ErrorMetadata } from "@shared/protocol/types.ts";
import type { StorageProvider } from "@src/storage-provider/index.ts";
import type { FileInfo } from "@src/storage-provider/types.ts";
import type {
  ErrorCallback,
  ResponseCallback,
} from "@src/yandex-disk-connection-handler/response-poller/types.ts";

/**
 * Polling для проверки ответа от LISTENER
 */
export async function pollForResponse(
  requestId: string,
  storageProvider: StorageProvider,
  protocolPaths: ProtocolPaths,
  pollInterval: number,
  responseTimeout: number,
  onResponse: ResponseCallback,
  onError: ErrorCallback,
): Promise<void> {
  const startTime = Date.now();
  const responsePath = protocolPaths.response(requestId);
  const errorPath = protocolPaths.error(requestId);
  // Получаем имя папки из пути к файлу ответа
  const responsesFolder = responsePath.substring(
    0,
    responsePath.lastIndexOf("/"),
  );

  console.log(
    `[pollForResponse] [${startTime}] Начало polling для ${requestId}, папка ответов: ${responsesFolder}`,
  );
  console.log(
    `[pollForResponse] [${startTime}] Ищем файл ответа: ${responsePath}`,
  );
  console.log(
    `[pollForResponse] [${startTime}] Ищем файл ошибки: ${errorPath}`,
  );

  let pollIteration = 0;
  let lastPollTime = startTime;

  while (Date.now() - startTime < responseTimeout) {
    try {
      const pollStartTime = Date.now();
      const timeSinceLastPoll = pollStartTime - lastPollTime;
      lastPollTime = pollStartTime;

      // Логируем задержку между polling итерациями
      if (pollIteration > 0 && timeSinceLastPoll > 0) {
        await logDelay("pollForResponse", {
          requestId,
          stage: "poll_interval",
          delay: timeSinceLastPoll,
          pollIteration,
          timestamp: pollStartTime,
        });
      }

      // Проверяем наличие ответа
      const listStartTime = Date.now();
      const files = await storageProvider.listFiles(responsesFolder);
      const listEndTime = Date.now();
      const listDelay = listEndTime - listStartTime;

      pollIteration++;
      console.log(
        `[pollForResponse] [${pollStartTime}] Проверка ответа для ${requestId} (итерация ${pollIteration}), найдено файлов: ${files.length}, задержка listFiles: ${listDelay}ms`,
      );
      if (files.length > 0) {
        console.log(
          `[pollForResponse] [${pollStartTime}] Найденные файлы: ${
            files.map((f) => f.path).join(", ")
          }`,
        );
      }

      await logDelay("pollForResponse", {
        requestId,
        stage: "list_files",
        delay: listDelay,
        pollIteration,
        filesCount: files.length,
        timestamp: listEndTime,
      });

      // Нормализуем пути для сравнения (убираем префикс "disk:" и начальный "/" если есть)
      const normalizePath = (path: string): string => {
        let normalized = path.startsWith("disk:") ? path.substring(5) : path;
        // Убираем начальный "/" если есть
        if (normalized.startsWith("/")) {
          normalized = normalized.substring(1);
        }
        return normalized;
      };

      const normalizedResponsePath = normalizePath(responsePath);
      const normalizedErrorPath = normalizePath(errorPath);

      console.log(
        `[pollForResponse] Нормализованный путь ответа: "${normalizedResponsePath}"`,
      );
      console.log(
        `[pollForResponse] Нормализованный путь ошибки: "${normalizedErrorPath}"`,
      );

      const responseFile = files.find((f: FileInfo) => {
        const normalized = normalizePath(f.path);
        console.log(
          `[pollForResponse] Сравнение: "${normalized}" === "${normalizedResponsePath}" ? ${
            normalized === normalizedResponsePath
          }`,
        );
        return normalized === normalizedResponsePath;
      });
      const errorFile = files.find((f: FileInfo) =>
        normalizePath(f.path) === normalizedErrorPath
      );

      if (responseFile) {
        console.log(
          `[pollForResponse] ✅ Найден файл ответа: ${responseFile.path}`,
        );
      } else {
        console.log(
          `[pollForResponse] ⏳ Файл ответа не найден, ищем: ${responsePath}`,
        );
      }

      if (responseFile) {
        // Читаем ответ
        const responseFoundTime = Date.now();
        const totalPollTime = responseFoundTime - startTime;
        console.log(
          `[pollForResponse] [${responseFoundTime}] ✅ Найден файл ответа для ${requestId}: ${responsePath}, общее время polling: ${totalPollTime}ms`,
        );

        const downloadStartTime = Date.now();
        const responseData = await storageProvider.downloadFile(responsePath);
        const downloadEndTime = Date.now();
        const downloadDelay = downloadEndTime - downloadStartTime;

        const sum = responseData.reduce((a, b) => a + b, 0);
        console.log(
          `[pollForResponse] [${downloadEndTime}] Ответ прочитан: ${responseData.length} байт, CRC-сумма: ${sum}, задержка загрузки: ${downloadDelay}ms`,
        );

        // Удаляем файл ответа
        const deleteStartTime = Date.now();
        await storageProvider.deleteFile(responsePath);
        const deleteEndTime = Date.now();
        const deleteDelay = deleteEndTime - deleteStartTime;
        console.log(
          `[pollForResponse] [${deleteEndTime}] Файл ответа удален, задержка удаления: ${deleteDelay}ms`,
        );

        await logDelay("pollForResponse", {
          requestId,
          stage: "response_received",
          delay: downloadDelay,
          totalDelay: totalPollTime,
          deleteDelay,
          dataSize: responseData.length,
          pollIteration,
          timestamp: deleteEndTime,
        });

        // КРИТИЧНО: Ждем завершения callback, чтобы избежать race condition
        // Если callback асинхронный, нужно дождаться его завершения
        const responseResult = onResponse(responseData);
        if (responseResult) {
          await responseResult;
        }
        return;
      }

      if (errorFile) {
        // Читаем ошибку
        const errorData = await storageProvider.downloadFile(errorPath);
        const errorJson = new TextDecoder().decode(errorData);
        const errorMetadata: ErrorMetadata = JSON.parse(errorJson);

        // Удаляем файл ошибки
        await storageProvider.deleteFile(errorPath);

        const error = new Error(errorMetadata.error);
        (error as Error & { code?: string }).code = errorMetadata.code;
        onError(error);
        return;
      }

      // Ждем перед следующей проверкой
      const waitStartTime = Date.now();
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      const waitEndTime = Date.now();
      const actualWaitDelay = waitEndTime - waitStartTime;

      if (actualWaitDelay > pollInterval + 10) {
        // Если реальная задержка больше ожидаемой, логируем
        await logDelay("pollForResponse", {
          requestId,
          stage: "wait_interval",
          delay: actualWaitDelay,
          expectedDelay: pollInterval,
          pollIteration,
          timestamp: waitEndTime,
        });
      }
    } catch (err) {
      // Если ошибка при проверке, продолжаем polling
      console.error(
        `[pollForResponse] [${Date.now()}] Error polling for response ${requestId}:`,
        err,
      );
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }

  // Таймаут
  const timeoutTime = Date.now();
  const totalTime = timeoutTime - startTime;
  await logDelay("pollForResponse", {
    requestId,
    stage: "timeout",
    delay: totalTime,
    expectedDelay: responseTimeout,
    pollIteration,
    timestamp: timeoutTime,
  });

  onError(new Error(`Response timeout after ${responseTimeout}ms`));
}

/**
 * Логирует задержку в файл
 */
async function logDelay(
  operation: string,
  data: {
    requestId: string;
    stage: string;
    delay: number;
    totalDelay?: number;
    expectedDelay?: number;
    deleteDelay?: number;
    dataSize?: number;
    pollIteration?: number;
    filesCount?: number;
    timestamp: number;
  },
): Promise<void> {
  try {
    const logEntry = JSON.stringify({
      operation,
      ...data,
    }) + "\n";

    const logPath = "delay-log.jsonl";
    const cwd = Deno.cwd();
    const fullPath = `${cwd}/${logPath}`;

    await Deno.writeTextFile(
      logPath,
      logEntry,
      { append: true, create: true },
    );

    console.log(
      `[logDelay] ✅ Записано в ${fullPath}: ${operation}/${data.stage}, delay=${data.delay}ms`,
    );
  } catch (err) {
    // Выводим ошибку явно для отладки
    const cwd = Deno.cwd();
    console.error(`[logDelay] ❌ Ошибка записи в лог delay-log.jsonl:`, err);
    console.error(`[logDelay] Текущая рабочая директория: ${cwd}`);
    console.error(`[logDelay] Полный путь: ${cwd}/delay-log.jsonl`);
  }
}
