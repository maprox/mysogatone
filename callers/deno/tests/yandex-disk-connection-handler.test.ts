/**
 * Тесты для YandexDiskConnectionHandler и связанных модулей
 */

import { assertEquals, assertRejects } from "https://deno.land/std@0.211.0/assert/mod.ts";
import type { StorageProvider, FileInfo } from "../src/storage-provider/types.ts";
import { ProtocolPaths } from "@shared/protocol/paths.ts";
import { YandexDiskConnectionHandler } from "../src/yandex-disk-connection-handler/index.ts";
import { createRequestMetadata, uploadRequestData } from "../src/yandex-disk-connection-handler/request-creation/index.ts";
import { pollForResponse } from "../src/yandex-disk-connection-handler/response-poller/index.ts";
import { createStreams } from "../src/yandex-disk-connection-handler/streams/index.ts";

/**
 * Мок StorageProvider для тестирования
 */
class MockStorageProvider implements StorageProvider {
  private files: Map<string, Uint8Array> = new Map();
  private listFilesResult: FileInfo[] = [];
  private shouldFailUpload = false;
  private shouldFailDownload = false;
  private shouldFailList = false;
  private shouldFailDelete = false;

  /**
   * Устанавливает результат listFiles
   */
  setListFilesResult(files: FileInfo[]): void {
    this.listFilesResult = files;
  }

  /**
   * Устанавливает файл в хранилище
   */
  setFile(path: string, data: Uint8Array): void {
    this.files.set(path, data);
  }

  /**
   * Получает файл из хранилища
   */
  getFile(path: string): Uint8Array | undefined {
    return this.files.get(path);
  }

  /**
   * Проверяет, существует ли файл
   */
  hasFile(path: string): boolean {
    return this.files.has(path);
  }

  /**
   * Устанавливает флаг для симуляции ошибки при загрузке
   */
  setShouldFailUpload(shouldFail: boolean): void {
    this.shouldFailUpload = shouldFail;
  }

  /**
   * Устанавливает флаг для симуляции ошибки при скачивании
   */
  setShouldFailDownload(shouldFail: boolean): void {
    this.shouldFailDownload = shouldFail;
  }

  /**
   * Устанавливает флаг для симуляции ошибки при listFiles
   */
  setShouldFailList(shouldFail: boolean): void {
    this.shouldFailList = shouldFail;
  }

  /**
   * Устанавливает флаг для симуляции ошибки при удалении
   */
  setShouldFailDelete(shouldFail: boolean): void {
    this.shouldFailDelete = shouldFail;
  }

  /**
   * Очищает все файлы
   */
  clear(): void {
    this.files.clear();
    this.listFilesResult = [];
  }

  async listFiles(folderPath: string): Promise<FileInfo[]> {
    if (this.shouldFailList) {
      throw new Error("List files failed");
    }
    return this.listFilesResult.filter((f) => f.path.startsWith(folderPath));
  }

  async downloadFile(filePath: string): Promise<Uint8Array> {
    if (this.shouldFailDownload) {
      throw new Error("Download failed");
    }
    const data = this.files.get(filePath);
    if (!data) {
      throw new Error(`File not found: ${filePath}`);
    }
    return data;
  }

  async uploadFile(filePath: string, data: Uint8Array): Promise<void> {
    if (this.shouldFailUpload) {
      throw new Error("Upload failed");
    }
    this.files.set(filePath, data);
    
    // Автоматически добавляем файл в listFilesResult
    const fileName = filePath.split("/").pop() || filePath;
    const folderPath = filePath.substring(0, filePath.lastIndexOf("/"));
    const existingFile = this.listFilesResult.find((f) => f.path === filePath);
    if (!existingFile) {
      this.listFilesResult.push({
        name: fileName,
        path: filePath,
        size: data.length,
        modified: new Date(),
      });
    } else {
      // Обновляем существующий файл
      existingFile.size = data.length;
      existingFile.modified = new Date();
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    if (this.shouldFailDelete) {
      throw new Error("Delete failed");
    }
    this.files.delete(filePath);
  }
}

// ============================================================================
// Тесты для request-creation.ts
// ============================================================================

Deno.test({
  name: "createRequestMetadata - создает метаданные запроса",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const storageProvider = new MockStorageProvider();
  const protocolPaths = new ProtocolPaths("requests", "responses");
  const requestId = "test-request-id";
  const targetAddress = "example.com";
  const targetPort = 443;

  await createRequestMetadata(
    {
      requestId,
      targetAddress,
      targetPort,
    },
    storageProvider,
    protocolPaths
  );

  const metadataPath = protocolPaths.requestMetadata(requestId);
  assertEquals(storageProvider.hasFile(metadataPath), true);

  const metadataData = storageProvider.getFile(metadataPath);
  assertEquals(metadataData !== undefined, true);

  if (metadataData) {
    const metadata = JSON.parse(new TextDecoder().decode(metadataData));
    assertEquals(metadata.requestId, requestId);
    assertEquals(metadata.targetAddress, targetAddress);
    assertEquals(metadata.targetPort, targetPort);
    assertEquals(typeof metadata.timestamp, "number");
  }
});

Deno.test({
  name: "createRequestMetadata - обрабатывает ошибку при загрузке",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const storageProvider = new MockStorageProvider();
  storageProvider.setShouldFailUpload(true);
  const protocolPaths = new ProtocolPaths("requests", "responses");

  await assertRejects(
    async () => {
      await createRequestMetadata(
        {
          requestId: "test-id",
          targetAddress: "example.com",
          targetPort: 443,
        },
        storageProvider,
        protocolPaths
      );
    },
    Error,
    "Upload failed"
  );
});

Deno.test({
  name: "uploadRequestData - загружает данные запроса",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const storageProvider = new MockStorageProvider();
  const protocolPaths = new ProtocolPaths("requests", "responses");
  const requestId = "test-request-id";
  const testData = [
    new Uint8Array([1, 2, 3]),
    new Uint8Array([4, 5, 6]),
  ];

  await uploadRequestData(
    requestId,
    testData,
    storageProvider,
    protocolPaths
  );

  const dataPath = protocolPaths.requestData(requestId);
  assertEquals(storageProvider.hasFile(dataPath), true);

  const uploadedData = storageProvider.getFile(dataPath);
  assertEquals(uploadedData !== undefined, true);

  if (uploadedData) {
    assertEquals(uploadedData.length, 6);
    assertEquals(uploadedData[0], 1);
    assertEquals(uploadedData[1], 2);
    assertEquals(uploadedData[2], 3);
    assertEquals(uploadedData[3], 4);
    assertEquals(uploadedData[4], 5);
    assertEquals(uploadedData[5], 6);
  }
});

Deno.test({
  name: "uploadRequestData - создает пустой файл при отсутствии данных",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const storageProvider = new MockStorageProvider();
  const protocolPaths = new ProtocolPaths("requests", "responses");
  const requestId = "test-request-id";

  await uploadRequestData(
    requestId,
    [],
    storageProvider,
    protocolPaths
  );

  const dataPath = protocolPaths.requestData(requestId);
  assertEquals(storageProvider.hasFile(dataPath), true);

  const uploadedData = storageProvider.getFile(dataPath);
  assertEquals(uploadedData !== undefined, true);
  assertEquals(uploadedData?.length, 0);
});

Deno.test({
  name: "uploadRequestData - обрабатывает ошибку при загрузке",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const storageProvider = new MockStorageProvider();
  storageProvider.setShouldFailUpload(true);
  const protocolPaths = new ProtocolPaths("requests", "responses");

  await assertRejects(
    async () => {
      await uploadRequestData(
        "test-id",
        [new Uint8Array([1, 2, 3])],
        storageProvider,
        protocolPaths
      );
    },
    Error,
    "Upload failed"
  );
});

// ============================================================================
// Тесты для response-poller.ts
// ============================================================================

Deno.test({
  name: "pollForResponse - успешно получает ответ",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const storageProvider = new MockStorageProvider();
  const protocolPaths = new ProtocolPaths("requests", "responses");
  const requestId = "test-request-id";
  const responseData = new Uint8Array([10, 20, 30]);
  const responsePath = protocolPaths.response(requestId);
  const responsesFolder = "responses";

  // Устанавливаем файл ответа сразу
  storageProvider.setFile(responsePath, responseData);
  storageProvider.setListFilesResult([
    {
      name: `${requestId}.resp`,
      path: responsePath,
      size: responseData.length,
      modified: new Date(),
    },
  ]);

  let receivedData: Uint8Array | null = null;
  let errorReceived: Error | null = null;

  await pollForResponse(
    requestId,
    storageProvider,
    protocolPaths,
    100, // pollInterval
    1000, // responseTimeout
    (data: Uint8Array) => {
      receivedData = data;
    },
    (err: Error) => {
      errorReceived = err;
    }
  );

  assertEquals(receivedData !== null, true);
  const data = receivedData!;
  assertEquals(data.length, 3);
  assertEquals(data[0], 10);
  assertEquals(data[1], 20);
  assertEquals(data[2], 30);
  assertEquals(errorReceived, null);
  // Файл должен быть удален после получения ответа
  assertEquals(storageProvider.hasFile(responsePath), false);
});

Deno.test({
  name: "pollForResponse - получает ответ после нескольких попыток",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const storageProvider = new MockStorageProvider();
  const protocolPaths = new ProtocolPaths("requests", "responses");
  const requestId = "test-request-id";
  const responseData = new Uint8Array([1, 2, 3]);
  const responsePath = protocolPaths.response(requestId);
  const responsesFolder = "responses";

  let pollCount = 0;
  const originalListFiles = storageProvider.listFiles.bind(storageProvider);
  storageProvider.listFiles = async (folderPath: string) => {
    pollCount++;
    // Возвращаем ответ только после второй попытки
    if (pollCount >= 2) {
      storageProvider.setFile(responsePath, responseData);
      storageProvider.setListFilesResult([
        {
          name: `${requestId}.resp`,
          path: responsePath,
          size: responseData.length,
          modified: new Date(),
        },
      ]);
    }
    return originalListFiles(folderPath);
  };

  let receivedData: Uint8Array | null = null;

  await pollForResponse(
    requestId,
    storageProvider,
    protocolPaths,
    50, // pollInterval
    1000, // responseTimeout
    (data: Uint8Array) => {
      receivedData = data;
    },
    (_err: Error) => {}
  );

  assertEquals(receivedData !== null, true);
  assertEquals(pollCount >= 2, true);
});

Deno.test({
  name: "pollForResponse - обрабатывает ошибку от LISTENER",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const storageProvider = new MockStorageProvider();
  const protocolPaths = new ProtocolPaths("requests", "responses");
  const requestId = "test-request-id";
  const errorPath = protocolPaths.error(requestId);
  const errorMetadata = {
    requestId,
    error: "Connection failed",
    code: "CONNECTION_ERROR",
    timestamp: Date.now(),
  };
  const errorData = new TextEncoder().encode(JSON.stringify(errorMetadata));

  storageProvider.setFile(errorPath, errorData);
  storageProvider.setListFilesResult([
    {
      name: `${requestId}.error`,
      path: errorPath,
      size: errorData.length,
      modified: new Date(),
    },
  ]);

  let receivedError: Error | null = null;
  let receivedData: Uint8Array | null = null;

  await pollForResponse(
    requestId,
    storageProvider,
    protocolPaths,
    100,
    1000,
    (data: Uint8Array) => {
      receivedData = data;
    },
    (err: Error) => {
      receivedError = err;
    }
  );

  assertEquals(receivedError !== null, true);
  const error = receivedError!;
  assertEquals(error.message, "Connection failed");
  assertEquals((error as Error & { code?: string }).code, "CONNECTION_ERROR");
  assertEquals(receivedData, null);
  // Файл ошибки должен быть удален
  assertEquals(storageProvider.hasFile(errorPath), false);
});

Deno.test({
  name: "pollForResponse - обрабатывает таймаут",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const storageProvider = new MockStorageProvider();
  const protocolPaths = new ProtocolPaths("requests", "responses");
  const requestId = "test-request-id";

  // Не устанавливаем файл ответа, чтобы вызвать таймаут
  storageProvider.setListFilesResult([]);

  let receivedError: Error | null = null;

  await pollForResponse(
    requestId,
    storageProvider,
    protocolPaths,
    50, // pollInterval
    200, // responseTimeout (короткий таймаут для теста)
    (_data: Uint8Array) => {},
    (err: Error) => {
      receivedError = err;
    }
  );

  assertEquals(receivedError !== null, true);
  const error = receivedError!;
  assertEquals(error.message.includes("timeout"), true);
});

Deno.test({
  name: "pollForResponse - продолжает polling при ошибке проверки",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const storageProvider = new MockStorageProvider();
  const protocolPaths = new ProtocolPaths("requests", "responses");
  const requestId = "test-request-id";
  const responseData = new Uint8Array([1, 2, 3]);
  const responsePath = protocolPaths.response(requestId);

  let callCount = 0;
  const originalListFiles = storageProvider.listFiles.bind(storageProvider);
  storageProvider.listFiles = async (folderPath: string) => {
    callCount++;
    // Первая попытка падает с ошибкой
    if (callCount === 1) {
      throw new Error("Temporary error");
    }
    // Вторая попытка успешна
    if (callCount === 2) {
      storageProvider.setFile(responsePath, responseData);
      storageProvider.setListFilesResult([
        {
          name: `${requestId}.resp`,
          path: responsePath,
          size: responseData.length,
          modified: new Date(),
        },
      ]);
    }
    return originalListFiles(folderPath);
  };

  let receivedData: Uint8Array | null = null;

  await pollForResponse(
    requestId,
    storageProvider,
    protocolPaths,
    50,
    1000,
    (data: Uint8Array) => {
      receivedData = data;
    },
    (_err: Error) => {}
  );

  assertEquals(receivedData !== null, true);
  assertEquals(callCount >= 2, true);
});

// ============================================================================
// Тесты для streams.ts
// ============================================================================

Deno.test({
  name: "createStreams - создает потоки и передает данные",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const storageProvider = new MockStorageProvider();
  const protocolPaths = new ProtocolPaths("requests", "responses");
  const requestId = "test-request-id";
  const responseData = new Uint8Array([100, 200, 255]);
  const responsePath = protocolPaths.response(requestId);

  // Устанавливаем ответ сразу
  storageProvider.setFile(responsePath, responseData);
  storageProvider.setListFilesResult([
    {
      name: `${requestId}.resp`,
      path: responsePath,
      size: responseData.length,
      modified: new Date(),
    },
  ]);

  const dataBuffer: Uint8Array[] = [];
  let dataUploaded = false;

  const { reader, writer } = createStreams({
    requestId,
    dataBuffer,
    storageProvider,
    protocolPaths,
    pollInterval: 50,
    responseTimeout: 1000,
    onDataUploaded: () => {
      dataUploaded = true;
    },
  });

  // Записываем данные в writer
  const testData = new Uint8Array([1, 2, 3, 4, 5]);
  await writer.write(testData);
  await writer.close();

  // Ждем загрузки данных
  let waitCount = 0;
  while (!dataUploaded && waitCount < 100) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    waitCount++;
  }

  assertEquals(dataUploaded, true);
  assertEquals(dataBuffer.length, 1);
  assertEquals(dataBuffer[0].length, 5);

  // Проверяем, что данные были загружены в хранилище как чанки
  const chunkPath = protocolPaths.requestDataChunk(requestId, 0);
  assertEquals(storageProvider.hasFile(chunkPath), true);
  
  // Проверяем, что файл готовности создан
  const readyPath = protocolPaths.requestDataReady(requestId);
  assertEquals(storageProvider.hasFile(readyPath), true);

  // Читаем ответ
  const result = await reader.read();
  assertEquals(result.done, false);
  if (!result.done) {
    assertEquals(result.value.length, 3);
    assertEquals(result.value[0], 100);
    assertEquals(result.value[1], 200);
    assertEquals(result.value[2], 255);
  }

  await reader.cancel();
});

Deno.test({
  name: "createStreams - обрабатывает ошибку при загрузке данных",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const storageProvider = new MockStorageProvider();
  storageProvider.setShouldFailUpload(true);
  const protocolPaths = new ProtocolPaths("requests", "responses");
  const requestId = "test-request-id";

  const dataBuffer: Uint8Array[] = [];

  const { reader, writer } = createStreams({
    requestId,
    dataBuffer,
    storageProvider,
    protocolPaths,
    pollInterval: 50,
    responseTimeout: 1000,
    onDataUploaded: () => {},
  });

  await writer.write(new Uint8Array([1, 2, 3]));
  await writer.close();

  // Ждем обработки ошибки (pollingStarted должен стать true)
  await new Promise((resolve) => setTimeout(resolve, 150));

  // Читаем ошибку из reader
  let errorReceived = false;
  let errorMessage = "";
  try {
    const result = await reader.read();
    if (result.done) {
      errorReceived = true;
    }
  } catch (err) {
    errorReceived = true;
    if (err instanceof Error) {
      errorMessage = err.message;
    }
  }

  // Reader должен быть в состоянии ошибки
  assertEquals(errorReceived, true);
  assertEquals(errorMessage.includes("Upload failed") || errorMessage.includes("failed"), true);
});

Deno.test({
  name: "createStreams - обрабатывает ошибку от LISTENER",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const storageProvider = new MockStorageProvider();
  const protocolPaths = new ProtocolPaths("requests", "responses");
  const requestId = "test-request-id";
  const errorPath = protocolPaths.error(requestId);
  const errorMetadata = {
    requestId,
    error: "Connection timeout",
    code: "TIMEOUT",
    timestamp: Date.now(),
  };
  const errorData = new TextEncoder().encode(JSON.stringify(errorMetadata));

  storageProvider.setFile(errorPath, errorData);
  storageProvider.setListFilesResult([
    {
      name: `${requestId}.error`,
      path: errorPath,
      size: errorData.length,
      modified: new Date(),
    },
  ]);

  const dataBuffer: Uint8Array[] = [];
  let dataUploaded = false;

  const { reader, writer } = createStreams({
    requestId,
    dataBuffer,
    storageProvider,
    protocolPaths,
    pollInterval: 50,
    responseTimeout: 1000,
    onDataUploaded: () => {
      dataUploaded = true;
    },
  });

  await writer.close();

  // Ждем загрузки данных
  let waitCount = 0;
  while (!dataUploaded && waitCount < 100) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    waitCount++;
  }

  // Читаем ошибку из reader
  let errorReceived = false;
  try {
    const result = await reader.read();
    if (result.done) {
      errorReceived = true;
    }
  } catch (err) {
    errorReceived = true;
    assertEquals(err instanceof Error, true);
    if (err instanceof Error) {
      assertEquals(err.message, "Connection timeout");
    }
  }

  assertEquals(errorReceived, true);
});

// ============================================================================
// Тесты для YandexDiskConnectionHandler
// ============================================================================

Deno.test({
  name: "YandexDiskConnectionHandler.connect - создает соединение",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const storageProvider = new MockStorageProvider();
  const protocolPaths = new ProtocolPaths("requests", "responses");
  const handler = new YandexDiskConnectionHandler({
    storageProvider,
    protocolPaths,
    pollInterval: 50,
    responseTimeout: 500,
  });

  const targetAddress = "example.com";
  const targetPort = 443;

  const streams = await handler.connect(targetAddress, targetPort);

  assertEquals(streams.reader !== null, true);
  assertEquals(streams.writer !== null, true);

  // Получаем requestId из созданных метаданных
  // Ждем немного, чтобы метаданные успели загрузиться
  await new Promise((resolve) => setTimeout(resolve, 100));
  
  // Проверяем через listFiles
  const requestsFiles = await storageProvider.listFiles("requests");
  const metadataFiles = requestsFiles.filter((f) => f.path.endsWith(".req"));
  assertEquals(metadataFiles.length > 0, true);
  
  // Извлекаем requestId из пути к метаданным
  const metadataPath = metadataFiles[0].path;
  
  // Проверяем, что метаданные содержат правильные данные
  const metadataData = storageProvider.getFile(metadataPath);
  assertEquals(metadataData !== undefined, true);
  if (metadataData) {
    const metadata = JSON.parse(new TextDecoder().decode(metadataData));
    assertEquals(metadata.targetAddress, targetAddress);
    assertEquals(metadata.targetPort, targetPort);
  }

  // Закрываем writer, чтобы начать polling (но не ждем ответа, чтобы тест не завис)
  await streams.writer.close();

  // Очищаем ресурсы с таймаутом
  const cancelPromise = streams.reader.cancel();
  const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 100));
  await Promise.race([cancelPromise, timeoutPromise]);
});

Deno.test({
  name: "YandexDiskConnectionHandler.connect - обрабатывает ошибку при создании метаданных",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const storageProvider = new MockStorageProvider();
  storageProvider.setShouldFailUpload(true);
  const protocolPaths = new ProtocolPaths("requests", "responses");
  const handler = new YandexDiskConnectionHandler({
    storageProvider,
    protocolPaths,
    pollInterval: 50,
    responseTimeout: 1000,
  });

  await assertRejects(
    async () => {
      await handler.connect("example.com", 443);
    },
    Error,
    "Upload failed"
  );
});

