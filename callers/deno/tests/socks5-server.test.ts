/**
 * Тесты для Socks5Server
 */

import { assertEquals } from "https://deno.land/std@0.211.0/assert/mod.ts";
import { Socks5Server } from "../src/socks5-server.ts";
import type { ConnectionHandler } from "../src/connection-handler.ts";

/**
 * Мок ConnectionHandler для тестирования
 */
class MockConnectionHandler implements ConnectionHandler {
  async connect(
    _targetAddress: string,
    _targetPort: number
  ): Promise<{ reader: ReadableStreamDefaultReader<Uint8Array>; writer: WritableStreamDefaultWriter<Uint8Array> }> {
    const stream = new ReadableStream({
      start(controller) {
        controller.close();
      },
    });

    const writer = new WritableStream({
      write(_chunk) {},
    });

    return {
      reader: stream.getReader(),
      writer: writer.getWriter(),
    };
  }
}

Deno.test({
  name: "Socks5Server - создание сервера",
  sanitizeResources: false,
  sanitizeOps: false,
}, () => {
  const handler = new MockConnectionHandler();
  const server = new Socks5Server(1080, handler);

  assertEquals(server.isRunning(), false);
});

Deno.test({
  name: "Socks5Server - запуск и остановка сервера",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const handler = new MockConnectionHandler();
  const server = new Socks5Server(0, handler); // Порт 0 для автоматического выбора

  // Запускаем сервер в фоне
  const startPromise = server.start();

  // Даем серверу время запуститься
  await new Promise((resolve) => setTimeout(resolve, 100));

  assertEquals(server.isRunning(), true);

  // Останавливаем сервер
  server.stop();

  // Даем серверу время остановиться
  await new Promise((resolve) => setTimeout(resolve, 100));

  assertEquals(server.isRunning(), false);

  // Отменяем промис запуска
  startPromise.catch(() => {
      // Игнорируем ошибки от остановленного сервера
    });
});

Deno.test({
  name: "Socks5Server - проверка состояния running",
  sanitizeResources: false,
  sanitizeOps: false,
}, () => {
  const handler = new MockConnectionHandler();
  const server = new Socks5Server(1080, handler);

  assertEquals(server.isRunning(), false);

  // После остановки (даже если не был запущен) должно быть false
  server.stop();
  assertEquals(server.isRunning(), false);
});

