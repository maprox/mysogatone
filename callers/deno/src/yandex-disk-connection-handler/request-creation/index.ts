/**
 * Создание запросов в хранилище
 */

import type { ProtocolPaths } from "@shared/protocol/paths.ts";
import { RequestMetadata } from "@shared/protocol/types.ts";
import type { StorageProvider } from "@src/storage-provider/index.ts";
import type { CreateRequestMetadataParams } from "@src/yandex-disk-connection-handler/request-creation/types.ts";

/**
 * Создает метаданные запроса в хранилище
 */
export async function createRequestMetadata(
  params: CreateRequestMetadataParams,
  storageProvider: StorageProvider,
  protocolPaths: ProtocolPaths,
): Promise<void> {
  const {
    requestId,
    targetAddress,
    targetPort,
    sessionId,
    isFirstInSession,
    keepSessionAlive,
  } = params;

  const startTime = Date.now();
  console.log(
    `[createRequestMetadata] [${startTime}] Создание метаданных для ${requestId}...`,
  );
  const metadata: RequestMetadata = {
    requestId,
    targetAddress,
    targetPort,
    timestamp: Date.now(),
    sessionId,
    isFirstInSession,
    keepSessionAlive,
  };

  const metadataPath = protocolPaths.requestMetadata(requestId);
  console.log(
    `[createRequestMetadata] [${startTime}] Путь к метаданным: ${metadataPath}`,
  );
  if (sessionId) {
    console.log(
      `[createRequestMetadata] [${startTime}] Сессия: ${sessionId}, первый в сессии: ${isFirstInSession}, keep-alive: ${keepSessionAlive}`,
    );
  }
  const metadataJson = JSON.stringify(metadata);
  const uploadStartTime = Date.now();
  console.log(
    `[createRequestMetadata] [${uploadStartTime}] Загрузка метаданных в хранилище...`,
  );
  await storageProvider.uploadFile(
    metadataPath,
    new TextEncoder().encode(metadataJson),
  );
  const uploadEndTime = Date.now();
  const uploadDelay = uploadEndTime - uploadStartTime;
  const totalDelay = uploadEndTime - startTime;
  console.log(
    `[createRequestMetadata] [${uploadEndTime}] Метаданные загружены успешно, задержка загрузки: ${uploadDelay}ms, общая задержка: ${totalDelay}ms`,
  );

  // Записываем в лог задержек
  await logDelay("createRequestMetadata", {
    requestId,
    stage: "upload",
    delay: uploadDelay,
    totalDelay,
    timestamp: uploadEndTime,
  });
}

/**
 * Загружает данные запроса в хранилище
 */
export async function uploadRequestData(
  requestId: string,
  dataBuffer: Uint8Array[],
  storageProvider: StorageProvider,
  protocolPaths: ProtocolPaths,
): Promise<void> {
  const startTime = Date.now();
  const totalLength = dataBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
  console.log(
    `[uploadRequestData] [${startTime}] Начало загрузки данных для ${requestId}, размер: ${totalLength} байт, чанков: ${dataBuffer.length}`,
  );

  if (dataBuffer.length === 0) {
    // Создаем пустой файл данных
    const dataPath = protocolPaths.requestData(requestId);
    const uploadStartTime = Date.now();
    await storageProvider.uploadFile(dataPath, new Uint8Array(0));
    const uploadEndTime = Date.now();
    const uploadDelay = uploadEndTime - uploadStartTime;
    const totalDelay = uploadEndTime - startTime;
    console.log(
      `[uploadRequestData] [${uploadEndTime}] Пустой файл данных загружен, задержка: ${uploadDelay}ms, общая задержка: ${totalDelay}ms`,
    );

    await logDelay("uploadRequestData", {
      requestId,
      stage: "upload",
      delay: uploadDelay,
      totalDelay,
      dataSize: 0,
      chunks: 0,
      timestamp: uploadEndTime,
    });
    return;
  }

  // Объединяем все данные из буфера
  const combineStartTime = Date.now();
  const allData = new Uint8Array(totalLength);
  let offset = 0;
  let totalBytes = 0;

  // Проверяем целостность данных при объединении
  for (let i = 0; i < dataBuffer.length; i++) {
    const chunk = dataBuffer[i];
    if (!chunk || chunk.length === 0) {
      console.warn(
        `[uploadRequestData] ⚠️  Пустой чанк #${i} в буфере для ${requestId}`,
      );
      continue;
    }
    allData.set(chunk, offset);
    totalBytes += chunk.length;
    offset += chunk.length;
  }

  // Проверяем, что все данные объединены правильно
  if (totalBytes !== totalLength) {
    console.error(
      `[uploadRequestData] ❌ ОШИБКА: Несоответствие размеров! Ожидалось: ${totalLength} байт, объединено: ${totalBytes} байт для ${requestId}`,
    );
  }

  if (offset !== totalLength) {
    console.error(
      `[uploadRequestData] ❌ ОШИБКА: Несоответствие offset! Ожидалось: ${totalLength}, фактический offset: ${offset} для ${requestId}`,
    );
  }

  const combineEndTime = Date.now();
  const combineDelay = combineEndTime - combineStartTime;
  console.log(
    `[uploadRequestData] [${combineEndTime}] Данные объединены: ${dataBuffer.length} чанков → ${totalLength} байт, задержка объединения: ${combineDelay}ms`,
  );

  // Логируем первые байты для проверки целостности (первые 16 байт)
  if (allData.length > 0) {
    const preview = Array.from(allData.slice(0, Math.min(16, allData.length)))
      .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
      .join(" ");
    console.log(
      `[uploadRequestData] [${combineEndTime}] Первые байты данных для ${requestId}: ${preview}...`,
    );
  }

  // Загружаем данные в хранилище
  const dataPath = protocolPaths.requestData(requestId);
  const uploadStartTime = Date.now();
  await storageProvider.uploadFile(dataPath, allData);
  const uploadEndTime = Date.now();
  const uploadDelay = uploadEndTime - uploadStartTime;
  const totalDelay = uploadEndTime - startTime;
  console.log(
    `[uploadRequestData] [${uploadEndTime}] Данные загружены, задержка загрузки: ${uploadDelay}ms, общая задержка: ${totalDelay}ms`,
  );

  await logDelay("uploadRequestData", {
    requestId,
    stage: "upload",
    delay: uploadDelay,
    combineDelay,
    totalDelay,
    dataSize: totalLength,
    chunks: dataBuffer.length,
    timestamp: uploadEndTime,
  });
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
    combineDelay?: number;
    dataSize?: number;
    chunks?: number;
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
