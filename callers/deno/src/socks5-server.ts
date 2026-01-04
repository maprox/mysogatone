/**
 * SOCKS5 сервер.
 * Принимает входящие соединения и обрабатывает их через Socks5Handler.
 */

import type { ConnectionHandler } from "@src/connection-handler.ts";
import { Socks5Handler } from "@src/socks5-handler.ts";

/**
 * SOCKS5 сервер.
 */
export class Socks5Server {
  private listener: Deno.Listener | null = null;
  private running = false;
  private port: number;
  private connectionHandler: ConnectionHandler;

  constructor(port: number = 1080, connectionHandler: ConnectionHandler) {
    this.port = port;
    this.connectionHandler = connectionHandler;
  }

  /**
   * Запускает сервер и начинает принимать соединения.
   */
  async start(): Promise<void> {
    try {
      this.listener = Deno.listen({ port: this.port });
      this.running = true;
      console.log(`SOCKS5 server started on port ${this.port}`);

      while (this.running) {
        try {
          const conn = await this.listener.accept();
          const remoteAddr = conn.remoteAddr;
          if (remoteAddr.transport === "tcp") {
            console.log(
              `New connection from ${remoteAddr.hostname}:${remoteAddr.port}`,
            );
          } else {
            console.log(`New connection from ${JSON.stringify(remoteAddr)}`);
          }

          // Запускаем обработчик асинхронно
          const handler = new Socks5Handler(conn, this.connectionHandler);
          handler.handle().catch((error) => {
            console.error("Error handling connection:", error);
          });
        } catch (error) {
          if (this.running) {
            console.error("Error accepting connection:", error);
          }
        }
      }
    } catch (error) {
      console.error("Error starting SOCKS5 server:", error);
      throw error;
    }
  }

  /**
   * Останавливает сервер.
   */
  stop(): void {
    this.running = false;
    try {
      this.listener?.close();
    } catch (error) {
      console.error("Error closing listener:", error);
    }
    console.log("SOCKS5 server stopped");
  }

  /**
   * Проверяет, запущен ли сервер.
   */
  isRunning(): boolean {
    return this.running;
  }
}
