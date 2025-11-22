/**
 * Polling для проверки ответов от LISTENER
 */

import type { StorageProvider } from "../storage-provider/index.ts";
import type { FileInfo } from "../storage-provider/types.ts";
import type { ProtocolPaths } from "@shared/protocol/types.ts";
import { ErrorMetadata } from "@shared/protocol/types.ts";

/**
 * Callback для обработки успешного ответа
 */
export type ResponseCallback = (data: Uint8Array) => void;

/**
 * Callback для обработки ошибки
 */
export type ErrorCallback = (error: Error) => void;

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
  onError: ErrorCallback
): Promise<void> {
  const startTime = Date.now();
  const responsePath = protocolPaths.response(requestId);
  const errorPath = protocolPaths.error(requestId);
  // Получаем имя папки из пути к файлу ответа
  const responsesFolder = responsePath.substring(0, responsePath.lastIndexOf("/"));

  while (Date.now() - startTime < responseTimeout) {
    try {
      // Проверяем наличие ответа
      const files = await storageProvider.listFiles(responsesFolder);
      const responseFile = files.find((f: FileInfo) => f.path === responsePath);
      const errorFile = files.find((f: FileInfo) => f.path === errorPath);

      if (responseFile) {
        // Читаем ответ
        const responseData = await storageProvider.downloadFile(responsePath);
        // Удаляем файл ответа
        await storageProvider.deleteFile(responsePath);
        onResponse(responseData);
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
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    } catch (err) {
      // Если ошибка при проверке, продолжаем polling
      console.error(`Error polling for response ${requestId}:`, err);
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }
  }

  // Таймаут
  onError(new Error(`Response timeout after ${responseTimeout}ms`));
}

