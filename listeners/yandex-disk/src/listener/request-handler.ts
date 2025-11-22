/**
 * Обработка запросов LISTENER
 */

import type { StorageProvider } from "../storage-provider/index.ts";
import type { ConnectionHandler } from "../connection-handler.ts";
import type { ProtocolPaths } from "../../../../shared/protocol/types.ts";
import { ProtocolUtils } from "../../../../shared/protocol/types.ts";
import { readRequestMetadata, readRequestData } from "./request-reader.ts";
import { cleanupRequest } from "./request-cleanup.ts";

/**
 * Параметры для обработки запроса
 */
export interface ProcessRequestParams {
  requestId: string;
  storageProvider: StorageProvider;
  connectionHandler: ConnectionHandler;
  protocolPaths: ProtocolPaths;
}

// Реэкспортируем функции для обратной совместимости
export { readRequestMetadata, readRequestData } from "./request-reader.ts";
export { cleanupRequest } from "./request-cleanup.ts";

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

  console.log(`\n📨 [processRequest] Начало обработки запроса: ${requestId}`);

  // Читаем метаданные запроса
  console.log(`[processRequest] Чтение метаданных для ${requestId}...`);
  const metadata = await readRequestMetadata(
    requestId,
    storageProvider,
    protocolPaths
  );

  console.log(
    `[processRequest] ✅ Метаданные прочитаны: ${metadata.targetAddress}:${metadata.targetPort}`
  );

  // Читаем данные запроса
  console.log(`[processRequest] Чтение данных для ${requestId}...`);
  const requestData = await readRequestData(
    requestId,
    storageProvider,
    protocolPaths
  );

  console.log(`[processRequest] ✅ Данные прочитаны: ${requestData.length} байт`);
  console.log(`[processRequest] 📄 Первые 100 байт данных: ${new TextDecoder().decode(requestData.slice(0, 100))}`);

  // Обрабатываем подключение
  console.log(`[processRequest] 🔌 Вызов handleConnection для ${requestId}...`);
  await connectionHandler.handleConnection({
    ...metadata,
    requestData,
  });

  console.log(`[processRequest] ✅ handleConnection завершен для ${requestId}`);

  // Удаляем файлы запроса после успешной обработки
  console.log(`[processRequest] 🧹 Удаление файлов запроса ${requestId}...`);
  await cleanupRequest(requestId, storageProvider, protocolPaths);
  console.log(`[processRequest] ✅ Запрос ${requestId} обработан успешно`);
}

/**
 * Извлекает requestId из пути к файлу и проверяет, что это файл метаданных
 */
export function extractRequestIdFromPath(
  filePath: string
): string | null {
  console.log(`[extractRequestIdFromPath] Проверка пути: ${filePath}`);
  
  // Проверяем, что это файл метаданных запроса
  if (!ProtocolUtils.isRequestMetadata(filePath)) {
    console.log(`[extractRequestIdFromPath] Файл не является .req файлом: ${filePath}`);
    return null;
  }

  // Извлекаем имя файла из полного пути (basename)
  // Путь может быть вида "requests/550e8400-...req" или просто "550e8400-...req"
  const filename = filePath.split("/").pop() || filePath;
  console.log(`[extractRequestIdFromPath] Имя файла: ${filename}`);

  // Извлекаем requestId из имени файла
  const requestId = ProtocolUtils.parseRequestId(filename);
  if (!requestId) {
    console.warn(`⚠️  Не удалось извлечь requestId из ${filePath} (filename: ${filename})`);
    return null;
  }

  console.log(`[extractRequestIdFromPath] Извлечен requestId: ${requestId}`);
  return requestId;
}
