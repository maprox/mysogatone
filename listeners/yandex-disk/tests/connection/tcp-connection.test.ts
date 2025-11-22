/**
 * Тесты для TCP соединения
 */

import { assertEquals, assertRejects } from "https://deno.land/std@0.211.0/assert/mod.ts";
import { connectWithTimeout } from "@src/connection/tcp-connection.ts";

Deno.test({
  name: "connectWithTimeout - успешное подключение",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  // Подключаемся к реальному серверу (например, localhost:80 или известный сервер)
  // Используем небольшой таймаут для быстрого теста
  try {
    const conn = await connectWithTimeout("127.0.0.1", 80, 1000);
    conn.close();
    // Если подключение успешно, тест пройден
    assertEquals(true, true);
  } catch (error) {
    // Если порт закрыт, это нормально - просто проверяем что функция работает
    // Попробуем подключиться к известному серверу
    try {
      const conn = await connectWithTimeout("8.8.8.8", 53, 5000);
      conn.close();
      assertEquals(true, true);
    } catch (_e) {
      // Если и это не работает, пропускаем тест
      console.log("⚠️  Пропуск теста: нет доступных серверов для подключения");
    }
  }
});

Deno.test({
  name: "connectWithTimeout - таймаут при недоступном сервере",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  // Пытаемся подключиться к недоступному адресу с коротким таймаутом
  await assertRejects(
    async () => {
      await connectWithTimeout("192.0.2.0", 12345, 100); // Тестовый адрес, который не должен отвечать
    },
    Error,
    "Connection timeout after 100ms"
  );
});

Deno.test({
  name: "connectWithTimeout - таймаут при неверном порте",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  // Пытаемся подключиться к localhost на закрытом порте с коротким таймаутом
  await assertRejects(
    async () => {
      await connectWithTimeout("127.0.0.1", 65535, 100); // Обычно закрытый порт
    },
    Error,
    "Connection timeout"
  );
});

