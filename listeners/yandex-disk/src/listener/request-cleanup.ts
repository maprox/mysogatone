/**
 * Очистка файлов запроса после обработки
 */

import type { StorageProvider } from "@src/storage-provider/index.ts";
import type { ProtocolPaths } from "@shared/protocol/types.ts";

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

