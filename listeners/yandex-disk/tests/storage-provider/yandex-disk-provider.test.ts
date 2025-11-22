/**
 * Тесты для YandexDiskProvider
 */

import { assertEquals, assertRejects, assertInstanceOf } from "https://deno.land/std@0.211.0/assert/mod.ts";
import { YandexDiskProvider } from "@src/storage-provider/yandex-disk-provider.ts";
import { YandexDiskApiError } from "@src/storage-provider/errors.ts";

Deno.test("YandexDiskProvider - создается с токеном", () => {
  const provider = new YandexDiskProvider("test-token");
  assertInstanceOf(provider, YandexDiskProvider);
});

Deno.test("YandexDiskProvider - выбрасывает ошибку без токена", async () => {
  await assertRejects(
    async () => {
      new YandexDiskProvider("");
    },
    Error,
    "Access token is required"
  );
});

Deno.test("YandexDiskProvider - listFiles возвращает список файлов", async () => {
  const provider = new YandexDiskProvider("test-token");
  
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const headers = new Headers(init?.headers);
    
    // Проверяем авторизацию
    assertEquals(headers.get("Authorization"), "OAuth test-token");
    
    return new Response(
      JSON.stringify({
        _embedded: {
          items: [
            {
              name: "file1.txt",
              path: "/folder/file1.txt",
              size: 1024,
              modified: "2023-01-01T00:00:00Z",
            },
            {
              name: "file2.txt",
              path: "/folder/file2.txt",
              size: 2048,
              modified: "2023-01-02T00:00:00Z",
            },
          ],
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };
  
  try {
    const files = await provider.listFiles("folder");
    assertEquals(files.length, 2);
    assertEquals(files[0].name, "file1.txt");
    assertEquals(files[1].name, "file2.txt");
    // URL может содержать закодированные параметры, проверяем через URL объект
    const url = new URL(requestUrl);
    assertEquals(url.searchParams.get("path"), "/folder");
    assertEquals(url.searchParams.get("limit"), "1000");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("YandexDiskProvider - listFiles возвращает пустой массив если нет файлов", async () => {
  const provider = new YandexDiskProvider("test-token");
  
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response(
      JSON.stringify({ _embedded: {} }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };
  
  try {
    const files = await provider.listFiles("folder");
    assertEquals(files.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("YandexDiskProvider - downloadFile скачивает файл", async () => {
  const provider = new YandexDiskProvider("test-token");
  const testData = new Uint8Array([1, 2, 3, 4, 5]);
  
  let callCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    callCount++;
    
    // Первый вызов - получение ссылки для скачивания
    if (callCount === 1) {
      return new Response(
        JSON.stringify({ href: "https://download.example.com/file" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    
    // Второй вызов - скачивание файла
    if (callCount === 2) {
      // executeFileOperation передает method="GET" явно
      assertEquals(init?.method, "GET");
      return new Response(testData.buffer, { status: 200 });
    }
    
    throw new Error("Unexpected call");
  };
  
  try {
    const data = await provider.downloadFile("folder/file.txt");
    assertEquals(data.length, testData.length);
    assertEquals(callCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("YandexDiskProvider - uploadFile загружает файл", async () => {
  const provider = new YandexDiskProvider("test-token");
  const testData = new Uint8Array([1, 2, 3, 4, 5]);
  
  let callCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    callCount++;
    
    // Первый вызов - получение ссылки для загрузки
    if (callCount === 1) {
      assertEquals(init?.method, "GET");
      return new Response(
        JSON.stringify({ href: "https://upload.example.com/file" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    
    // Второй вызов - загрузка файла
    if (callCount === 2) {
      assertEquals(init?.method, "PUT");
      assertEquals(init?.body, testData);
      return new Response(null, { status: 201 });
    }
    
    throw new Error("Unexpected call");
  };
  
  try {
    await provider.uploadFile("folder/file.txt", testData);
    assertEquals(callCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("YandexDiskProvider - deleteFile удаляет файл", async () => {
  const provider = new YandexDiskProvider("test-token");
  
  let requestMethod = "";
  let requestUrl = "";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    requestMethod = init?.method || "";
    requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return new Response(null, { status: 204 });
  };
  
  try {
    await provider.deleteFile("folder/file.txt");
    assertEquals(requestMethod, "DELETE");
    const url = new URL(requestUrl);
    assertEquals(url.searchParams.get("path"), "/folder/file.txt");
    assertEquals(url.searchParams.get("permanently"), "true");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("YandexDiskProvider - нормализует пути", async () => {
  const provider = new YandexDiskProvider("test-token");
  
  let requestUrl = "";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL) => {
    requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return new Response(
      JSON.stringify({ _embedded: { items: [] } }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };
  
  try {
    await provider.listFiles("/folder"); // Путь с ведущим слэшем
    const url = new URL(requestUrl);
    assertEquals(url.searchParams.get("path"), "/folder");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

