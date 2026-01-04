/**
 * Очистка файлов запроса после обработки
 */

import type { ProtocolPaths } from "@shared/protocol/paths.ts";
import type { StorageProvider } from "@src/storage-provider/index.ts";

/**
 * Удаляет файлы запроса после обработки
 * Удаляет метаданные (.req), чанки данных (.chunk.N) и файл готовности (.ready)
 */
export async function cleanupRequest(
  requestId: string,
  storageProvider: StorageProvider,
  protocolPaths: ProtocolPaths,
): Promise<void> {
  const metadataPath = protocolPaths.requestMetadata(requestId);
  const readyPath = protocolPaths.requestDataReady(requestId);

  // Список файлов для удаления
  const filesToDelete: string[] = [metadataPath, readyPath];

  // Пытаемся прочитать .ready файл, чтобы узнать количество чанков
  try {
    const readyData = await storageProvider.downloadFile(readyPath);
    const readyInfo = JSON.parse(new TextDecoder().decode(readyData)) as {
      totalChunks: number;
      totalBytes: number;
    };

    // Добавляем пути к чанкам
    for (let i = 0; i < readyInfo.totalChunks; i++) {
      filesToDelete.push(protocolPaths.requestDataChunk(requestId, i));
    }
  } catch (_error) {
    // Если .ready файл не найден или не удалось прочитать, пытаемся удалить чанки вручную
    // Пробуем удалить чанки от 0 до 100 (на случай если .ready файл уже удален)
    for (let i = 0; i < 100; i++) {
      filesToDelete.push(protocolPaths.requestDataChunk(requestId, i));
    }
  }

  try {
    // Удаляем все файлы параллельно
    await Promise.all(
      filesToDelete.map((path) =>
        storageProvider.deleteFile(path).catch(() => {
          // Игнорируем ошибки удаления (файл может уже не существовать)
        })
      ),
    );
    console.log(
      `🧹 Файлы запроса ${requestId} удалены (${filesToDelete.length} файлов)`,
    );
  } catch (_error) {
    console.warn(`⚠️  Не удалось удалить файлы запроса ${requestId}`);
  }
}
