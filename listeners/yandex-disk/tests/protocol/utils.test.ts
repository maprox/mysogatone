/**
 * Тесты для утилит протокола
 */

import { assertEquals, assert } from "https://deno.land/std@0.211.0/assert/mod.ts";
import {
  generateRequestId,
  parseRequestId,
  isRequestMetadata,
  isRequestData,
  isResponse,
  isError,
} from "@shared/protocol/utils.ts";

// UUID v4 regex для валидации
const UUID_V4_REGEX = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

Deno.test("generateRequestId - генерирует валидный UUID v4", () => {
  const id = generateRequestId();
  
  // Проверяем формат UUID v4
  assertEquals(UUID_V4_REGEX.test(id), true);
});

Deno.test("generateRequestId - генерирует уникальные идентификаторы", () => {
  const id1 = generateRequestId();
  const id2 = generateRequestId();
  
  // Два последовательных вызова должны дать разные ID
  assertEquals(id1 !== id2, true);
});

Deno.test("generateRequestId - генерирует строку правильной длины", () => {
  const id = generateRequestId();
  
  // UUID v4 всегда имеет длину 36 символов (32 hex + 4 дефиса)
  assertEquals(id.length, 36);
});

Deno.test("parseRequestId - извлекает UUID из .req файла", () => {
  const requestId = "550e8400-e29b-41d4-a716-446655440000";
  const filename = `${requestId}.req`;
  
  const parsed = parseRequestId(filename);
  
  assertEquals(parsed, requestId);
});

Deno.test("parseRequestId - извлекает UUID из .data файла", () => {
  const requestId = "550e8400-e29b-41d4-a716-446655440000";
  const filename = `${requestId}.data`;
  
  const parsed = parseRequestId(filename);
  
  assertEquals(parsed, requestId);
});

Deno.test("parseRequestId - не извлекает UUID из файла с путем (требуется только имя файла)", () => {
  const requestId = "550e8400-e29b-41d4-a716-446655440000";
  const filepath = `requests/${requestId}.req`;
  
  const parsed = parseRequestId(filepath);
  
  // Функция работает только с именами файлов, не с путями
  // В реальном коде путь обрабатывается через filePath.split("/").pop()
  assertEquals(parsed, null);
});

Deno.test("parseRequestId - возвращает null для невалидного формата", () => {
  const filename = "invalid-file.txt";
  
  const parsed = parseRequestId(filename);
  
  assertEquals(parsed, null);
});

Deno.test("parseRequestId - возвращает null для файла без расширения", () => {
  const filename = "550e8400-e29b-41d4-a716-446655440000";
  
  const parsed = parseRequestId(filename);
  
  assertEquals(parsed, null);
});

Deno.test("parseRequestId - возвращает null для пустой строки", () => {
  const parsed = parseRequestId("");
  
  assertEquals(parsed, null);
});

Deno.test("parseRequestId - извлекает UUID в верхнем регистре", () => {
  const requestId = "550E8400-E29B-41D4-A716-446655440000";
  const filename = `${requestId}.req`;
  
  const parsed = parseRequestId(filename);
  
  assertEquals(parsed, requestId);
});

Deno.test("isRequestMetadata - возвращает true для .req файла", () => {
  assertEquals(isRequestMetadata("550e8400-e29b-41d4-a716-446655440000.req"), true);
});

Deno.test("isRequestMetadata - возвращает true для .req файла с путем", () => {
  assertEquals(isRequestMetadata("requests/550e8400-e29b-41d4-a716-446655440000.req"), true);
});

Deno.test("isRequestMetadata - возвращает false для .data файла", () => {
  assertEquals(isRequestMetadata("550e8400-e29b-41d4-a716-446655440000.data"), false);
});

Deno.test("isRequestMetadata - возвращает false для файла без расширения", () => {
  assertEquals(isRequestMetadata("550e8400-e29b-41d4-a716-446655440000"), false);
});

Deno.test("isRequestData - возвращает true для .data файла", () => {
  assertEquals(isRequestData("550e8400-e29b-41d4-a716-446655440000.data"), true);
});

Deno.test("isRequestData - возвращает true для .data файла с путем", () => {
  assertEquals(isRequestData("requests/550e8400-e29b-41d4-a716-446655440000.data"), true);
});

Deno.test("isRequestData - возвращает false для .req файла", () => {
  assertEquals(isRequestData("550e8400-e29b-41d4-a716-446655440000.req"), false);
});

Deno.test("isRequestData - возвращает false для файла без расширения", () => {
  assertEquals(isRequestData("550e8400-e29b-41d4-a716-446655440000"), false);
});

Deno.test("isResponse - возвращает true для .resp файла", () => {
  assertEquals(isResponse("550e8400-e29b-41d4-a716-446655440000.resp"), true);
});

Deno.test("isResponse - возвращает true для .resp файла с путем", () => {
  assertEquals(isResponse("responses/550e8400-e29b-41d4-a716-446655440000.resp"), true);
});

Deno.test("isResponse - возвращает false для .req файла", () => {
  assertEquals(isResponse("550e8400-e29b-41d4-a716-446655440000.req"), false);
});

Deno.test("isResponse - возвращает false для файла без расширения", () => {
  assertEquals(isResponse("550e8400-e29b-41d4-a716-446655440000"), false);
});

Deno.test("isError - возвращает true для .error файла", () => {
  assertEquals(isError("550e8400-e29b-41d4-a716-446655440000.error"), true);
});

Deno.test("isError - возвращает true для .error файла с путем", () => {
  assertEquals(isError("responses/550e8400-e29b-41d4-a716-446655440000.error"), true);
});

Deno.test("isError - возвращает false для .req файла", () => {
  assertEquals(isError("550e8400-e29b-41d4-a716-446655440000.req"), false);
});

Deno.test("isError - возвращает false для файла без расширения", () => {
  assertEquals(isError("550e8400-e29b-41d4-a716-446655440000"), false);
});

Deno.test("parseRequestId + isRequestMetadata - интеграционный тест", () => {
  const requestId = generateRequestId();
  const filename = `${requestId}.req`;
  
  const parsed = parseRequestId(filename);
  const isMetadata = isRequestMetadata(filename);
  
  assertEquals(parsed, requestId);
  assertEquals(isMetadata, true);
});

Deno.test("parseRequestId + isRequestData - интеграционный тест", () => {
  const requestId = generateRequestId();
  const filename = `${requestId}.data`;
  
  const parsed = parseRequestId(filename);
  const isData = isRequestData(filename);
  
  assertEquals(parsed, requestId);
  assertEquals(isData, true);
});

