/**
 * Тесты для очистки файлов запроса
 */

import { assertEquals } from "https://deno.land/std@0.211.0/assert/mod.ts";
import { cleanupRequest } from "@src/listener/request-cleanup.ts";
import { ProtocolPaths } from "@shared/protocol/paths.ts";

// Мок StorageProvider для тестирования
class MockStorageProvider {
  deletedFiles: Set<string> = new Set();
  files: Map<string, Uint8Array> = new Map();
  
  async deleteFile(filePath: string): Promise<void> {
    this.deletedFiles.add(filePath);
    this.files.delete(filePath);
  }
  
  async downloadFile(_filePath: string): Promise<Uint8Array> {
    throw new Error("Not implemented");
  }
  
  async uploadFile(_filePath: string, _data: Uint8Array): Promise<void> {
    throw new Error("Not implemented");
  }
  
  async listFiles(_folderPath: string): Promise<never[]> {
    throw new Error("Not implemented");
  }
}

Deno.test("cleanupRequest - удаляет файлы метаданных и данных", async () => {
  const storageProvider = new MockStorageProvider();
  const protocolPaths = new ProtocolPaths("requests", "responses");
  const requestId = "test-request-id";
  
  const metadataPath = protocolPaths.requestMetadata(requestId);
  const readyPath = protocolPaths.requestDataReady(requestId);
  const chunk0Path = protocolPaths.requestDataChunk(requestId, 0);
  const chunk1Path = protocolPaths.requestDataChunk(requestId, 1);
  
  // Добавляем файлы
  storageProvider.files.set(metadataPath, new Uint8Array([1]));
  storageProvider.files.set(readyPath, new TextEncoder().encode(JSON.stringify({ totalChunks: 2, totalBytes: 10 })));
  storageProvider.files.set(chunk0Path, new Uint8Array([2]));
  storageProvider.files.set(chunk1Path, new Uint8Array([3]));
  
  await cleanupRequest(requestId, storageProvider, protocolPaths);
  
  // Проверяем, что файлы были удалены
  assertEquals(storageProvider.deletedFiles.has(metadataPath), true);
  assertEquals(storageProvider.deletedFiles.has(readyPath), true);
  assertEquals(storageProvider.deletedFiles.has(chunk0Path), true);
  assertEquals(storageProvider.deletedFiles.has(chunk1Path), true);
  assertEquals(storageProvider.files.has(metadataPath), false);
  assertEquals(storageProvider.files.has(readyPath), false);
  assertEquals(storageProvider.files.has(chunk0Path), false);
  assertEquals(storageProvider.files.has(chunk1Path), false);
});

Deno.test("cleanupRequest - игнорирует ошибки удаления", async () => {
  const storageProvider = new MockStorageProvider();
  const protocolPaths = new ProtocolPaths("requests", "responses");
  const requestId = "test-request-id-2";
  
  // Не добавляем файлы - удаление должно завершиться без ошибок
  
  // Функция не должна выбрасывать ошибку
  await cleanupRequest(requestId, storageProvider, protocolPaths);
  
  // Проверяем, что попытка удаления была сделана
  // Функция пытается удалить метаданные, ready файл и чанки (0-100, если ready не найден)
  const metadataPath = protocolPaths.requestMetadata(requestId);
  const readyPath = protocolPaths.requestDataReady(requestId);
  const chunk0Path = protocolPaths.requestDataChunk(requestId, 0);
  assertEquals(storageProvider.deletedFiles.has(metadataPath), true);
  assertEquals(storageProvider.deletedFiles.has(readyPath), true);
  assertEquals(storageProvider.deletedFiles.has(chunk0Path), true);
});

