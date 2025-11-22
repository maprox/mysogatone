/**
 * Тесты для классов ошибок
 */

import { assertEquals, assertInstanceOf } from "https://deno.land/std@0.211.0/assert/mod.ts";
import { YandexDiskApiError } from "@src/storage-provider/errors.ts";

Deno.test("YandexDiskApiError - создается с правильными свойствами", () => {
  const error = new YandexDiskApiError("Test error", 404, "NOT_FOUND");
  
  assertEquals(error.message, "Test error");
  assertEquals(error.statusCode, 404);
  assertEquals(error.code, "NOT_FOUND");
  assertEquals(error.name, "YandexDiskApiError");
  assertInstanceOf(error, Error);
});

Deno.test("YandexDiskApiError - создается без кода", () => {
  const error = new YandexDiskApiError("Test error", 500);
  
  assertEquals(error.message, "Test error");
  assertEquals(error.statusCode, 500);
  assertEquals(error.code, undefined);
});

Deno.test("YandexDiskApiError - можно выбросить и поймать", () => {
  try {
    throw new YandexDiskApiError("Test error", 404);
  } catch (error) {
    assertInstanceOf(error, YandexDiskApiError);
    assertEquals((error as YandexDiskApiError).statusCode, 404);
  }
});

