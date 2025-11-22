/**
 * Тесты для чтения ответа от TCP соединения
 */

import { assertEquals, assertRejects } from "https://deno.land/std@0.211.0/assert/mod.ts";
import { readResponse } from "../../src/connection/response-reader.ts";

// Мок TCP соединения для тестирования
class MockTcpConn implements Deno.TcpConn {
  private allData: Uint8Array;
  private readOffset: number = 0;
  private closed: boolean = false;
  
  constructor(data: Uint8Array[]) {
    // Объединяем все чанки в один массив
    const totalLength = data.reduce((sum, chunk) => sum + chunk.length, 0);
    this.allData = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of data) {
      this.allData.set(chunk, offset);
      offset += chunk.length;
    }
  }
  
  async read(p: Uint8Array): Promise<number | null> {
    if (this.closed) {
      return null;
    }
    
    if (this.readOffset >= this.allData.length) {
      // Все данные прочитаны, закрываем соединение
      await new Promise(resolve => setTimeout(resolve, 50));
      this.closed = true;
      return null;
    }
    
    const bytesToRead = Math.min(this.allData.length - this.readOffset, p.length);
    p.set(this.allData.slice(this.readOffset, this.readOffset + bytesToRead));
    this.readOffset += bytesToRead;
    
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
  readonly readable!: ReadableStream<Uint8Array>;
  readonly writable!: WritableStream<Uint8Array>;
  
  [Symbol.dispose](): void {
    this.close();
  }
}

Deno.test({
  name: "readResponse - читает данные из соединения",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const testData = [
    new Uint8Array([1, 2, 3]),
    new Uint8Array([4, 5, 6]),
    new Uint8Array([7, 8, 9]),
  ];
  
  const conn = new MockTcpConn(testData);
  const result = await readResponse(conn, 1000);
  
  assertEquals(result.length, 9);
  assertEquals(Array.from(result), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

Deno.test({
  name: "readResponse - читает большой объем данных",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const largeData = new Uint8Array(10000);
  for (let i = 0; i < largeData.length; i++) {
    largeData[i] = i % 256;
  }
  
  const conn = new MockTcpConn([largeData]);
  const result = await readResponse(conn, 1000);
  
  assertEquals(result.length, 10000);
});

Deno.test({
  name: "readResponse - выбрасывает ошибку если нет данных",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const conn = new MockTcpConn([]);
  
  await assertRejects(
    async () => await readResponse(conn, 100),
    Error,
    "No data received from server"
  );
});

Deno.test({
  name: "readResponse - обрабатывает закрытое соединение",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const testData = [new Uint8Array([1, 2, 3])];
  const conn = new MockTcpConn(testData);
  
  // Читаем данные до закрытия
  const result = await readResponse(conn, 1000);
  assertEquals(result.length, 3);
  assertEquals(Array.from(result), [1, 2, 3]);
});

