/**
 * Реализация ConnectionHandler через StorageProvider для Яндекс Диск
 *
 * Создает запросы в облачном хранилище и ожидает ответы от LISTENER.
 */

import { generateRequestId } from "@shared/protocol/utils.ts";

import type { ConnectionHandler } from "@src/types.ts";
import { createRequestMetadata } from "@src/yandex-disk-connection-handler/request-creation/index.ts";
import { createStreams } from "@src/yandex-disk-connection-handler/streams/index.ts";
import type { YandexDiskConnectionHandlerConfig } from "@src/yandex-disk-connection-handler/types.ts";

/**
 * Реализация ConnectionHandler через StorageProvider
 */
export class YandexDiskConnectionHandler implements ConnectionHandler {
  private storageProvider;
  private protocolPaths;
  private pollInterval;
  private responseTimeout;
  private sessionManager;

  constructor(config: YandexDiskConnectionHandlerConfig) {
    this.storageProvider = config.storageProvider;
    this.protocolPaths = config.protocolPaths;
    this.pollInterval = config.pollInterval;
    this.responseTimeout = config.responseTimeout;
    this.sessionManager = config.sessionManager;
  }

  /**
   * Устанавливает соединение с целевым сервером через облачное хранилище.
   *
   * 1. Создает или переиспользует сессию (для HTTPS)
   * 2. Создает метаданные запроса в хранилище
   * 3. Возвращает потоки для передачи данных
   * 4. Когда writer закрывается, записывает данные в хранилище и начинает polling
   */
  async connect(
    targetAddress: string,
    targetPort: number,
  ): Promise<
    {
      reader: ReadableStreamDefaultReader<Uint8Array>;
      writer: WritableStreamDefaultWriter<Uint8Array>;
    }
  > {
    const requestId = generateRequestId();
    const clientConnId = generateRequestId(); // Уникальный ID для отслеживания клиентского соединения

    console.log(
      `[YandexDiskConnectionHandler] Создание соединения для ${targetAddress}:${targetPort}, requestId: ${requestId}, clientConnId: ${clientConnId}`,
    );

    // Получаем или создаем сессию
    let sessionId: string;
    let isFirstInSession: boolean;
    let keepSessionAlive: boolean;

    if (this.sessionManager) {
      const sessionInfo = this.sessionManager.getOrCreateSession(
        targetAddress,
        targetPort,
        clientConnId,
      );
      sessionId = sessionInfo.sessionId;
      isFirstInSession = sessionInfo.isFirstInSession;
      keepSessionAlive = targetPort === 443; // Для HTTPS сохраняем сессию

      // Добавляем requestId к сессии
      this.sessionManager.addRequestToSession(sessionId, requestId);

      console.log(
        `[YandexDiskConnectionHandler] Сессия: ${sessionId}, первый в сессии: ${isFirstInSession}, keep-alive: ${keepSessionAlive}`,
      );
    } else {
      // Если SessionManager не предоставлен, используем старую логику (без сессий)
      sessionId = requestId; // Для обратной совместимости
      isFirstInSession = true;
      keepSessionAlive = false;
    }

    // Создаем метаданные запроса сразу
    console.log(`[YandexDiskConnectionHandler] Создание метаданных запроса...`);
    await createRequestMetadata(
      {
        requestId,
        targetAddress,
        targetPort,
        sessionId,
        isFirstInSession,
        keepSessionAlive,
      },
      this.storageProvider,
      this.protocolPaths,
    );
    console.log(`[YandexDiskConnectionHandler] Метаданные запроса созданы`);

    // Создаем буфер для данных от клиента
    const clientDataBuffer: Uint8Array[] = [];

    // Функция для создания следующего запроса в той же сессии (для HTTPS)
    const createNextRequest = async (
      data: Uint8Array[],
    ): Promise<{ requestId: string }> => {
      if (!keepSessionAlive || !sessionId || !targetAddress || !targetPort) {
        throw new Error("Cannot create next request: missing session info");
      }

      const nextRequestId = generateRequestId();
      console.log(
        `[YandexDiskConnectionHandler] Создание следующего запроса ${nextRequestId} в сессии ${sessionId}`,
      );

      // Добавляем requestId к сессии
      if (this.sessionManager) {
        this.sessionManager.addRequestToSession(sessionId, nextRequestId);
      }

      const metadataStartTime = Date.now();

      // Создаем метаданные для следующего запроса (isFirstInSession: false)
      await createRequestMetadata(
        {
          requestId: nextRequestId,
          targetAddress,
          targetPort,
          sessionId,
          isFirstInSession: false, // Это не первый запрос в сессии
          keepSessionAlive: true,
        },
        this.storageProvider,
        this.protocolPaths,
      );

      const metadataEndTime = Date.now();
      const metadataDelay = metadataEndTime - metadataStartTime;
      console.log(
        `[YandexDiskConnectionHandler] [TIMELINE] [${metadataEndTime}] ⏱️  Метаданные созданы для ${nextRequestId} (задержка: ${metadataDelay}ms)`,
      );

      // Объединяем все чанки в один массив (критично для TLS handshake)
      const combineStartTime = Date.now();
      const totalLength = data.reduce((sum, chunk) => sum + chunk.length, 0);
      const combinedData = new Uint8Array(totalLength);
      let offset = 0;
      let totalBytes = 0;

      // Проверяем целостность данных при объединении
      for (let i = 0; i < data.length; i++) {
        const chunk = data[i];
        if (!chunk || chunk.length === 0) {
          console.warn(
            `[YandexDiskConnectionHandler] ⚠️  Пустой чанк #${i} в данных для ${nextRequestId}`,
          );
          continue;
        }
        combinedData.set(chunk, offset);
        totalBytes += chunk.length;
        offset += chunk.length;
      }

      // Проверяем, что все данные объединены правильно
      if (totalBytes !== totalLength) {
        console.error(
          `[YandexDiskConnectionHandler] ❌ ОШИБКА: Несоответствие размеров! Ожидалось: ${totalLength} байт, объединено: ${totalBytes} байт для ${nextRequestId}`,
        );
      }

      if (offset !== totalLength) {
        console.error(
          `[YandexDiskConnectionHandler] ❌ ОШИБКА: Несоответствие offset! Ожидалось: ${totalLength}, фактический offset: ${offset} для ${nextRequestId}`,
        );
      }

      const combineEndTime = Date.now();
      const combineDelay = combineEndTime - combineStartTime;
      console.log(
        `[YandexDiskConnectionHandler] Объединено ${data.length} чанков в ${totalLength} байт для ${nextRequestId} (задержка объединения: ${combineDelay}ms)`,
      );

      // Логируем первые байты для проверки целостности (первые 16 байт)
      if (combinedData.length > 0) {
        const preview = Array.from(
          combinedData.slice(0, Math.min(16, combinedData.length)),
        )
          .map((b) => `0x${b.toString(16).padStart(2, "0")}`)
          .join(" ");
        console.log(
          `[YandexDiskConnectionHandler] Первые байты данных для ${nextRequestId}: ${preview}...`,
        );
      }

      // Загружаем объединенные данные в новом формате (чанки + .ready)
      const uploadStartTime = Date.now();

      if (combinedData.length > 0) {
        // Загружаем данные как один чанк
        const chunkPath = this.protocolPaths.requestDataChunk(nextRequestId, 0);
        await this.storageProvider.uploadFile(chunkPath, combinedData);
        console.log(
          `[YandexDiskConnectionHandler] Чанк #0 загружен для ${nextRequestId}: ${combinedData.length} байт`,
        );
      }

      // Создаем файл .ready с метаданными
      const readyPath = this.protocolPaths.requestDataReady(nextRequestId);
      const readyInfo = {
        totalChunks: combinedData.length > 0 ? 1 : 0,
        totalBytes: combinedData.length,
      };
      const readyData = new TextEncoder().encode(JSON.stringify(readyInfo));
      await this.storageProvider.uploadFile(readyPath, readyData);

      const uploadEndTime = Date.now();
      const uploadDelay = uploadEndTime - uploadStartTime;
      const totalDelay = uploadEndTime - metadataStartTime;
      console.log(
        `[YandexDiskConnectionHandler] Данные загружены для следующего запроса ${nextRequestId} (задержка загрузки: ${uploadDelay}ms, общая: ${totalDelay}ms)`,
      );
      console.log(
        `[YandexDiskConnectionHandler] [TIMELINE] [${uploadEndTime}] ⏱️  Данные загружены для ${nextRequestId} (от метаданных: ${
          uploadEndTime - metadataEndTime
        }ms, общая: ${totalDelay}ms)`,
      );

      return { requestId: nextRequestId };
    };

    // Создаем потоки для передачи данных
    const { reader, writer } = createStreams({
      requestId,
      dataBuffer: clientDataBuffer,
      storageProvider: this.storageProvider,
      protocolPaths: this.protocolPaths,
      pollInterval: this.pollInterval,
      responseTimeout: this.responseTimeout,
      keepSessionAlive,
      sessionId: keepSessionAlive ? sessionId : undefined,
      targetAddress: keepSessionAlive ? targetAddress : undefined,
      targetPort: keepSessionAlive ? targetPort : undefined,
      onCreateNextRequest: keepSessionAlive
        ? createNextRequest.bind(this)
        : undefined,
      onDataUploaded: () => {
        console.log(
          `[YandexDiskConnectionHandler] Данные загружены, polling начат для ${requestId}`,
        );
      },
      onConnectionClosed: () => {
        console.log(
          `[YandexDiskConnectionHandler] onConnectionClosed вызван для ${requestId}, keepSessionAlive: ${keepSessionAlive}, sessionManager: ${!!this
            .sessionManager}`,
        );
        if (this.sessionManager && !keepSessionAlive) {
          console.log(
            `[YandexDiskConnectionHandler] Закрытие сессии для clientConnId: ${clientConnId}`,
          );
          this.sessionManager.closeSessionByClientConn(clientConnId);
        } else {
          console.log(
            `[YandexDiskConnectionHandler] Сессия НЕ закрывается (keepSessionAlive: ${keepSessionAlive})`,
          );
        }
      },
    });

    return { reader, writer };
  }
}

// Экспортируем типы
export type { YandexDiskConnectionHandlerConfig } from "@src/yandex-disk-connection-handler/types.ts";
