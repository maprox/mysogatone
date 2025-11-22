/**
 * Чтение запросов из хранилища
 */

import type { StorageProvider } from "../storage-provider/index.ts";
import type { RequestMetadata } from "../../../../shared/protocol/types.ts";
import type { ProtocolPaths } from "../../../../shared/protocol/types.ts";
import { sleep } from "./utils.ts";

/**
 * Читает и валидирует метаданные запроса
 */
export async function readRequestMetadata(
  requestId: string,
  storageProvider: StorageProvider,
  protocolPaths: ProtocolPaths
): Promise<RequestMetadata> {
  const metadataPath = protocolPaths.requestMetadata(requestId);
  const metadataFile = await storageProvider.downloadFile(metadataPath);
  const metadataText = new TextDecoder().decode(metadataFile);
  const metadata: RequestMetadata = JSON.parse(metadataText);

  // Валидация метаданных
  if (!metadata.targetAddress || !metadata.targetPort) {
    throw new Error(
      "Invalid request metadata: missing targetAddress or targetPort"
    );
  }

  if (metadata.targetPort < 1 || metadata.targetPort > 65535) {
    throw new Error(`Invalid targetPort: ${metadata.targetPort}`);
  }

  return metadata;
}

/**
 * Читает данные запроса, ожидая файл если необходимо
 */
export async function readRequestData(
  requestId: string,
  storageProvider: StorageProvider,
  protocolPaths: ProtocolPaths,
  maxWaitTime: number = 5000,
  checkInterval: number = 500
): Promise<Uint8Array> {
  const dataPath = protocolPaths.requestData(requestId);

  // Сначала пытаемся прочитать файл
  try {
    return await storageProvider.downloadFile(dataPath);
  } catch (_error) {
    // Если файл данных еще не создан, ждем его
    console.log(`⏳ Ожидание файла данных для ${requestId}...`);
  }

  // Ожидаем появления файла данных (polling)
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const data = await storageProvider.downloadFile(dataPath);
      return data;
    } catch (_error) {
      // Файл еще не создан, ждем
      await sleep(checkInterval);
    }
  }

  throw new Error(
    `Timeout waiting for data file ${dataPath} (waited ${maxWaitTime}ms)`
  );
}

