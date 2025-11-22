/**
 * Тесты для утилит
 */

import { assertEquals } from "https://deno.land/std@0.211.0/assert/mod.ts";
import { normalizePath, buildApiUrl, sleep, calculateDelay } from "../src/storage-provider/utils.ts";
import type { RetryConfig } from "../src/storage-provider/types.ts";

Deno.test("normalizePath - убирает ведущий слэш", () => {
  assertEquals(normalizePath("/path/to/file"), "path/to/file");
});

Deno.test("normalizePath - оставляет путь без слэша без изменений", () => {
  assertEquals(normalizePath("path/to/file"), "path/to/file");
});

Deno.test("normalizePath - обрабатывает пустой путь", () => {
  assertEquals(normalizePath(""), "");
});

Deno.test("normalizePath - обрабатывает только слэш", () => {
  assertEquals(normalizePath("/"), "");
});

Deno.test("buildApiUrl - строит правильный URL с параметрами", () => {
  const url = buildApiUrl("https://api.example.com", "/endpoint", {
    param1: "value1",
    param2: "value2",
  });
  
  assertEquals(
    url,
    "https://api.example.com/endpoint?param1=value1&param2=value2"
  );
});

Deno.test("buildApiUrl - кодирует специальные символы в параметрах", () => {
  const url = buildApiUrl("https://api.example.com", "/endpoint", {
    path: "/path/to/file",
    query: "test&value",
  });
  
  assertEquals(
    url,
    "https://api.example.com/endpoint?path=%2Fpath%2Fto%2Ffile&query=test%26value"
  );
});

Deno.test("buildApiUrl - обрабатывает пустые параметры", () => {
  const url = buildApiUrl("https://api.example.com", "/endpoint", {});
  
  assertEquals(url, "https://api.example.com/endpoint?");
});

Deno.test("sleep - создает промис с задержкой", async () => {
  const start = Date.now();
  await sleep(50);
  const duration = Date.now() - start;
  
  // Проверяем, что задержка была примерно 50ms (с допуском ±20ms)
  assertEquals(duration >= 50 && duration < 100, true);
});

Deno.test("calculateDelay - использует retryAfter если указан", () => {
  const config: RetryConfig = {
    maxRetries: 5,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
  };
  
  const delay = calculateDelay(1000, "5", config);
  assertEquals(delay, 5000);
});

Deno.test("calculateDelay - использует exponential backoff если retryAfter не указан", () => {
  const config: RetryConfig = {
    maxRetries: 5,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
  };
  
  const delay = calculateDelay(1000, null, config);
  assertEquals(delay, 2000); // 1000 * 2
});

Deno.test("calculateDelay - ограничивает задержку maxDelayMs", () => {
  const config: RetryConfig = {
    maxRetries: 5,
    initialDelayMs: 1000,
    maxDelayMs: 5000,
    backoffMultiplier: 10,
  };
  
  const delay = calculateDelay(1000, null, config);
  assertEquals(delay, 5000); // Ограничено maxDelayMs, а не 10000
});

