/**
 * Тесты для операций с файлами
 */

import { assertEquals, assertRejects, assertInstanceOf } from "https://deno.land/std@0.211.0/assert/mod.ts";
import { mapToFileInfo, getOperationLink, executeFileOperation } from "../../src/storage-provider/file-operations.ts";
import { YandexDiskApiError } from "../../src/storage-provider/errors.ts";

Deno.test("mapToFileInfo - преобразует элемент API в FileInfo", () => {
  const item = {
    name: "test.txt",
    path: "/test.txt",
    size: 1024,
    modified: "2023-01-01T00:00:00Z",
  };
  
  const fileInfo = mapToFileInfo(item);
  
  assertEquals(fileInfo.name, "test.txt");
  assertEquals(fileInfo.path, "/test.txt");
  assertEquals(fileInfo.size, 1024);
  assertInstanceOf(fileInfo.modified, Date);
});

Deno.test("mapToFileInfo - использует 0 для размера если не указан", () => {
  const item = {
    name: "test.txt",
    path: "/test.txt",
    modified: "2023-01-01T00:00:00Z",
  };
  
  const fileInfo = mapToFileInfo(item);
  
  assertEquals(fileInfo.size, 0);
});

Deno.test("getOperationLink - извлекает ссылку из ответа для download", async () => {
  const response = new Response(
    JSON.stringify({ href: "https://example.com/download" }),
    { headers: { "Content-Type": "application/json" } }
  );
  
  const href = await getOperationLink(response, "download");
  
  assertEquals(href, "https://example.com/download");
});

Deno.test("getOperationLink - извлекает ссылку из ответа для upload", async () => {
  const response = new Response(
    JSON.stringify({ href: "https://example.com/upload" }),
    { headers: { "Content-Type": "application/json" } }
  );
  
  const href = await getOperationLink(response, "upload");
  
  assertEquals(href, "https://example.com/upload");
});

Deno.test("getOperationLink - выбрасывает ошибку если href отсутствует", async () => {
  const response = new Response(
    JSON.stringify({}),
    { headers: { "Content-Type": "application/json" } }
  );
  
  await assertRejects(
    async () => await getOperationLink(response, "download"),
    YandexDiskApiError,
    "Download link not found in API response"
  );
});

Deno.test("executeFileOperation - скачивает файл через GET", async () => {
  const testData = new Uint8Array([1, 2, 3, 4, 5]);
  
  // Мокаем fetch для теста
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    assertEquals(init?.method, "GET");
    return new Response(testData.buffer, { status: 200 });
  };
  
  try {
    const result = await executeFileOperation("https://example.com/file", null, "GET");
    assertEquals(result instanceof Uint8Array, true);
    assertEquals((result as Uint8Array).length, testData.length);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("executeFileOperation - загружает файл через PUT", async () => {
  const testData = new Uint8Array([1, 2, 3, 4, 5]);
  
  // Мокаем fetch для теста
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    assertEquals(init?.method, "PUT");
    assertEquals(init?.body, testData);
    return new Response(null, { status: 200 });
  };
  
  try {
    const result = await executeFileOperation("https://example.com/file", testData, "PUT");
    assertEquals(result, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("executeFileOperation - выбрасывает ошибку при неудачной загрузке", async () => {
  const testData = new Uint8Array([1, 2, 3]);
  
  // Мокаем fetch для теста
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response("Error", { status: 500, statusText: "Internal Server Error" });
  };
  
  try {
    await assertRejects(
      async () => await executeFileOperation("https://example.com/file", testData, "PUT"),
      YandexDiskApiError,
      "Failed to upload file: Internal Server Error"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

