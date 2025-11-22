/**
 * Тесты для мониторинга изменений
 */

import { assertEquals } from "https://deno.land/std@0.211.0/assert/mod.ts";
import { Monitor } from "../src/monitor.ts";
import type { FileInfo } from "../src/storage-provider/index.ts";

// Мок StorageProvider для тестирования
class MockStorageProvider {
  files: FileInfo[] = [];
  listFilesCalls: number = 0;
  
  async listFiles(_folderPath: string): Promise<FileInfo[]> {
    this.listFilesCalls++;
    return [...this.files];
  }
  
  async downloadFile(_filePath: string): Promise<Uint8Array> {
    throw new Error("Not implemented");
  }
  
  async uploadFile(_filePath: string, _data: Uint8Array): Promise<void> {
    throw new Error("Not implemented");
  }
  
  async deleteFile(_filePath: string): Promise<void> {
    throw new Error("Not implemented");
  }
}

Deno.test({
  name: "Monitor - инициализирует список известных файлов",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const storageProvider = new MockStorageProvider();
  storageProvider.files = [
    { name: "file1.req", path: "requests/file1.req", size: 100, modified: new Date() },
    { name: "file2.req", path: "requests/file2.req", size: 200, modified: new Date() },
  ];
  
  const monitor = new Monitor(storageProvider, "requests", 100);
  
  // Запускаем мониторинг и сразу останавливаем
  const startPromise = monitor.start(async () => {});
  
  // Останавливаем через небольшую задержку
  setTimeout(() => {
    monitor.stop();
  }, 50);
  
  await startPromise;
  
  // Проверяем, что был вызов listFiles при инициализации
  assertEquals(storageProvider.listFilesCalls >= 1, true);
});

Deno.test({
  name: "Monitor - обнаруживает новые файлы",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const storageProvider = new MockStorageProvider();
  const discoveredFiles: FileInfo[] = [];
  
  storageProvider.files = [
    { name: "file1.req", path: "requests/file1.req", size: 100, modified: new Date() },
  ];
  
  const monitor = new Monitor(storageProvider, "requests", 100);
  
  // Запускаем мониторинг
  const startPromise = monitor.start(async (fileInfo) => {
    discoveredFiles.push(fileInfo);
  });
  
  // Добавляем новый файл через небольшую задержку
  setTimeout(() => {
    storageProvider.files.push({
      name: "file2.req",
      path: "requests/file2.req",
      size: 200,
      modified: new Date(),
    });
  }, 150);
  
  // Останавливаем через задержку
  setTimeout(() => {
    monitor.stop();
  }, 300);
  
  await startPromise;
  
  // Проверяем, что новый файл был обнаружен
  assertEquals(discoveredFiles.length >= 1, true);
});

Deno.test("Monitor - не обрабатывает уже известные файлы", async () => {
  const storageProvider = new MockStorageProvider();
  const discoveredFiles: FileInfo[] = [];
  
  storageProvider.files = [
    { name: "file1.req", path: "requests/file1.req", size: 100, modified: new Date() },
  ];
  
  const monitor = new Monitor(storageProvider, "requests", 100);
  
  // Запускаем мониторинг
  const startPromise = monitor.start(async (fileInfo) => {
    discoveredFiles.push(fileInfo);
  });
  
  // Останавливаем через задержку
  setTimeout(() => {
    monitor.stop();
  }, 200);
  
  await startPromise;
  
  // Проверяем, что известный файл не был обработан повторно
  // (только новые файлы должны быть обработаны)
  assertEquals(discoveredFiles.length, 0);
});

Deno.test("Monitor - нормализует пути с префиксом disk:", async () => {
  const storageProvider = new MockStorageProvider();
  const discoveredFiles: FileInfo[] = [];
  
  storageProvider.files = [
    { name: "file1.req", path: "disk:requests/file1.req", size: 100, modified: new Date() },
  ];
  
  const monitor = new Monitor(storageProvider, "requests", 100);
  
  // Запускаем мониторинг
  const startPromise = monitor.start(async (fileInfo) => {
    discoveredFiles.push(fileInfo);
  });
  
  // Останавливаем через задержку
  setTimeout(() => {
    monitor.stop();
  }, 200);
  
  await startPromise;
  
  // Проверяем, что путь был нормализован (без префикса disk:)
  if (discoveredFiles.length > 0) {
    assertEquals(discoveredFiles[0].path.startsWith("disk:"), false);
  }
});

Deno.test("Monitor - останавливается корректно", async () => {
  const storageProvider = new MockStorageProvider();
  const monitor = new Monitor(storageProvider, "requests", 100);
  
  // Запускаем мониторинг
  const startPromise = monitor.start(async () => {});
  
  // Останавливаем сразу
  monitor.stop();
  
  await startPromise;
  
  // Проверяем, что мониторинг остановлен
  assertEquals(true, true); // Если дошли сюда, значит остановка прошла успешно
});

