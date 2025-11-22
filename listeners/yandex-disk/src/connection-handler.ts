/**
 * Обработка подключений к целевым серверам (GOAL)
 * 
 * Устанавливает TCP соединения с целевыми серверами и записывает ответы в Яндекс Диск.
 */

import { StorageProvider } from "./storage-provider.ts";

export interface ConnectionRequest {
  targetAddress: string;
  targetPort: number;
  requestId: string;
}

export class ConnectionHandler {
  private storageProvider: StorageProvider;
  private responsesFolder: string;
  
  constructor(storageProvider: StorageProvider, responsesFolder: string) {
    this.storageProvider = storageProvider;
    this.responsesFolder = responsesFolder;
  }
  
  /**
   * Обрабатывает запрос на подключение
   */
  async handleConnection(request: ConnectionRequest): Promise<void> {
    console.log(`Подключение к ${request.targetAddress}:${request.targetPort}`);
    
    try {
      // Устанавливаем TCP соединение с целевым сервером
      const conn = await Deno.connect({
        hostname: request.targetAddress,
        port: request.targetPort,
      });
      
      console.log(`Соединение установлено с ${request.targetAddress}:${request.targetPort}`);
      
      // Читаем данные от целевого сервера
      const buffer = new Uint8Array(4096);
      const chunks: Uint8Array[] = [];
      
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
      
      // Записываем ответ в Яндекс Диск
      const responsePath = `${this.responsesFolder}/${request.requestId}.response`;
      await this.storageProvider.uploadFile(responsePath, responseData);
      
      console.log(`Ответ записан в ${responsePath}`);
      
      conn.close();
    } catch (error) {
      console.error(`Ошибка при подключении к ${request.targetAddress}:${request.targetPort}:`, error);
      throw error;
    }
  }
}

