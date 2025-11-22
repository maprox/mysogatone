/**
 * Обработка запросов LISTENER
 */

import type { StorageProvider } from "../storage-provider/index.ts";
import type { ConnectionHandler } from "../connection-handler.ts";
import type { RequestMetadata } from "../../../../shared/protocol/types.ts";
import { ProtocolPaths, ProtocolUtils } from "../../../../shared/protocol/types.ts";
import { sleep } from "./utils.ts";

/**
 * Параметры для обработки запроса
 */
export interface ProcessRequestParams {
  requestId: string;
  storageProvider: StorageProvider;
  connectionHandler: ConnectionHandler;
  protocolPaths: ProtocolPaths;
}

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
  maxWaitTime: number = 30000,
  checkInterval: number = 1000
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

/**
 * Удаляет файлы запроса после обработки
 */
export async function cleanupRequest(
  requestId: string,
  storageProvider: StorageProvider,
  protocolPaths: ProtocolPaths
): Promise<void> {
  const metadataPath = protocolPaths.requestMetadata(requestId);
  const dataPath = protocolPaths.requestData(requestId);

  try {
    await Promise.all([
      storageProvider.deleteFile(metadataPath).catch(() => {
        // Игнорируем ошибки удаления
      }),
      storageProvider.deleteFile(dataPath).catch(() => {
        // Игнорируем ошибки удаления
      }),
    ]);
    console.log(`🧹 Файлы запроса ${requestId} удалены`);
  } catch (_error) {
    console.warn(`⚠️  Не удалось удалить файлы запроса ${requestId}`);
  }
}

/**
 * Обрабатывает запрос согласно протоколу
 */
export async function processRequest(
  params: ProcessRequestParams
): Promise<void> {
  const {
    requestId,
    storageProvider,
    connectionHandler,
    protocolPaths,
  } = params;

  console.log(`\n📨 Обработка запроса: ${requestId}`);

  // Читаем метаданные запроса
  const metadata = await readRequestMetadata(
    requestId,
    storageProvider,
    protocolPaths
  );

  console.log(
    `📋 Метаданные: ${metadata.targetAddress}:${metadata.targetPort}`
  );

  // Читаем данные запроса
  const requestData = await readRequestData(
    requestId,
    storageProvider,
    protocolPaths
  );

  console.log(`📦 Данные запроса: ${requestData.length} байт`);

  // Обрабатываем подключение
  await connectionHandler.handleConnection({
    ...metadata,
    requestData,
  });

  // Удаляем файлы запроса после успешной обработки
  await cleanupRequest(requestId, storageProvider, protocolPaths);
  console.log(`✅ Запрос ${requestId} обработан успешно`);
}

/**
 * Извлекает requestId из пути к файлу и проверяет, что это файл метаданных
 */
export function extractRequestIdFromPath(
  filePath: string
): string | null {
  // Проверяем, что это файл метаданных запроса
  if (!ProtocolUtils.isRequestMetadata(filePath)) {
    return null;
  }

  // Извлекаем requestId из имени файла
  const requestId = ProtocolUtils.parseRequestId(filePath);
  if (!requestId) {
    console.warn(`⚠️  Не удалось извлечь requestId из ${filePath}`);
    return null;
  }

  return requestId;
}

