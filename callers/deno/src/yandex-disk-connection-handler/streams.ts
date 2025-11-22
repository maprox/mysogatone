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
): { reader: ReadableStreamDefaultReader<Uint8Array>; writer: WritableStreamDefaultWriter<Uint8Array> } {
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
      try {
        await pollForResponse(
          requestId,
          storageProvider,
          protocolPaths,
          pollInterval,
          responseTimeout,
          (data: Uint8Array) => {
            controller.enqueue(data);
            controller.close();
          },
          (err: Error) => {
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
    write(chunk: Uint8Array) {
      // Сохраняем данные в буфер
      dataBuffer.push(chunk);
    },
    async close() {
      // Загружаем данные в хранилище
      try {
        await uploadRequestData(requestId, dataBuffer, storageProvider, protocolPaths);
        onDataUploaded();
        pollingStarted = true;
      } catch (err) {
        // Сохраняем ошибку и устанавливаем флаг, чтобы reader мог ее обработать
        uploadError = err instanceof Error ? err : new Error(String(err));
        pollingStarted = true;
      }
    },
  }).getWriter();

  return { reader, writer };
}

