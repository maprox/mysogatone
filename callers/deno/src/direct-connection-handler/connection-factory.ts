/**
 * Сервис для создания TCP соединений.
 * Отвечает за установку нового TCP соединения с целевым сервером.
 */

import type {
  ConnectionFactory as ConnectionFactoryInterface,
  Logger,
} from "./types.ts";

/**
 * Сервис для создания TCP соединений
 */
export class ConnectionFactory implements ConnectionFactoryInterface {
  constructor(private logger: Logger) {}

  /**
   * Создает новое TCP соединение с указанным адресом и портом
   */
  async create(
    targetAddress: string,
    targetPort: number,
  ): Promise<Deno.TcpConn> {
    this.logger.debug(
      `Создание TCP соединения к ${targetAddress}:${targetPort}`,
    );

    const conn = await Deno.connect({
      hostname: targetAddress,
      port: targetPort,
    });

    conn.setNoDelay(true);

    this.logger.info(
      `TCP соединение создано к ${targetAddress}:${targetPort}`,
    );

    return conn;
  }
}
