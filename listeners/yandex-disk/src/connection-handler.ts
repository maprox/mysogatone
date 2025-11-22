/**
 * Обработка подключений к целевым серверам (GOAL)
 * 
 * Устанавливает TCP соединения с целевыми серверами и записывает ответы в Яндекс Диск.
 */

import { StorageProvider } from "./storage-provider/index.ts";
import {
  RequestMetadata,
  ErrorMetadata,
  ErrorCode,
  ProtocolPaths,
} from "../../../shared/protocol/types.ts";

export interface ConnectionRequest extends RequestMetadata {
  requestData: Uint8Array;
}

export class ConnectionHandler {
  private storageProvider: StorageProvider;
  private protocolPaths: ProtocolPaths;
  private connectionTimeout: number; // в миллисекундах
  
  constructor(
    storageProvider: StorageProvider,
    protocolPaths: ProtocolPaths,
    connectionTimeout: number = 60000 // 60 секунд по умолчанию
  ) {
    this.storageProvider = storageProvider;
    this.protocolPaths = protocolPaths;
    this.connectionTimeout = connectionTimeout;
  }
  
  /**
   * Обрабатывает запрос на подключение согласно протоколу
   */
  async handleConnection(request: ConnectionRequest): Promise<void> {
    console.log(`[${request.requestId}] Обработка запроса к ${request.targetAddress}:${request.targetPort}`);
    
    try {
      // Устанавливаем TCP соединение с целевым сервером
      const conn = await this.connectWithTimeout(
        request.targetAddress,
        request.targetPort
      );
      
      console.log(`[${request.requestId}] Соединение установлено с ${request.targetAddress}:${request.targetPort}`);
      
      // Отправляем данные на целевой сервер
      await conn.write(request.requestData);
      console.log(`[${request.requestId}] Отправлено ${request.requestData.length} байт на GOAL`);
      
      // Читаем ответ от целевого сервера
      const responseData = await this.readResponse(conn);
      
      // Записываем ответ в файл согласно протоколу
      const responsePath = this.protocolPaths.response(request.requestId);
      await this.storageProvider.uploadFile(responsePath, responseData);
      
      console.log(`[${request.requestId}] Ответ записан в ${responsePath} (${responseData.length} байт)`);
      
      conn.close();
    } catch (error) {
      console.error(`[${request.requestId}] Ошибка при обработке запроса:`, error);
      await this.handleError(request.requestId, error);
      throw error;
    }
  }
  
  /**
   * Устанавливает соединение с таймаутом
   */
  private async connectWithTimeout(
    hostname: string,
    port: number
  ): Promise<Deno.TcpConn> {
    const connectPromise = Deno.connect({ hostname, port });
    
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Connection timeout after ${this.connectionTimeout}ms`));
      }, this.connectionTimeout);
    });
    
    return await Promise.race([connectPromise, timeoutPromise]);
  }
  
  /**
   * Читает ответ от соединения
   */
  private async readResponse(conn: Deno.TcpConn): Promise<Uint8Array> {
    const buffer = new Uint8Array(4096);
    const chunks: Uint8Array[] = [];
    
    // Читаем данные до закрытия соединения
    let bytesRead: number | null;
    while ((bytesRead = await conn.read(buffer)) !== null) {
      if (bytesRead > 0) {
        chunks.push(buffer.slice(0, bytesRead));
      }
    }
    
    // Объединяем все чанки
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const responseData = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      responseData.set(chunk, offset);
      offset += chunk.length;
    }
    
    return responseData;
  }
  
  /**
   * Обрабатывает ошибку и создает файл ошибки согласно протоколу
   */
  private async handleError(requestId: string, error: unknown): Promise<void> {
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
    const errorPath = this.protocolPaths.error(requestId);
    const errorJson = JSON.stringify(errorMetadata, null, 2);
    const errorData = new TextEncoder().encode(errorJson);
    
    await this.storageProvider.uploadFile(errorPath, errorData);
    console.log(`[${requestId}] Ошибка записана в ${errorPath}`);
  }
}

