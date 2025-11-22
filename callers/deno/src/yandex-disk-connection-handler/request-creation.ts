/**
 * Создание запросов в хранилище
 */

import type { StorageProvider } from "../storage-provider/index.ts";
import type { ProtocolPaths } from "@shared/protocol/types.ts";
import { RequestMetadata } from "@shared/protocol/types.ts";

/**
 * Создает метаданные запроса в хранилище
 */
export async function createRequestMetadata(
  requestId: string,
  targetAddress: string,
  targetPort: number,
  storageProvider: StorageProvider,
  protocolPaths: ProtocolPaths
): Promise<void> {
  console.log(`[createRequestMetadata] Создание метаданных для ${requestId}...`);
  const metadata: RequestMetadata = {
    requestId,
    targetAddress,
    targetPort,
    timestamp: Date.now(),
  };

  const metadataPath = protocolPaths.requestMetadata(requestId);
  console.log(`[createRequestMetadata] Путь к метаданным: ${metadataPath}`);
  const metadataJson = JSON.stringify(metadata);
  console.log(`[createRequestMetadata] Загрузка метаданных в хранилище...`);
  await storageProvider.uploadFile(
    metadataPath,
    new TextEncoder().encode(metadataJson)
  );
  console.log(`[createRequestMetadata] Метаданные загружены успешно`);
}

/**
 * Загружает данные запроса в хранилище
 */
export async function uploadRequestData(
  requestId: string,
  dataBuffer: Uint8Array[],
  storageProvider: StorageProvider,
  protocolPaths: ProtocolPaths
): Promise<void> {
  if (dataBuffer.length === 0) {
    // Создаем пустой файл данных
    const dataPath = protocolPaths.requestData(requestId);
    await storageProvider.uploadFile(dataPath, new Uint8Array(0));
    return;
  }

  // Объединяем все данные из буфера
  const totalLength = dataBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
  const allData = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of dataBuffer) {
    allData.set(chunk, offset);
    offset += chunk.length;
  }

  // Загружаем данные в хранилище
  const dataPath = protocolPaths.requestData(requestId);
  await storageProvider.uploadFile(dataPath, allData);
}

