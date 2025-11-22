/**
 * Реализация ConnectionHandler через StorageProvider для Яндекс Диск
 * 
 * Создает запросы в облачном хранилище и ожидает ответы от LISTENER.
 */

import type { ConnectionHandler } from "../connection-handler.ts";
import type { YandexDiskConnectionHandlerConfig } from "./types.ts";
import { generateRequestId } from "@shared/protocol/utils.ts";
import { createRequestMetadata } from "./request-creation.ts";
import { createStreams } from "./streams.ts";

/**
 * Реализация ConnectionHandler через StorageProvider
 */
export class YandexDiskConnectionHandler implements ConnectionHandler {
  private storageProvider;
  private protocolPaths;
  private pollInterval;
  private responseTimeout;

  constructor(config: YandexDiskConnectionHandlerConfig) {
    this.storageProvider = config.storageProvider;
    this.protocolPaths = config.protocolPaths;
    this.pollInterval = config.pollInterval;
    this.responseTimeout = config.responseTimeout;
  }

  /**
   * Устанавливает соединение с целевым сервером через облачное хранилище.
   * 
   * 1. Создает метаданные запроса в хранилище
   * 2. Возвращает потоки для передачи данных
   * 3. Когда writer закрывается, записывает данные в хранилище и начинает polling
   */
  async connect(
    targetAddress: string,
    targetPort: number
  ): Promise<{ reader: ReadableStreamDefaultReader<Uint8Array>; writer: WritableStreamDefaultWriter<Uint8Array> }> {
    const requestId = generateRequestId();
    
    // Создаем метаданные запроса сразу
    await createRequestMetadata(
      requestId,
      targetAddress,
      targetPort,
      this.storageProvider,
      this.protocolPaths
    );

    // Создаем буфер для данных от клиента
    const clientDataBuffer: Uint8Array[] = [];

    // Создаем потоки для передачи данных
    const { reader, writer } = createStreams({
      requestId,
      dataBuffer: clientDataBuffer,
      storageProvider: this.storageProvider,
      protocolPaths: this.protocolPaths,
      pollInterval: this.pollInterval,
      responseTimeout: this.responseTimeout,
      onDataUploaded: () => {
        // Данные загружены в хранилище
      },
    });

    return { reader, writer };
  }
}

// Экспортируем типы
export type { YandexDiskConnectionHandlerConfig } from "./types.ts";

