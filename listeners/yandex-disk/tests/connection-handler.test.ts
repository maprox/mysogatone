/**
 * Тесты для обработчика подключений
 */

import { assertEquals, assertRejects } from "https://deno.land/std@0.211.0/assert/mod.ts";
import { ConnectionHandler } from "@src/connection-handler.ts";
import { ProtocolPaths } from "@shared/protocol/types.ts";
import type { RequestMetadata } from "@shared/protocol/types.ts";

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

// Мок TCP соединения
class MockTcpConn implements Deno.TcpConn {
  private responseData: Uint8Array;
  private readIndex: number = 0;
  private closed: boolean = false;
  
  constructor(responseData: Uint8Array) {
    this.responseData = responseData;
  }
  
  async read(p: Uint8Array): Promise<number | null> {
    if (this.closed || this.readIndex >= this.responseData.length) {
      return null;
    }
    
    const bytesToRead = Math.min(this.responseData.length - this.readIndex, p.length);
    p.set(this.responseData.slice(this.readIndex, this.readIndex + bytesToRead));
    this.readIndex += bytesToRead;
    
    // Имитируем задержку перед закрытием
    if (this.readIndex >= this.responseData.length) {
      await new Promise(resolve => setTimeout(resolve, 50));
      this.closed = true;
    }
    
    return bytesToRead;
  }
  
  async write(p: Uint8Array): Promise<number> {
    return p.length;
  }
  
  close(): void {
    this.closed = true;
  }
  
  closeWrite(): Promise<void> {
    return Promise.resolve();
  }
  
  setNoDelay(_noDelay?: boolean): void {}
  setKeepAlive(_keepAlive?: boolean): void {}
  
  ref(): void {}
  unref(): void {}
  
  readonly localAddr!: Deno.NetAddr;
  readonly remoteAddr!: Deno.NetAddr;
  readonly rid!: number;
  readonly readable!: ReadableStream<Uint8Array<ArrayBuffer>>;
  readonly writable!: WritableStream<Uint8Array<ArrayBuffer>>;
  
  [Symbol.dispose](): void {
    this.close();
  }
}

Deno.test({
  name: "ConnectionHandler - обрабатывает успешное подключение",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const storageProvider = new MockStorageProvider();
  const protocolPaths = new ProtocolPaths("requests", "responses");
  const handler = new ConnectionHandler(storageProvider, protocolPaths, 5000);
  
  const requestId = "test-request-id";
  const requestData = new Uint8Array([1, 2, 3]);
  const responseData = new Uint8Array([4, 5, 6]);
  
  // Мокаем TCP соединение
  const originalConnect = Deno.connect;
  (Deno as any).connect = async (options: Deno.ConnectOptions) => {
    if ('port' in options) {
      return new MockTcpConn(responseData) as unknown as Deno.TcpConn;
    }
    throw new Error("Unsupported connection type");
  };
  
  try {
    const request: RequestMetadata = {
      requestId,
      targetAddress: "example.com",
      targetPort: 80,
    };
    
    await handler.handleConnection({
      ...request,
      requestData,
    });
    
    // Проверяем, что ответ был записан
    const responsePath = protocolPaths.response(requestId);
    const uploadedResponse = storageProvider.uploadedFiles.get(responsePath);
    
    assertEquals(uploadedResponse !== undefined, true);
    assertEquals(uploadedResponse!.length, responseData.length);
    assertEquals(Array.from(uploadedResponse!), Array.from(responseData));
  } finally {
    (Deno as any).connect = originalConnect;
  }
});

Deno.test({
  name: "ConnectionHandler - обрабатывает ошибку подключения",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const storageProvider = new MockStorageProvider();
  const protocolPaths = new ProtocolPaths("requests", "responses");
  const handler = new ConnectionHandler(storageProvider, protocolPaths, 100);
  
  const requestId = "test-request-id-2";
  const requestData = new Uint8Array([1, 2, 3]);
  
  // Мокаем TCP соединение с ошибкой
  const originalConnect = Deno.connect;
  (Deno as any).connect = async (options: Deno.ConnectOptions) => {
    if ('port' in options) {
      throw new Error("Connection timeout");
    }
    throw new Error("Unsupported connection type");
  };
  
  try {
    const request: RequestMetadata = {
      requestId,
      targetAddress: "example.com",
      targetPort: 80,
    };
    
    await assertRejects(
      async () => {
        await handler.handleConnection({
          ...request,
          requestData,
        });
      },
      Error,
      "Connection timeout"
    );
    
    // Проверяем, что ошибка была записана
    const errorPath = protocolPaths.error(requestId);
    const uploadedError = storageProvider.uploadedFiles.get(errorPath);
    
    assertEquals(uploadedError !== undefined, true);
    
    const errorJson = JSON.parse(new TextDecoder().decode(uploadedError!));
    assertEquals(errorJson.requestId, requestId);
    assertEquals(errorJson.error, "Connection timeout");
  } finally {
    (Deno as any).connect = originalConnect;
  }
});

Deno.test({
  name: "ConnectionHandler - закрывает соединение в finally",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const storageProvider = new MockStorageProvider();
  const protocolPaths = new ProtocolPaths("requests", "responses");
  const handler = new ConnectionHandler(storageProvider, protocolPaths, 5000);
  
  const requestId = "test-request-id-3";
  const requestData = new Uint8Array([1, 2, 3]);
  const responseData = new Uint8Array([4, 5, 6]);
  
  let connectionClosed = false;
  
  // Мокаем TCP соединение
  const originalConnect = Deno.connect;
  (Deno as any).connect = async (options: Deno.ConnectOptions) => {
    if ('port' in options) {
      const conn = new MockTcpConn(responseData);
      const originalClose = conn.close.bind(conn);
      conn.close = () => {
        connectionClosed = true;
        originalClose();
      };
      return conn as unknown as Deno.TcpConn;
    }
    throw new Error("Unsupported connection type");
  };
  
  try {
    const request: RequestMetadata = {
      requestId,
      targetAddress: "example.com",
      targetPort: 80,
    };
    
    await handler.handleConnection({
      ...request,
      requestData,
    });
    
    // Проверяем, что соединение было закрыто
    assertEquals(connectionClosed, true);
  } finally {
    (Deno as any).connect = originalConnect;
  }
});

