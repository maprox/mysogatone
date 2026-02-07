/**
 * Реализация ConnectionHandler через прямое TCP соединение с эмуляцией задержек.
 *
 * Эмулирует задержки, которые возникают при работе через yandex-disk-connection-handler,
 * чтобы выяснить на каком этапе TLS handshake происходит обрыв соединения.
 */

import type { ConnectionHandler } from "@src/types.ts";

import type {
  ConnectionFactory,
  ConnectionStore,
  DelayConfig,
  DelayLogParser,
  Logger,
  SessionResolver,
  StreamWrapper,
} from "./types.ts";

/**
 * Конфигурация для DelayedConnectionHandler
 */
export interface DelayedConnectionHandlerConfig {
  /** Логгер для записи сообщений */
  logger: Logger;
  /** Хранилище соединений */
  connectionStore: ConnectionStore;
  /** Фабрика соединений */
  connectionFactory: ConnectionFactory;
  /** Резолвер сессий */
  sessionResolver: SessionResolver;
  /** Парсер лога задержек */
  delayLogParser: DelayLogParser;
  /** Обертка потоков с задержками */
  streamWrapper: StreamWrapper;
  /** Конфигурация задержек */
  delays: DelayConfig;
}

/**
 * Реализация ConnectionHandler через прямое TCP соединение с эмуляцией задержек.
 */
export class DelayedConnectionHandler implements ConnectionHandler {
  private connectionStore: ConnectionStore;
  private sessionResolver: SessionResolver;
  private connectionFactory: ConnectionFactory;
  private logger: Logger;
  private delayLogParser: DelayLogParser;
  private streamWrapper: StreamWrapper;
  private delays: DelayConfig;

  constructor(config: DelayedConnectionHandlerConfig) {
    this.logger = config.logger;
    this.connectionStore = config.connectionStore;
    this.sessionResolver = config.sessionResolver;
    this.connectionFactory = config.connectionFactory;
    this.delayLogParser = config.delayLogParser;
    this.streamWrapper = config.streamWrapper;
    this.delays = config.delays;
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

    let conn: Deno.TcpConn;

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

    // Создаем обертки для reader и writer с задержками
    const originalReader = conn.readable.getReader();
    const originalWriter = conn.writable.getWriter();

    const wrapped = this.streamWrapper.wrap(
      originalReader,
      originalWriter,
      this.delays,
    );

    return {
      reader: wrapped.reader,
      writer: wrapped.writer,
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
