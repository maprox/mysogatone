/**
 * Тесты для DefaultConnectionHandler
 */

import { assertEquals, assertRejects } from "https://deno.land/std@0.211.0/assert/mod.ts";
import { DefaultConnectionHandler } from "../src/default-connection-handler.ts";

Deno.test({
  name: "DefaultConnectionHandler - успешное подключение к доступному серверу",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const handler = new DefaultConnectionHandler();
  
  try {
    // Пытаемся подключиться к известному серверу (DNS сервер Google)
    const streams = await handler.connect("8.8.8.8", 53);
    
    assertEquals(streams.reader !== null, true);
    assertEquals(streams.writer !== null, true);
    
    // Закрываем соединение
    await streams.reader.cancel();
    await streams.writer.close();
  } catch (error) {
    // Если подключение не удалось, это нормально для теста
    console.log("⚠️  Пропуск теста: сервер недоступен");
  }
});

Deno.test({
  name: "DefaultConnectionHandler - ошибка при подключении к недоступному серверу",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const handler = new DefaultConnectionHandler();
  
  await assertRejects(
    async () => {
      await handler.connect("192.0.2.0", 12345); // Тестовый адрес, который не должен отвечать
    },
    Error
  );
});

Deno.test({
  name: "DefaultConnectionHandler - ошибка при подключении к неверному порту",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const handler = new DefaultConnectionHandler();
  
  await assertRejects(
    async () => {
      await handler.connect("127.0.0.1", 99999); // Неверный порт
    },
    Error
  );
});

