/**
 * Прямая реализация ConnectionHandler через TCP соединение с поддержкой сессий.
 * Используется для тестирования без файловой системы (для сравнения с YandexDiskConnectionHandler).
 *
 * ВАЖНО: Этот handler устанавливает прямое TCP соединение, минуя файловую систему,
 * что позволяет проверить, является ли задержка файловой системы причиной проблем с TLS handshake.
 */

import type { ConnectionHandler } from "@src/connection-handler.ts";
import type { TcpConn } from "@src/connection/types.ts";

import type {
  ConnectionFactory,
  ConnectionStore,
  Logger,
  SessionResolver,
} from "./types.ts";

/**
 * Конфигурация для DirectConnectionHandler
 */
export interface DirectConnectionHandlerConfig {
  /** Логгер для записи сообщений */
  logger: Logger;
  /** Хранилище соединений */
  connectionStore: ConnectionStore;
  /** Фабрика соединений */
  connectionFactory: ConnectionFactory;
  /** Резолвер сессий */
  sessionResolver: SessionResolver;
}

/**
 * Реализация ConnectionHandler через прямое TCP соединение с поддержкой сессий.
 */
export class DirectConnectionHandler implements ConnectionHandler {
  private connectionStore: ConnectionStore;
  private sessionResolver: SessionResolver;
  private connectionFactory: ConnectionFactory;
  private logger: Logger;

  constructor(config: DirectConnectionHandlerConfig) {
    this.logger = config.logger;
    this.connectionStore = config.connectionStore;
    this.sessionResolver = config.sessionResolver;
    this.connectionFactory = config.connectionFactory;
  }

  async connect(
    targetAddress: string,
    targetPort: number,
  ): Promise<
    {
      reader: ReadableStreamDefaultReader<Uint8Array>;
      writer: WritableStreamDefaultWriter<Uint8Array>;
    }
  > {
    const sessionInfo = this.sessionResolver.resolveSession(
      targetAddress,
      targetPort,
    );

    let conn: TcpConn;

    if (sessionInfo.useSessions) {
      this.logger.info(
        `Сессия: ${sessionInfo.sessionId}, первый в сессии: ${sessionInfo.isFirstInSession}, адрес: ${targetAddress}:${targetPort}`,
      );

      if (sessionInfo.isFirstInSession) {
        // Создаем новое соединение для первой сессии
        conn = await this.connectionFactory.create(targetAddress, targetPort);
        this.connectionStore.set(sessionInfo.sessionId, conn);
        this.logger.info(
          `TCP соединение создано для сессии ${sessionInfo.sessionId}`,
        );
      } else {
        // Переиспользуем существующее соединение
        const existingConn = this.connectionStore.get(sessionInfo.sessionId);
        if (!existingConn) {
          this.logger.warn(
            `Соединение для сессии ${sessionInfo.sessionId} не найдено, создаем новое`,
          );
          conn = await this.connectionFactory.create(targetAddress, targetPort);
          this.connectionStore.set(sessionInfo.sessionId, conn);
        } else {
          conn = existingConn;
          this.logger.info(
            `Переиспользовано TCP соединение для сессии ${sessionInfo.sessionId}`,
          );
        }
      }
    } else {
      // Без сессий - простое прямое соединение
      this.logger.debug(
        `Создание прямого TCP соединения к ${targetAddress}:${targetPort} (без сессий)`,
      );
      conn = await this.connectionFactory.create(targetAddress, targetPort);
    }

    return {
      reader: conn.readable.getReader(),
      writer: conn.writable.getWriter(),
    };
  }

  /**
   * Закрывает соединение для указанной сессии
   */
  closeConnection(sessionId: string): void {
    this.connectionStore.close(sessionId);
  }

  /**
   * Закрывает все активные соединения
   */
  closeAllConnections(): void {
    this.connectionStore.closeAll();
  }
}
