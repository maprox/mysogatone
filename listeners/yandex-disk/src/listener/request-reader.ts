/**
 * Чтение запросов из хранилища
 */

import type { ProtocolPaths } from "@shared/protocol/paths.ts";
import type { RequestMetadata } from "@shared/protocol/types.ts";
import { sleep } from "@src/listener/utils.ts";
import type { StorageProvider } from "@src/storage-provider/index.ts";

/**
 * Читает и валидирует метаданные запроса
 */
export async function readRequestMetadata(
  requestId: string,
  storageProvider: StorageProvider,
  protocolPaths: ProtocolPaths,
): Promise<RequestMetadata> {
  const metadataPath = protocolPaths.requestMetadata(requestId);
  const metadataFile = await storageProvider.downloadFile(metadataPath);
  const metadataText = new TextDecoder().decode(metadataFile);
  const metadata: RequestMetadata = JSON.parse(metadataText);

  // Валидация метаданных
  if (!metadata.targetAddress || !metadata.targetPort) {
    throw new Error(
      "Invalid request metadata: missing targetAddress or targetPort",
    );
  }

  if (metadata.targetPort < 1 || metadata.targetPort > 65535) {
    throw new Error(`Invalid targetPort: ${metadata.targetPort}`);
  }

  return metadata;
}

/**
 * Читает данные запроса из чанков, ожидая файл .ready если необходимо
 * Использует режим с отдельными файлами .chunk.N для каждого чанка + файл .ready с метаданными
 */
export async function readRequestData(
  requestId: string,
  storageProvider: StorageProvider,
  protocolPaths: ProtocolPaths,
  maxWaitTime: number = 60000, // Увеличено до 60 секунд для ожидания загрузки данных от CALLER
  checkInterval: number = 1000, // Увеличено до 1 секунды
): Promise<Uint8Array> {
  const readyPath = protocolPaths.requestDataReady(requestId);

  // Проверяем, является ли ошибка ошибкой "файл не найден" (404)
  const isFileNotFoundError = (error: unknown): boolean => {
    // Проверяем различные типы ошибок
    if (error && typeof error === "object" && "statusCode" in error) {
      const statusCode = (error as { statusCode: number }).statusCode;
      return statusCode === 404;
    }
    if (error instanceof Error) {
      // Проверяем сообщение об ошибке
      const message = error.message.toLowerCase();
      return message.includes("404") ||
        message.includes("not found") ||
        message.includes("файл не найден");
    }
    return false;
  };

  // Ожидаем появления файла .ready и проверяем его стабильность
  // Файл может быть обновлен несколько раз (при первом чанке и при close())
  // Нужно убедиться, что файл стабилен перед чтением чанков
  const startTime = Date.now();
  let attempt = 0;
  let readyInfo: { totalChunks: number; totalBytes: number } | null = null;
  let lastReadyInfo: { totalChunks: number; totalBytes: number } | null = null;
  let stableCount = 0;
  const requiredStableChecks = 2; // Требуемое количество проверок со стабильным содержимым

  while (Date.now() - startTime < maxWaitTime) {
    attempt++;
    try {
      const readyData = await storageProvider.downloadFile(readyPath);
      const parsedReadyInfo = JSON.parse(
        new TextDecoder().decode(readyData),
      ) as { totalChunks: number; totalBytes: number };

      // Проверяем, изменился ли файл
      if (
        lastReadyInfo &&
        (lastReadyInfo.totalChunks !== parsedReadyInfo.totalChunks ||
          lastReadyInfo.totalBytes !== parsedReadyInfo.totalBytes)
      ) {
        // Файл изменился, сбрасываем счетчик стабильности
        console.log(
          `[readRequestData] Файл готовности изменился для ${requestId}: ${lastReadyInfo.totalChunks}→${parsedReadyInfo.totalChunks} чанков, ${lastReadyInfo.totalBytes}→${parsedReadyInfo.totalBytes} байт, ждем стабилизации...`,
        );
        stableCount = 0;
        lastReadyInfo = parsedReadyInfo;
        await sleep(checkInterval);
        continue;
      }

      // Файл не изменился, увеличиваем счетчик стабильности
      if (
        lastReadyInfo &&
        lastReadyInfo.totalChunks === parsedReadyInfo.totalChunks &&
        lastReadyInfo.totalBytes === parsedReadyInfo.totalBytes
      ) {
        stableCount++;
      } else {
        // Первое обнаружение файла
        lastReadyInfo = parsedReadyInfo;
        stableCount = 1;
      }

      // Если файл стабилен достаточное количество проверок, используем его
      if (stableCount >= requiredStableChecks) {
        readyInfo = parsedReadyInfo;
        console.log(
          `[readRequestData] Файл готовности стабилен для ${requestId} после ${attempt} попыток: ${parsedReadyInfo.totalChunks} чанков, ${parsedReadyInfo.totalBytes} байт`,
        );
        break;
      } else {
        // Файл найден, но еще не стабилен
        if (attempt % 3 === 0) {
          console.log(
            `[readRequestData] Файл готовности найден для ${requestId}, но еще не стабилен (${stableCount}/${requiredStableChecks}), продолжаем проверку...`,
          );
        }
        await sleep(checkInterval);
        continue;
      }
    } catch (error) {
      // Если это ошибка "файл не найден", продолжаем ждать
      if (isFileNotFoundError(error)) {
        stableCount = 0;
        lastReadyInfo = null;
        if (attempt % 5 === 0) { // Логируем каждую 5-ю попытку, чтобы не спамить
          console.log(
            `⏳ Попытка ${attempt}: файл готовности для ${requestId} еще не найден (404), продолжаем ожидание...`,
          );
        }
        await sleep(checkInterval);
        continue;
      }
      // Другая ошибка - логируем детали и продолжаем ждать
      const errorDetails = error instanceof Error
        ? `${error.name}: ${error.message}${
          error instanceof Error && "statusCode" in error
            ? ` (status: ${(error as { statusCode: number }).statusCode})`
            : ""
        }`
        : String(error);
      console.log(
        `⏳ Попытка ${attempt}: ошибка при чтении файла готовности для ${requestId}: ${errorDetails}, продолжаем ожидание...`,
      );
      await sleep(checkInterval);
    }
  }

  // Если файл готовности не появился за отведенное время, возвращаем пустой массив
  if (!readyInfo) {
    console.log(
      `⚠️  Файл готовности ${readyPath} не найден после ожидания ${maxWaitTime}ms (${attempt} попыток), используем пустые данные`,
    );
    return new Uint8Array(0);
  }

  // Читаем все чанки и объединяем их
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  const totalChunks = readyInfo.totalChunks;
  const expectedTotalBytes = readyInfo.totalBytes;

  for (let i = 0; i < totalChunks; i++) {
    const chunkPath = protocolPaths.requestDataChunk(requestId, i);
    try {
      const chunkData = await storageProvider.downloadFile(chunkPath);
      chunks.push(chunkData);
      totalBytes += chunkData.length;
      console.log(
        `[readRequestData] Чанк #${i} прочитан для ${requestId}: ${chunkData.length} байт`,
      );
    } catch (err) {
      console.error(
        `[readRequestData] Ошибка при чтении чанка #${i} для ${requestId}:`,
        err,
      );
      throw new Error(`Failed to read chunk ${i} for ${requestId}`);
    }
  }

  // Объединяем все чанки в правильном порядке
  const combinedData = new Uint8Array(totalBytes);
  let offset = 0;
  for (let i = 0; i < chunks.length; i++) {
    combinedData.set(chunks[i], offset);
    offset += chunks[i].length;
  }

  if (totalBytes !== expectedTotalBytes) {
    console.warn(
      `[readRequestData] ⚠️  Несоответствие размеров для ${requestId}: ожидалось ${expectedTotalBytes}, получено ${totalBytes}`,
    );
  }

  console.log(
    `[readRequestData] ✅ Все чанки объединены для ${requestId}: ${totalBytes} байт из ${totalChunks} чанков`,
  );
  return combinedData;
}

/**
 * Читает данные запроса потоково, отправляя чанки по мере их чтения
 * Возвращает ReadableStream для потоковой отправки на GOAL
 */
export function readRequestDataStream(
  requestId: string,
  storageProvider: StorageProvider,
  protocolPaths: ProtocolPaths,
  maxWaitTime: number = 60000,
  checkInterval: number = 1000,
): ReadableStream<Uint8Array> {
  const readyPath = protocolPaths.requestDataReady(requestId);
  let readyInfo: { totalChunks: number; totalBytes: number } | null = null;
  let totalBytesRead = 0;

  // Проверяем, является ли ошибка ошибкой "файл не найден" (404)
  const isFileNotFoundError = (error: unknown): boolean => {
    if (error && typeof error === "object" && "statusCode" in error) {
      const statusCode = (error as { statusCode: number }).statusCode;
      return statusCode === 404;
    }
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return message.includes("404") ||
        message.includes("not found") ||
        message.includes("файл не найден");
    }
    return false;
  };

  return new ReadableStream({
    async start(controller) {
      // Ожидаем появления файла .ready
      const startTime = Date.now();
      let attempt = 0;
      let lastReadyInfo: { totalChunks: number; totalBytes: number } | null =
        null;
      let stableCount = 0;
      const requiredStableChecks = 2;

      while (Date.now() - startTime < maxWaitTime) {
        attempt++;
        try {
          const readyData = await storageProvider.downloadFile(readyPath);
          const parsedReadyInfo = JSON.parse(
            new TextDecoder().decode(readyData),
          ) as { totalChunks: number; totalBytes: number };

          const checkTime = Date.now();
          // Проверяем, изменился ли файл
          if (
            lastReadyInfo &&
            (lastReadyInfo.totalChunks !== parsedReadyInfo.totalChunks ||
              lastReadyInfo.totalBytes !== parsedReadyInfo.totalBytes)
          ) {
            console.log(
              `[readRequestDataStream] [${checkTime}] Файл готовности изменился для ${requestId}: ${lastReadyInfo.totalChunks}→${parsedReadyInfo.totalChunks} чанков, ${lastReadyInfo.totalBytes}→${parsedReadyInfo.totalBytes} байт, ждем стабилизации...`,
            );
            stableCount = 0;
            lastReadyInfo = parsedReadyInfo;
            await sleep(checkInterval);
            continue;
          }

          if (
            lastReadyInfo &&
            lastReadyInfo.totalChunks === parsedReadyInfo.totalChunks &&
            lastReadyInfo.totalBytes === parsedReadyInfo.totalBytes
          ) {
            stableCount++;
          } else {
            lastReadyInfo = parsedReadyInfo;
            stableCount = 1;
          }

          if (stableCount >= requiredStableChecks) {
            readyInfo = parsedReadyInfo;
            const stableTime = Date.now();
            console.log(
              `[readRequestDataStream] [${stableTime}] Файл готовности стабилен для ${requestId}: ${parsedReadyInfo.totalChunks} чанков, ${parsedReadyInfo.totalBytes} байт`,
            );
            break;
          } else {
            if (attempt % 3 === 0) {
              const checkTime = Date.now();
              console.log(
                `[readRequestDataStream] [${checkTime}] Файл готовности найден для ${requestId}, но еще не стабилен (${stableCount}/${requiredStableChecks})...`,
              );
            }
            await sleep(checkInterval);
            continue;
          }
        } catch (error) {
          const errorTime = Date.now();
          if (isFileNotFoundError(error)) {
            stableCount = 0;
            lastReadyInfo = null;
            if (attempt % 5 === 0) {
              console.log(
                `[readRequestDataStream] [${errorTime}] ⏳ Попытка ${attempt}: файл готовности для ${requestId} еще не найден (404)...`,
              );
            }
            await sleep(checkInterval);
            continue;
          }
          const errorDetails = error instanceof Error
            ? `${error.name}: ${error.message}`
            : String(error);
          console.log(
            `[readRequestDataStream] [${errorTime}] ⏳ Попытка ${attempt}: ошибка при чтении файла готовности для ${requestId}: ${errorDetails}...`,
          );
          await sleep(checkInterval);
        }
      }

      if (!readyInfo) {
        const noReadyTime = Date.now();
        console.log(
          `[readRequestDataStream] [${noReadyTime}] ⚠️  Файл готовности ${readyPath} не найден после ожидания ${maxWaitTime}ms, закрываем поток`,
        );
        controller.close();
        return;
      }

      // Читаем и отправляем чанки потоково
      const totalChunks = readyInfo.totalChunks;
      const expectedTotalBytes = readyInfo.totalBytes;

      for (let i = 0; i < totalChunks; i++) {
        const chunkPath = protocolPaths.requestDataChunk(requestId, i);
        try {
          const chunkReadStart = Date.now();
          const chunkData = await storageProvider.downloadFile(chunkPath);
          const chunkReadEnd = Date.now();
          totalBytesRead += chunkData.length;
          console.log(
            `[readRequestDataStream] [${chunkReadEnd}] Чанк #${i} прочитан для ${requestId}: ${chunkData.length} байт, отправляем в поток... (задержка чтения: ${
              chunkReadEnd - chunkReadStart
            }ms)`,
          );

          // Отправляем чанк в поток сразу после чтения
          controller.enqueue(chunkData);
        } catch (err) {
          const chunkErrorTime = Date.now();
          console.error(
            `[readRequestDataStream] [${chunkErrorTime}] Ошибка при чтении чанка #${i} для ${requestId}:`,
            err,
          );
          controller.error(
            new Error(`Failed to read chunk ${i} for ${requestId}`),
          );
          return;
        }
      }

      const finalTime = Date.now();
      if (totalBytesRead !== expectedTotalBytes) {
        console.warn(
          `[readRequestDataStream] [${finalTime}] ⚠️  Несоответствие размеров для ${requestId}: ожидалось ${expectedTotalBytes}, получено ${totalBytesRead}`,
        );
      }

      console.log(
        `[readRequestDataStream] [${finalTime}] ✅ Все чанки отправлены в поток для ${requestId}: ${totalBytesRead} байт из ${totalChunks} чанков`,
      );
      controller.close();
    },
  });
}
