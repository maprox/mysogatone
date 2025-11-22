/**
 * Тесты для очистки файлов запроса
 */

import { assertEquals } from "https://deno.land/std@0.211.0/assert/mod.ts";
import { cleanupRequest } from "../../src/listener/request-cleanup.ts";
import { ProtocolPaths } from "../../../../shared/protocol/types.ts";

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
  const dataPath = protocolPaths.requestData(requestId);
  
  // Добавляем файлы
  storageProvider.files.set(metadataPath, new Uint8Array([1]));
  storageProvider.files.set(dataPath, new Uint8Array([2]));
  
  await cleanupRequest(requestId, storageProvider, protocolPaths);
  
  // Проверяем, что файлы были удалены
  assertEquals(storageProvider.deletedFiles.has(metadataPath), true);
  assertEquals(storageProvider.deletedFiles.has(dataPath), true);
  assertEquals(storageProvider.files.has(metadataPath), false);
  assertEquals(storageProvider.files.has(dataPath), false);
});

Deno.test("cleanupRequest - игнорирует ошибки удаления", async () => {
  const storageProvider = new MockStorageProvider();
  const protocolPaths = new ProtocolPaths("requests", "responses");
  const requestId = "test-request-id-2";
  
  // Не добавляем файлы - удаление должно завершиться без ошибок
  
  // Функция не должна выбрасывать ошибку
  await cleanupRequest(requestId, storageProvider, protocolPaths);
  
  // Проверяем, что попытка удаления была сделана
  const metadataPath = protocolPaths.requestMetadata(requestId);
  const dataPath = protocolPaths.requestData(requestId);
  assertEquals(storageProvider.deletedFiles.has(metadataPath), true);
  assertEquals(storageProvider.deletedFiles.has(dataPath), true);
});

