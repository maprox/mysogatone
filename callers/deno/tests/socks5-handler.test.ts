/**
 * Тесты для Socks5Handler
 */

import { assertEquals } from "https://deno.land/std@0.211.0/assert/mod.ts";
import { Socks5Handler } from "../src/socks5-handler.ts";
import type { ConnectionHandler } from "../src/connection-handler.ts";

/**
 * Мок ConnectionHandler для тестирования
 */
class MockConnectionHandler implements ConnectionHandler {
  private shouldFail: boolean;
  private targetAddress: string | null = null;
  private targetPort: number | null = null;

  constructor(shouldFail: boolean = false) {
    this.shouldFail = shouldFail;
  }

  async connect(
    targetAddress: string,
    targetPort: number
  ): Promise<{ reader: ReadableStreamDefaultReader<Uint8Array>; writer: WritableStreamDefaultWriter<Uint8Array> }> {
    this.targetAddress = targetAddress;
    this.targetPort = targetPort;

    if (this.shouldFail) {
      throw new Error("Connection failed");
    }

    // Создаем простой мок потока
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    });

    const writer = new WritableStream({
      write(chunk) {
        // Просто принимаем данные
      },
    });

    return {
      reader: stream.getReader(),
      writer: writer.getWriter(),
    };
  }

  getLastTarget(): { address: string; port: number } | null {
    if (this.targetAddress === null || this.targetPort === null) {
      return null;
    }
    return { address: this.targetAddress, port: this.targetPort };
  }
}

Deno.test({
  name: "Socks5Handler - успешный handshake с No Auth",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  // Handshake: версия 5, 1 метод, метод No Auth (0x00)
  const handshakeData = new Uint8Array([0x05, 0x01, 0x00]);
  
  // CONNECT запрос: версия 5, команда CONNECT, резервный байт, IPv4, адрес 127.0.0.1, порт 80
  const connectData = new Uint8Array([
    0x05, // версия
    0x01, // команда CONNECT
    0x00, // резервный байт
    0x01, // тип адреса IPv4
    127, 0, 0, 1, // IP адрес
    0x00, 0x50, // порт 80
  ]);

  // Объединяем данные в один поток
  const allData = new Uint8Array(handshakeData.length + connectData.length);
  allData.set(handshakeData, 0);
  allData.set(connectData, handshakeData.length);

  let readOffset = 0;
  const readable = new ReadableStream({
    async pull(controller) {
      if (readOffset >= allData.length) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        controller.close();
        return;
      }
      const chunk = allData.slice(readOffset);
      readOffset = allData.length;
      controller.enqueue(chunk);
    },
  });

  const writable = new WritableStream({
    write(_chunk) {},
  });

  const conn = {
    readable,
    writable,
    localAddr: {
      transport: "tcp" as const,
      hostname: "127.0.0.1",
      port: 1080,
    },
    remoteAddr: {
      transport: "tcp" as const,
      hostname: "127.0.0.1",
      port: 54321,
    },
    rid: 1,
    close: () => {},
    closeWrite: () => Promise.resolve(),
    read: async (_p: Uint8Array) => null,
    write: async (_p: Uint8Array) => 0,
    setNoDelay: () => {},
    setKeepAlive: () => {},
    ref: () => {},
    unref: () => {},
    [Symbol.dispose]: () => {},
  } as Deno.Conn;

  const mockHandler = new MockConnectionHandler(false);
  const handler = new Socks5Handler(conn, mockHandler);

  // Запускаем обработку
  const handlePromise = handler.handle();
  
  // Даем время на обработку
  await new Promise((resolve) => setTimeout(resolve, 100));
  
  // Проверяем, что соединение было установлено с правильным адресом
  const lastTarget = mockHandler.getLastTarget();
  
  // Если соединение не установлено, это может быть из-за асинхронности
  // Проверяем, что хотя бы запрос был сделан
  if (lastTarget === null) {
    // Даем еще время
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  
  const finalTarget = mockHandler.getLastTarget();
  assertEquals(finalTarget !== null, true);
  if (finalTarget) {
    assertEquals(finalTarget.address, "127.0.0.1");
    assertEquals(finalTarget.port, 80);
  }
  
  // Отменяем промис обработки, если он еще выполняется
  handlePromise.catch(() => {});
});

Deno.test({
  name: "Socks5Handler - handshake отклонен при отсутствии No Auth",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  // Handshake: версия 5, 1 метод, метод Username/Password (0x02) - не поддерживается
  const handshakeData = new Uint8Array([0x05, 0x01, 0x02]);
  
  let readOffset = 0;
  const readable = new ReadableStream({
    async pull(controller) {
      if (readOffset >= handshakeData.length) {
        controller.close();
        return;
      }
      const chunk = handshakeData.slice(readOffset);
      readOffset = handshakeData.length;
      controller.enqueue(chunk);
    },
  });

  const writable = new WritableStream({
    write(_chunk) {},
  });

  const conn = {
    readable,
    writable,
    localAddr: {
      transport: "tcp" as const,
      hostname: "127.0.0.1",
      port: 1080,
    },
    remoteAddr: {
      transport: "tcp" as const,
      hostname: "127.0.0.1",
      port: 54321,
    },
    rid: 1,
    close: () => {},
    closeWrite: () => Promise.resolve(),
    read: async (_p: Uint8Array) => null,
    write: async (_p: Uint8Array) => 0,
    setNoDelay: () => {},
    setKeepAlive: () => {},
    ref: () => {},
    unref: () => {},
    [Symbol.dispose]: () => {},
  } as Deno.Conn;

  const mockHandler = new MockConnectionHandler(false);
  const handler = new Socks5Handler(conn, mockHandler);

  await handler.handle();

  // Соединение не должно быть установлено
  const lastTarget = mockHandler.getLastTarget();
  assertEquals(lastTarget, null);
});

Deno.test({
  name: "Socks5Handler - CONNECT с доменным именем",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  // Handshake
  const handshakeData = new Uint8Array([0x05, 0x01, 0x00]);
  
  // CONNECT запрос с доменным именем "example.com" и портом 443
  const domainName = "example.com";
  const domainBytes = new TextEncoder().encode(domainName);
  const connectData = new Uint8Array([
    0x05, // версия
    0x01, // команда CONNECT
    0x00, // резервный байт
    0x03, // тип адреса Domain
    domainBytes.length, // длина домена
    ...domainBytes, // доменное имя
    0x01, 0xBB, // порт 443
  ]);

  const allData = new Uint8Array(handshakeData.length + connectData.length);
  allData.set(handshakeData, 0);
  allData.set(connectData, handshakeData.length);

  let readOffset = 0;
  const readable = new ReadableStream({
    async pull(controller) {
      if (readOffset >= allData.length) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        controller.close();
        return;
      }
      const chunk = allData.slice(readOffset);
      readOffset = allData.length;
      controller.enqueue(chunk);
    },
  });

  const writable = new WritableStream({
    write(_chunk) {},
  });

  const conn = {
    readable,
    writable,
    localAddr: {
      transport: "tcp" as const,
      hostname: "127.0.0.1",
      port: 1080,
    },
    remoteAddr: {
      transport: "tcp" as const,
      hostname: "127.0.0.1",
      port: 54321,
    },
    rid: 1,
    close: () => {},
    closeWrite: () => Promise.resolve(),
    read: async (_p: Uint8Array) => null,
    write: async (_p: Uint8Array) => 0,
    setNoDelay: () => {},
    setKeepAlive: () => {},
    ref: () => {},
    unref: () => {},
    [Symbol.dispose]: () => {},
  } as Deno.Conn;

  const mockHandler = new MockConnectionHandler(false);
  const handler = new Socks5Handler(conn, mockHandler);

  await handler.handle();

  const lastTarget = mockHandler.getLastTarget();
  assertEquals(lastTarget !== null, true);
  if (lastTarget) {
    assertEquals(lastTarget.address, "example.com");
    assertEquals(lastTarget.port, 443);
  }
});

Deno.test({
  name: "Socks5Handler - ошибка при неудачном подключении",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const handshakeData = new Uint8Array([0x05, 0x01, 0x00]);
  const connectData = new Uint8Array([
    0x05, 0x01, 0x00, 0x01, 127, 0, 0, 1, 0x00, 0x50,
  ]);

  const allData = new Uint8Array(handshakeData.length + connectData.length);
  allData.set(handshakeData, 0);
  allData.set(connectData, handshakeData.length);

  let readOffset = 0;
  const readable = new ReadableStream({
    async pull(controller) {
      if (readOffset >= allData.length) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        controller.close();
        return;
      }
      const chunk = allData.slice(readOffset);
      readOffset = allData.length;
      controller.enqueue(chunk);
    },
  });

  const writable = new WritableStream({
    write(_chunk) {},
  });

  const conn = {
    readable,
    writable,
    localAddr: {
      transport: "tcp" as const,
      hostname: "127.0.0.1",
      port: 1080,
    },
    remoteAddr: {
      transport: "tcp" as const,
      hostname: "127.0.0.1",
      port: 54321,
    },
    rid: 1,
    close: () => {},
    closeWrite: () => Promise.resolve(),
    read: async (_p: Uint8Array) => null,
    write: async (_p: Uint8Array) => 0,
    setNoDelay: () => {},
    setKeepAlive: () => {},
    ref: () => {},
    unref: () => {},
    [Symbol.dispose]: () => {},
  } as Deno.Conn;

  const mockHandler = new MockConnectionHandler(true); // Заставляем соединение падать
  const handler = new Socks5Handler(conn, mockHandler);

  await handler.handle();

  // Соединение не должно быть установлено
  const lastTarget = mockHandler.getLastTarget();
  assertEquals(lastTarget !== null, true); // Запрос был сделан, но соединение не установлено
});

Deno.test({
  name: "Socks5Handler - отклонение неподдерживаемой команды",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const handshakeData = new Uint8Array([0x05, 0x01, 0x00]);
  
  // CONNECT запрос с командой BIND (0x02) - не поддерживается
  const connectData = new Uint8Array([
    0x05, 0x02, 0x00, 0x01, 127, 0, 0, 1, 0x00, 0x50,
  ]);

  const allData = new Uint8Array(handshakeData.length + connectData.length);
  allData.set(handshakeData, 0);
  allData.set(connectData, handshakeData.length);

  let readOffset = 0;
  const readable = new ReadableStream({
    async pull(controller) {
      if (readOffset >= allData.length) {
        controller.close();
        return;
      }
      const chunk = allData.slice(readOffset);
      readOffset = allData.length;
      controller.enqueue(chunk);
    },
  });

  const writable = new WritableStream({
    write(_chunk) {},
  });

  const conn = {
    readable,
    writable,
    localAddr: {
      transport: "tcp" as const,
      hostname: "127.0.0.1",
      port: 1080,
    },
    remoteAddr: {
      transport: "tcp" as const,
      hostname: "127.0.0.1",
      port: 54321,
    },
    rid: 1,
    close: () => {},
    closeWrite: () => Promise.resolve(),
    read: async (_p: Uint8Array) => null,
    write: async (_p: Uint8Array) => 0,
    setNoDelay: () => {},
    setKeepAlive: () => {},
    ref: () => {},
    unref: () => {},
    [Symbol.dispose]: () => {},
  } as Deno.Conn;

  const mockHandler = new MockConnectionHandler(false);
  const handler = new Socks5Handler(conn, mockHandler);

  await handler.handle();

  // Соединение не должно быть установлено
  const lastTarget = mockHandler.getLastTarget();
  assertEquals(lastTarget, null);
});

