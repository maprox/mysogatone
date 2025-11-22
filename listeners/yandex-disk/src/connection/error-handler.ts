/**
 * Обработка ошибок подключения
 */

import type { StorageProvider } from "../storage-provider/index.ts";
import type { ProtocolPaths } from "../../../../shared/protocol/types.ts";
import { ErrorMetadata, ErrorCode } from "../../../../shared/protocol/types.ts";

/**
 * Обрабатывает ошибку и создает файл ошибки согласно протоколу
 */
export async function handleConnectionError(
  requestId: string,
  error: unknown,
  storageProvider: StorageProvider,
  protocolPaths: ProtocolPaths
): Promise<void> {
  let errorCode: ErrorCode = ErrorCode.CONNECTION_ERROR;
  let errorMessage: string = "Unknown error";
  
  if (error instanceof Error) {
    errorMessage = error.message;
    
    // Определяем код ошибки по типу
    if (error.message.includes("timeout") || error.message.includes("Timeout")) {
      errorCode = ErrorCode.TIMEOUT;
    } else if (error.message.includes("refused") || error.message.includes("Refused")) {
      errorCode = ErrorCode.CONNECTION_ERROR;
    }
  } else if (typeof error === "string") {
    errorMessage = error;
  }
  
  const errorMetadata: ErrorMetadata = {
    requestId,
    error: errorMessage,
    code: errorCode,
    timestamp: Date.now(),
  };
  
  // Записываем ошибку в файл согласно протоколу
  const errorPath = protocolPaths.error(requestId);
  const errorJson = JSON.stringify(errorMetadata, null, 2);
  const errorData = new TextEncoder().encode(errorJson);
  
  await storageProvider.uploadFile(errorPath, errorData);
  console.log(`[${requestId}] Ошибка записана в ${errorPath}`);
}

