/**
 * Обработка подключений к целевым серверам (GOAL)
 * 
 * Устанавливает TCP соединения с целевыми серверами и записывает ответы в Яндекс Диск.
 */

import type { StorageProvider } from "./storage-provider/index.ts";
import type { ProtocolPaths } from "../../../shared/protocol/types.ts";
import { RequestMetadata } from "../../../shared/protocol/types.ts";
import { connectWithTimeout } from "./connection/tcp-connection.ts";
import { readResponse } from "./connection/response-reader.ts";
import { handleConnectionError } from "./connection/error-handler.ts";

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
    console.log(`[${request.requestId}] 🔌 Начало обработки запроса к ${request.targetAddress}:${request.targetPort}`);
    console.log(`[${request.requestId}] 📦 Размер данных для отправки: ${request.requestData.length} байт`);
    console.log(`[${request.requestId}] 📄 Первые 100 байт данных: ${new TextDecoder().decode(request.requestData.slice(0, 100))}`);
    
    let conn: Deno.TcpConn | null = null;
    
    try {
      // Устанавливаем TCP соединение с целевым сервером
      console.log(`[${request.requestId}] 🔗 Попытка подключения к ${request.targetAddress}:${request.targetPort}...`);
      conn = await connectWithTimeout(
        request.targetAddress,
        request.targetPort,
        this.connectionTimeout
      );
      
      console.log(`[${request.requestId}] ✅ Соединение установлено с ${request.targetAddress}:${request.targetPort}`);
      
      // Отправляем данные на целевой сервер
      console.log(`[${request.requestId}] 📤 Отправка ${request.requestData.length} байт данных на GOAL...`);
      await conn.write(request.requestData);
      console.log(`[${request.requestId}] ✅ Данные отправлены успешно`);
      
      // Читаем ответ от целевого сервера
      console.log(`[${request.requestId}] 📥 Чтение ответа от GOAL...`);
      const responseData = await readResponse(conn);
      console.log(`[${request.requestId}] ✅ Получено ${responseData.length} байт ответа`);
      console.log(`[${request.requestId}] 📄 Первые 200 байт ответа: ${new TextDecoder().decode(responseData.slice(0, 200))}`);
      
      // Записываем ответ в файл согласно протоколу
      const responsePath = this.protocolPaths.response(request.requestId);
      console.log(`[${request.requestId}] 💾 Запись ответа в ${responsePath}...`);
      await this.storageProvider.uploadFile(responsePath, responseData);
      
      console.log(`[${request.requestId}] ✅ Ответ записан в ${responsePath} (${responseData.length} байт)`);
    } catch (error) {
      console.error(`[${request.requestId}] ❌ Ошибка при обработке запроса:`, error);
      await handleConnectionError(
        request.requestId,
        error,
        this.storageProvider,
        this.protocolPaths
      );
      throw error;
    } finally {
      // Гарантируем закрытие соединения в любом случае
      if (conn !== null) {
        try {
          conn.close();
          console.log(`[${request.requestId}] 🔌 Соединение закрыто`);
        } catch (closeError) {
          console.warn(`[${request.requestId}] ⚠️  Ошибка при закрытии соединения:`, closeError);
        }
      }
    }
  }
  
}

