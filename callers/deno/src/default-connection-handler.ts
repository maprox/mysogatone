/**
 * Базовая реализация ConnectionHandler через прямое TCP соединение.
 * Используется для тестирования SOCKS5 сервера.
 */

import type { ConnectionHandler } from "@src/connection-handler.ts";

/**
 * Реализация ConnectionHandler через прямое TCP соединение.
 */
export class DefaultConnectionHandler implements ConnectionHandler {
  async connect(
    targetAddress: string,
    targetPort: number,
  ): Promise<
    {
      reader: ReadableStreamDefaultReader<Uint8Array>;
      writer: WritableStreamDefaultWriter<Uint8Array>;
    }
  > {
    const conn = await Deno.connect({
      hostname: targetAddress,
      port: targetPort,
    });

    return {
      reader: conn.readable.getReader(),
      writer: conn.writable.getWriter(),
    };
  }
}
