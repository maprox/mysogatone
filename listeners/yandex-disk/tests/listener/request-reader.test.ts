/**
 * Тесты для чтения запросов из хранилища
 */

import { assertEquals, assertRejects } from "https://deno.land/std@0.211.0/assert/mod.ts";
import { readRequestMetadata, readRequestData } from "@src/listener/request-reader.ts";
import { ProtocolPaths } from "@shared/protocol/paths.ts";
import type { RequestMetadata } from "@shared/protocol/types.ts";

// Мок StorageProvider для тестирования
class MockStorageProvider {
  files: Map<string, Uint8Array> = new Map();
  
  async downloadFile(filePath: string): Promise<Uint8Array> {
    const data = this.files.get(filePath);
    if (!data) {
      throw new Error(`File not found: ${filePath}`);
    }
    return data;
  }
  
  async uploadFile(_filePath: string, _data: Uint8Array): Promise<void> {
    throw new Error("Not implemented");
  }
  
  async deleteFile(_filePath: string): Promise<void> {
    throw new Error("Not implemented");
  }
  
  async listFiles(_folderPath: string): Promise<never[]> {
    throw new Error("Not implemented");
  }
}

Deno.test("readRequestMetadata - читает и валидирует метаданные", async () => {
  const storageProvider = new MockStorageProvider();
  const protocolPaths = new ProtocolPaths("requests", "responses");
  const requestId = "test-request-id";
  
  const metadata: RequestMetadata = {
    requestId,
    targetAddress: "example.com",
    targetPort: 443,
    timestamp: Date.now(),
  };
  
  const metadataPath = protocolPaths.requestMetadata(requestId);
  storageProvider.files.set(metadataPath, new TextEncoder().encode(JSON.stringify(metadata)));
  
  const result = await readRequestMetadata(requestId, storageProvider, protocolPaths);
  
  assertEquals(result.requestId, requestId);
  assertEquals(result.targetAddress, "example.com");
  assertEquals(result.targetPort, 443);
});

Deno.test("readRequestMetadata - выбрасывает ошибку при отсутствии targetAddress", async () => {
  const storageProvider = new MockStorageProvider();
  const protocolPaths = new ProtocolPaths("requests", "responses");
  const requestId = "test-request-id-2";
  
  const invalidMetadata = {
    requestId,
    targetPort: 443,
  };
  
  const metadataPath = protocolPaths.requestMetadata(requestId);
  storageProvider.files.set(metadataPath, new TextEncoder().encode(JSON.stringify(invalidMetadata)));
  
  await assertRejects(
    async () => await readRequestMetadata(requestId, storageProvider, protocolPaths),
    Error,
    "missing targetAddress or targetPort"
  );
});

Deno.test("readRequestMetadata - выбрасывает ошибку при неверном порте", async () => {
  const storageProvider = new MockStorageProvider();
  const protocolPaths = new ProtocolPaths("requests", "responses");
  const requestId = "test-request-id-3";
  
  const invalidMetadata: RequestMetadata = {
    requestId,
    targetAddress: "example.com",
    targetPort: 70000, // Неверный порт
  };
  
  const metadataPath = protocolPaths.requestMetadata(requestId);
  storageProvider.files.set(metadataPath, new TextEncoder().encode(JSON.stringify(invalidMetadata)));
  
  await assertRejects(
    async () => await readRequestMetadata(requestId, storageProvider, protocolPaths),
    Error,
    "Invalid targetPort: 70000"
  );
});

Deno.test("readRequestData - читает данные запроса из чанков", async () => {
  const storageProvider = new MockStorageProvider();
  const protocolPaths = new ProtocolPaths("requests", "responses");
  const requestId = "test-request-id-4";
  
  const testData = new Uint8Array([1, 2, 3, 4, 5]);
  const chunkPath = protocolPaths.requestDataChunk(requestId, 0);
  const readyPath = protocolPaths.requestDataReady(requestId);
  
  storageProvider.files.set(chunkPath, testData);
  storageProvider.files.set(readyPath, new TextEncoder().encode(JSON.stringify({
    totalChunks: 1,
    totalBytes: 5,
  })));
  
  const result = await readRequestData(requestId, storageProvider, protocolPaths, 1000, 100);
  
  assertEquals(result.length, 5);
  assertEquals(Array.from(result), [1, 2, 3, 4, 5]);
});

Deno.test({
  name: "readRequestData - ожидает появления файла готовности",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const storageProvider = new MockStorageProvider();
  const protocolPaths = new ProtocolPaths("requests", "responses");
  const requestId = "test-request-id-5";
  
  const testData = new Uint8Array([10, 20, 30]);
  const chunkPath = protocolPaths.requestDataChunk(requestId, 0);
  const readyPath = protocolPaths.requestDataReady(requestId);
  
  // Задержка перед добавлением файлов
  setTimeout(() => {
    storageProvider.files.set(chunkPath, testData);
    storageProvider.files.set(readyPath, new TextEncoder().encode(JSON.stringify({
      totalChunks: 1,
      totalBytes: 3,
    })));
  }, 200);
  
  const result = await readRequestData(requestId, storageProvider, protocolPaths, 1000, 100);
  
  assertEquals(result.length, 3);
  assertEquals(Array.from(result), [10, 20, 30]);
});

Deno.test({
  name: "readRequestData - возвращает пустые данные при таймауте ожидания файла готовности",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const storageProvider = new MockStorageProvider();
  const protocolPaths = new ProtocolPaths("requests", "responses");
  const requestId = "test-request-id-6";
  
  // Не добавляем файл готовности
  
  // Теперь функция возвращает пустые данные вместо ошибки при таймауте
  const result = await readRequestData(requestId, storageProvider, protocolPaths, 200, 50);
  assertEquals(result.length, 0);
});

Deno.test("readRequestData - читает данные из нескольких чанков", async () => {
  const storageProvider = new MockStorageProvider();
  const protocolPaths = new ProtocolPaths("requests", "responses");
  const requestId = "test-request-id-7";
  
  const chunk0 = new Uint8Array([1, 2, 3]);
  const chunk1 = new Uint8Array([4, 5, 6]);
  const chunk2 = new Uint8Array([7, 8]);
  
  storageProvider.files.set(protocolPaths.requestDataChunk(requestId, 0), chunk0);
  storageProvider.files.set(protocolPaths.requestDataChunk(requestId, 1), chunk1);
  storageProvider.files.set(protocolPaths.requestDataChunk(requestId, 2), chunk2);
  storageProvider.files.set(protocolPaths.requestDataReady(requestId), new TextEncoder().encode(JSON.stringify({
    totalChunks: 3,
    totalBytes: 8,
  })));
  
  const result = await readRequestData(requestId, storageProvider, protocolPaths, 1000, 100);
  
  assertEquals(result.length, 8);
  assertEquals(Array.from(result), [1, 2, 3, 4, 5, 6, 7, 8]);
});

