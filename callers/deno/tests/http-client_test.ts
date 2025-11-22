/**
 * Тесты для HTTP клиента
 */

import { assertEquals, assertRejects, assertInstanceOf } from "https://deno.land/std@0.211.0/assert/mod.ts";
import {
  createAuthHeaders,
  parseApiError,
  handleRateLimit,
  executeRequest,
  shouldRetry,
  executeWithRetry,
} from "../src/storage-provider/http-client.ts";
import { YandexDiskApiError } from "../src/storage-provider/errors.ts";
import type { RetryConfig } from "../src/storage-provider/types.ts";

Deno.test("createAuthHeaders - создает заголовки с авторизацией", () => {
  const headers = createAuthHeaders("test-token");
  
  assertEquals(headers.get("Authorization"), "OAuth test-token");
  assertEquals(headers.get("Accept"), "application/json");
});

Deno.test("parseApiError - парсит ошибку из JSON ответа", async () => {
  const response = new Response(
    JSON.stringify({
      error: "InvalidRequest",
      error_description: "Invalid parameter",
      code: "INVALID_PARAM",
    }),
    { status: 400, headers: { "Content-Type": "application/json" } }
  );
  
  const error = await parseApiError(response);
  
  assertInstanceOf(error, YandexDiskApiError);
  assertEquals(error.message, "InvalidRequest: Invalid parameter");
  assertEquals(error.statusCode, 400);
  assertEquals(error.code, "INVALID_PARAM");
});

Deno.test("parseApiError - использует текст ответа если JSON невалиден", async () => {
  // Создаем новый Response для каждого теста, так как body можно прочитать только один раз
  const response = new Response(
    "Plain text error",
    { status: 500 }
  );
  
  const error = await parseApiError(response);
  
  assertEquals(error.message, "Plain text error");
  assertEquals(error.statusCode, 500);
});

Deno.test("parseApiError - использует дефолтное сообщение если нет данных", async () => {
  const response = new Response(
    "",
    { status: 404 }
  );
  
  const error = await parseApiError(response);
  
  assertEquals(error.message, "API request failed with status 404");
  assertEquals(error.statusCode, 404);
});

Deno.test("handleRateLimit - возвращает null если не 429", async () => {
  const response = new Response(null, { status: 200 });
  const config: RetryConfig = {
    maxRetries: 5,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
  };
  
  const result = await handleRateLimit(response, 0, 1000, config);
  
  assertEquals(result, null);
});

Deno.test("handleRateLimit - возвращает null если достигнут maxRetries", async () => {
  const response = new Response(null, { status: 429 });
  const config: RetryConfig = {
    maxRetries: 5,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
  };
  
  const result = await handleRateLimit(response, 5, 1000, config);
  
  assertEquals(result, null);
});

Deno.test("handleRateLimit - обрабатывает 429 и возвращает новую задержку", async () => {
  const response = new Response(null, {
    status: 429,
    headers: { "Retry-After": "2" },
  });
  const config: RetryConfig = {
    maxRetries: 5,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
  };
  
  const start = Date.now();
  const result = await handleRateLimit(response, 0, 1000, config);
  const duration = Date.now() - start;
  
  assertEquals(result, 2000); // 2 секунды из Retry-After
  assertEquals(duration >= 2000 && duration < 2100, true); // Проверяем что была задержка
});

Deno.test("executeRequest - выполняет успешный запрос", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response("OK", { status: 200 });
  };
  
  try {
    const response = await executeRequest("https://example.com", {});
    assertEquals(response.status, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("executeRequest - преобразует ошибки в Error", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw "String error";
  };
  
  try {
    await assertRejects(
      async () => await executeRequest("https://example.com", {}),
      Error
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("shouldRetry - возвращает false если достигнут maxRetries", () => {
  const error = new YandexDiskApiError("Error", 500);
  assertEquals(shouldRetry(error, 5, 5), false);
});

Deno.test("shouldRetry - возвращает false для 401 ошибки", () => {
  const error = new YandexDiskApiError("Unauthorized", 401);
  assertEquals(shouldRetry(error, 0, 5), false);
});

Deno.test("shouldRetry - возвращает false для 403 ошибки", () => {
  const error = new YandexDiskApiError("Forbidden", 403);
  assertEquals(shouldRetry(error, 0, 5), false);
});

Deno.test("shouldRetry - возвращает true для retryable ошибки", () => {
  const error = new YandexDiskApiError("Server Error", 500);
  assertEquals(shouldRetry(error, 0, 5), true);
});

Deno.test("shouldRetry - возвращает false для не-YandexDiskApiError", () => {
  const error = new Error("Network error");
  assertEquals(shouldRetry(error, 0, 5), false);
});

Deno.test("executeWithRetry - возвращает успешный ответ сразу", async () => {
  let callCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    callCount++;
    return new Response("OK", { status: 200 });
  };
  
  const config: RetryConfig = {
    maxRetries: 3,
    initialDelayMs: 10,
    maxDelayMs: 1000,
    backoffMultiplier: 2,
  };
  
  try {
    const response = await executeWithRetry("https://example.com", {}, config);
    assertEquals(response.status, 200);
    assertEquals(callCount, 1); // Должен быть только один вызов
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("executeWithRetry - делает retry при ошибке", async () => {
  let callCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    callCount++;
    if (callCount < 2) {
      return new Response("Error", { status: 500 });
    }
    return new Response("OK", { status: 200 });
  };
  
  const config: RetryConfig = {
    maxRetries: 3,
    initialDelayMs: 10,
    maxDelayMs: 1000,
    backoffMultiplier: 2,
  };
  
  try {
    const response = await executeWithRetry("https://example.com", {}, config);
    assertEquals(response.status, 200);
    assertEquals(callCount, 2); // Должен быть retry
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("executeWithRetry - выбрасывает ошибку после всех retry", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response("Error", { status: 500 });
  };
  
  const config: RetryConfig = {
    maxRetries: 2,
    initialDelayMs: 10,
    maxDelayMs: 1000,
    backoffMultiplier: 2,
  };
  
  try {
    await assertRejects(
      async () => await executeWithRetry("https://example.com", {}, config),
      YandexDiskApiError
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

