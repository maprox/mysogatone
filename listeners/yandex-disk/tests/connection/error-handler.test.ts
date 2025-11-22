/**
 * Тесты для обработки ошибок подключения
 */

import { assertEquals } from "https://deno.land/std@0.211.0/assert/mod.ts";
import { handleConnectionError } from "../../src/connection/error-handler.ts";
import { ProtocolPaths } from "../../../../shared/protocol/types.ts";
import { ErrorCode } from "../../../../shared/protocol/types.ts";

// Мок StorageProvider для тестирования
class MockStorageProvider {
  uploadedFiles: Map<string, Uint8Array> = new Map();
  
  async uploadFile(filePath: string, data: Uint8Array): Promise<void> {
    this.uploadedFiles.set(filePath, data);
  }
  
  async downloadFile(_filePath: string): Promise<Uint8Array> {
    throw new Error("Not implemented");
  }
  
  async deleteFile(_filePath: string): Promise<void> {
    throw new Error("Not implemented");
  }
  
  async listFiles(_folderPath: string): Promise<never[]> {
    throw new Error("Not implemented");
  }
}

Deno.test("handleConnectionError - обрабатывает Error с timeout", async () => {
  const storageProvider = new MockStorageProvider();
  const protocolPaths = new ProtocolPaths("requests", "responses");
  const requestId = "test-request-id";
  const error = new Error("Connection timeout after 5000ms");
  
  await handleConnectionError(requestId, error, storageProvider, protocolPaths);
  
  const errorPath = protocolPaths.error(requestId);
  const errorData = storageProvider.uploadedFiles.get(errorPath);
  
  assertEquals(errorData !== undefined, true);
  
  const errorJson = JSON.parse(new TextDecoder().decode(errorData!));
  assertEquals(errorJson.requestId, requestId);
  assertEquals(errorJson.error, "Connection timeout after 5000ms");
  assertEquals(errorJson.code, ErrorCode.TIMEOUT);
  assertEquals(typeof errorJson.timestamp, "number");
});

Deno.test("handleConnectionError - обрабатывает Error с connection refused", async () => {
  const storageProvider = new MockStorageProvider();
  const protocolPaths = new ProtocolPaths("requests", "responses");
  const requestId = "test-request-id-2";
  const error = new Error("Connection refused");
  
  await handleConnectionError(requestId, error, storageProvider, protocolPaths);
  
  const errorPath = protocolPaths.error(requestId);
  const errorData = storageProvider.uploadedFiles.get(errorPath);
  
  assertEquals(errorData !== undefined, true);
  
  const errorJson = JSON.parse(new TextDecoder().decode(errorData!));
  assertEquals(errorJson.requestId, requestId);
  assertEquals(errorJson.error, "Connection refused");
  assertEquals(errorJson.code, ErrorCode.CONNECTION_ERROR);
});

Deno.test("handleConnectionError - обрабатывает строковую ошибку", async () => {
  const storageProvider = new MockStorageProvider();
  const protocolPaths = new ProtocolPaths("requests", "responses");
  const requestId = "test-request-id-3";
  const error = "String error message";
  
  await handleConnectionError(requestId, error, storageProvider, protocolPaths);
  
  const errorPath = protocolPaths.error(requestId);
  const errorData = storageProvider.uploadedFiles.get(errorPath);
  
  assertEquals(errorData !== undefined, true);
  
  const errorJson = JSON.parse(new TextDecoder().decode(errorData!));
  assertEquals(errorJson.requestId, requestId);
  assertEquals(errorJson.error, "String error message");
  assertEquals(errorJson.code, ErrorCode.CONNECTION_ERROR);
});

Deno.test("handleConnectionError - обрабатывает неизвестную ошибку", async () => {
  const storageProvider = new MockStorageProvider();
  const protocolPaths = new ProtocolPaths("requests", "responses");
  const requestId = "test-request-id-4";
  const error = { some: "object" };
  
  await handleConnectionError(requestId, error, storageProvider, protocolPaths);
  
  const errorPath = protocolPaths.error(requestId);
  const errorData = storageProvider.uploadedFiles.get(errorPath);
  
  assertEquals(errorData !== undefined, true);
  
  const errorJson = JSON.parse(new TextDecoder().decode(errorData!));
  assertEquals(errorJson.requestId, requestId);
  assertEquals(errorJson.error, "Unknown error");
  assertEquals(errorJson.code, ErrorCode.CONNECTION_ERROR);
});

