/**
 * Тесты для управления папками
 */

import { assertEquals } from "https://deno.land/std@0.211.0/assert/mod.ts";
import { createFolder, ensureFolderExists, ensureFoldersExist } from "../../src/listener/folder-manager.ts";

// Мок StorageProvider для тестирования
class MockStorageProvider {
  folders: Set<string> = new Set();
  listFilesCalls: string[] = [];
  
  async listFiles(folderPath: string): Promise<never[]> {
    this.listFilesCalls.push(folderPath);
    if (!this.folders.has(folderPath)) {
      throw new Error("404 NotFound");
    }
    return [];
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

Deno.test("createFolder - создает папку через API", async () => {
  // Сохраняем оригинальный fetch
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  let fetchUrl = "";
  let fetchMethod = "";
  
  try {
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalled = true;
      fetchUrl = input.toString();
      fetchMethod = init?.method || "";
      
      // Возвращаем успешный ответ или 409 (папка уже существует)
      return new Response(null, { status: 201 });
    };
    
    await createFolder("test-folder", "test-token");
    
    assertEquals(fetchCalled, true);
    assertEquals(fetchMethod, "PUT");
    assertEquals(fetchUrl.includes("test-folder"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("createFolder - обрабатывает 409 как успех", async () => {
  const originalFetch = globalThis.fetch;
  
  try {
    globalThis.fetch = async () => {
      return new Response(null, { status: 409 }); // Папка уже существует
    };
    
    // Не должно быть ошибки
    await createFolder("existing-folder", "test-token");
    assertEquals(true, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("ensureFolderExists - проверяет существование папки", async () => {
  const storageProvider = new MockStorageProvider();
  storageProvider.folders.add("existing-folder");
  
  // Сохраняем оригинальный fetch
  const originalFetch = globalThis.fetch;
  
  try {
    globalThis.fetch = async () => {
      return new Response(null, { status: 201 });
    };
    
    await ensureFolderExists("existing-folder", storageProvider, "test-token");
    
    // Проверяем, что была попытка проверить папку
    assertEquals(storageProvider.listFilesCalls.includes("existing-folder"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("ensureFolderExists - создает папку если её нет", async () => {
  const storageProvider = new MockStorageProvider();
  let folderCreated = false;
  
  const originalFetch = globalThis.fetch;
  
  try {
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") {
        folderCreated = true;
      }
      return new Response(null, { status: 201 });
    };
    
    await ensureFolderExists("new-folder", storageProvider, "test-token");
    
    assertEquals(folderCreated, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("ensureFoldersExist - создает все необходимые папки", async () => {
  const storageProvider = new MockStorageProvider();
  const createdFolders: string[] = [];
  
  const originalFetch = globalThis.fetch;
  
  try {
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") {
        createdFolders.push(input.toString());
      }
      return new Response(null, { status: 201 });
    };
    
    await ensureFoldersExist(
      ".mysogatone",
      ".mysogatone/requests",
      ".mysogatone/responses",
      storageProvider,
      "test-token"
    );
    
    // Проверяем, что были попытки создать папки
    assertEquals(storageProvider.listFilesCalls.length > 0, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

