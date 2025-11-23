/**
 * Создание потоков для передачи данных
 */

import type { StorageProvider } from "../storage-provider/index.ts";
import type { ProtocolPaths } from "@shared/protocol/types.ts";
import { pollForResponse } from "./response-poller.ts";
import { uploadRequestData } from "./request-creation.ts";

/**
 * Параметры для создания потоков
 */
export interface CreateStreamsParams {
  requestId: string;
  dataBuffer: Uint8Array[];
  storageProvider: StorageProvider;
  protocolPaths: ProtocolPaths;
  pollInterval: number;
  responseTimeout: number;
  onDataUploaded: () => void;
}

/**
 * Создает потоки для передачи данных
 */
export function createStreams(
  params: CreateStreamsParams
): { 
  reader: ReadableStreamDefaultReader<Uint8Array>; 
  writer: WritableStreamDefaultWriter<Uint8Array>;
} {
  const {
    requestId,
    dataBuffer,
    storageProvider,
    protocolPaths,
    pollInterval,
    responseTimeout,
    onDataUploaded,
  } = params;

  let pollingStarted = false;
  let uploadError: Error | null = null;
  let dataFileCreated = false; // Флаг, что файл данных уже создан

  // Reader для чтения ответа от LISTENER
  const reader = new ReadableStream({
    async start(controller) {
      // Ждем пока данные будут загружены в хранилище
      while (!pollingStarted) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // Если была ошибка при загрузке данных, передаем ее сразу
      if (uploadError) {
        controller.error(uploadError);
        return;
      }

      // Начинаем polling для получения ответа
      console.log(`[createStreams] Начало polling для получения ответа для ${requestId}`);
      try {
        await pollForResponse(
          requestId,
          storageProvider,
          protocolPaths,
          pollInterval,
          responseTimeout,
          (data: Uint8Array) => {
            console.log(`[createStreams] Получен ответ для ${requestId}: ${data.length} байт`);
            controller.enqueue(data);
            controller.close();
          },
          (err: Error) => {
            console.error(`[createStreams] Ошибка при получении ответа для ${requestId}:`, err);
            controller.error(err);
          }
        );
      } catch (err) {
        controller.error(err instanceof Error ? err : new Error(String(err)));
      }
    },
  }).getReader();

  // Writer для записи данных от клиента
  const writer = new WritableStream({
    async write(chunk: Uint8Array) {
      // Сохраняем данные в буфер
      dataBuffer.push(chunk);
      const totalBytes = dataBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
      console.log(`[createStreams] Получены данные от клиента для ${requestId}: ${chunk.length} байт (всего: ${totalBytes} байт)`);
      
      // Если файл данных еще не создан, создаем его сразу после получения первых данных
      // Это позволяет LISTENER начать обработку запроса, не дожидаясь закрытия writer
      if (!dataFileCreated && totalBytes > 0) {
        console.log(`[createStreams] Создание файла данных для ${requestId} с ${totalBytes} байт данных...`);
        try {
          await uploadRequestData(requestId, dataBuffer, storageProvider, protocolPaths);
          console.log(`[createStreams] Файл данных создан для ${requestId}, начинаем polling`);
          dataFileCreated = true;
          onDataUploaded();
          pollingStarted = true;
        } catch (err) {
          console.error(`[createStreams] Ошибка при создании файла данных для ${requestId}:`, err);
          // Продолжаем работу, попробуем создать файл при закрытии writer
        }
      }
    },
    async close() {
      console.log(`[createStreams] Writer закрыт для ${requestId}, финальная загрузка данных...`);
      const totalBytes = dataBuffer.reduce((sum, chunk) => sum + chunk.length, 0);
      console.log(`[createStreams] Всего данных в буфере: ${dataBuffer.length} чанков, ${totalBytes} байт`);
      
      try {
        // Если файл данных еще не создан (данных не было), создаем пустой файл
        // Если файл уже создан, обновляем его с финальными данными (на случай, если были дополнительные данные)
        if (!dataFileCreated) {
          console.log(`[createStreams] Создание файла данных для ${requestId} (пустой или с данными)...`);
        } else {
          console.log(`[createStreams] Обновление файла данных для ${requestId} с финальными данными...`);
        }
        
        await uploadRequestData(requestId, dataBuffer, storageProvider, protocolPaths);
        
        if (!dataFileCreated) {
          console.log(`[createStreams] Файл данных создан для ${requestId}, начинаем polling`);
          dataFileCreated = true;
          onDataUploaded();
          pollingStarted = true;
        } else {
          console.log(`[createStreams] Файл данных обновлен для ${requestId}`);
        }
      } catch (err) {
        // Сохраняем ошибку и устанавливаем флаг, чтобы reader мог ее обработать
        console.error(`[createStreams] Ошибка при загрузке данных для ${requestId}:`, err);
        uploadError = err instanceof Error ? err : new Error(String(err));
        if (!pollingStarted) {
          pollingStarted = true;
        }
      }
    },
  }).getWriter();

  return { 
    reader, 
    writer
  };
}

