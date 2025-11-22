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

  console.log(`[pollForResponse] Начало polling для ${requestId}, папка ответов: ${responsesFolder}`);
  console.log(`[pollForResponse] Ищем файл ответа: ${responsePath}`);
  console.log(`[pollForResponse] Ищем файл ошибки: ${errorPath}`);
  while (Date.now() - startTime < responseTimeout) {
    try {
      // Проверяем наличие ответа
      const files = await storageProvider.listFiles(responsesFolder);
      console.log(`[pollForResponse] Проверка ответа для ${requestId}, найдено файлов: ${files.length}`);
      if (files.length > 0) {
        console.log(`[pollForResponse] Найденные файлы: ${files.map(f => f.path).join(', ')}`);
      }
      
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
      
      console.log(`[pollForResponse] Нормализованный путь ответа: "${normalizedResponsePath}"`);
      console.log(`[pollForResponse] Нормализованный путь ошибки: "${normalizedErrorPath}"`);
      
      const responseFile = files.find((f: FileInfo) => {
        const normalized = normalizePath(f.path);
        console.log(`[pollForResponse] Сравнение: "${normalized}" === "${normalizedResponsePath}" ? ${normalized === normalizedResponsePath}`);
        return normalized === normalizedResponsePath;
      });
      const errorFile = files.find((f: FileInfo) => normalizePath(f.path) === normalizedErrorPath);
      
      if (responseFile) {
        console.log(`[pollForResponse] ✅ Найден файл ответа: ${responseFile.path}`);
      } else {
        console.log(`[pollForResponse] ⏳ Файл ответа не найден, ищем: ${responsePath}`);
      }

      if (responseFile) {
        // Читаем ответ
        console.log(`[pollForResponse] ✅ Найден файл ответа для ${requestId}: ${responsePath}`);
        const responseData = await storageProvider.downloadFile(responsePath);
        console.log(`[pollForResponse] Ответ прочитан: ${responseData.length} байт`);
        // Удаляем файл ответа
        await storageProvider.deleteFile(responsePath);
        console.log(`[pollForResponse] Файл ответа удален`);
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

