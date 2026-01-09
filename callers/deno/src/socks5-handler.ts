/**
 * Обработчик SOCKS5 протокола для одного клиента.
 */

import { getLogger } from "@shared/logger/file-logger.ts";
import type { ConnectionHandler } from "@src/connection-handler.ts";

/**
 * SOCKS5 константы
 */
const SOCKS_VERSION = 0x05;
const METHOD_NO_AUTH = 0x00;
const CMD_CONNECT = 0x01;
const ADDR_TYPE_IPV4 = 0x01;
const ADDR_TYPE_DOMAIN = 0x03;
const ADDR_TYPE_IPV6 = 0x04;
const REPLY_SUCCESS = 0x00;
const REPLY_GENERAL_FAILURE = 0x01;
const REPLY_CONNECTION_REFUSED = 0x05;
const REPLY_COMMAND_NOT_SUPPORTED = 0x07;
const REPLY_ADDRESS_TYPE_NOT_SUPPORTED = 0x08;

/**
 * Обработчик SOCKS5 протокола для одного клиента.
 */
export class Socks5Handler {
  private conn: Deno.Conn;
  private connectionHandler: ConnectionHandler;
  private buffer: Uint8Array = new Uint8Array(0);
  private bufferOffset: number = 0;

  constructor(conn: Deno.Conn, connectionHandler: ConnectionHandler) {
    this.conn = conn;
    this.connectionHandler = connectionHandler;
  }

  /**
   * Обрабатывает SOCKS5 соединение.
   */
  async handle(): Promise<void> {
    const logger = getLogger();
    logger.info("[Socks5Handler] Начало обработки соединения");
    try {
      const reader = this.conn.readable.getReader();
      const writer = this.conn.writable.getWriter();
      logger.info("[Socks5Handler] Reader и Writer созданы");

      // Этап 1: Handshake
      logger.info("[Socks5Handler] Начало handshake...");
      const isHandshakeSuccessful = await this.handleHandshake(reader, writer);
      if (!isHandshakeSuccessful) {
        logger.info("[Socks5Handler] Handshake не удался");
        return;
      }
      logger.info("[Socks5Handler] Handshake успешен");

      // Этап 2: Запрос на подключение
      logger.info("[Socks5Handler] Начало обработки CONNECT запроса...");
      const targetStreams = await this.handleConnectRequest(reader, writer);
      if (!targetStreams) {
        logger.info("[Socks5Handler] CONNECT запрос не обработан");
        return;
      }
      logger.info("[Socks5Handler] CONNECT запрос обработан успешно");

      // Этап 3: Передача данных
      logger.info("[Socks5Handler] Начало передачи данных...");
      await this.transferData(
        reader,
        writer,
        targetStreams.reader,
        targetStreams.writer,
      );
      logger.info("[Socks5Handler] Передача данных завершена");
    } catch (error) {
      const logger = getLogger();
      logger.error("Error handling SOCKS5 connection:", error);
    } finally {
      try {
        this.conn.close();
      } catch {
        // Игнорируем ошибки закрытия
      }
    }
  }

  /**
   * Обработка handshake (рукопожатия).
   * Клиент отправляет список методов аутентификации, сервер выбирает No Auth.
   */
  private async handleHandshake(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    writer: WritableStreamDefaultWriter<Uint8Array>,
  ): Promise<boolean> {
    console.log("[Socks5Handler] handleHandshake: начало");
    try {
      // Читаем версию SOCKS (1 байт)
      console.log("[Socks5Handler] handleHandshake: чтение версии...");
      const versionData = await this.readBytes(reader, 1);
      console.log(
        `[Socks5Handler] handleHandshake: версия прочитана: ${
          versionData.length > 0 ? versionData[0] : "пусто"
        }`,
      );
      if (versionData.length === 0 || versionData[0] !== SOCKS_VERSION) {
        return false;
      }

      // Читаем количество методов (1 байт)
      const numMethodsData = await this.readBytes(reader, 1);
      if (numMethodsData.length === 0) {
        return false;
      }
      const numMethods = numMethodsData[0];
      if (numMethods === 0) {
        return false;
      }

      // Читаем методы аутентификации
      const methodsData = await this.readBytes(reader, numMethods);
      if (methodsData.length !== numMethods) {
        return false;
      }

      // Проверяем наличие метода No Auth (0x00)
      const hasNoAuth = methodsData.includes(METHOD_NO_AUTH);
      console.log(
        `[Socks5Handler] handleHandshake: методы прочитаны, No Auth найден: ${hasNoAuth}`,
      );
      if (!hasNoAuth) {
        // Отправляем ответ об отсутствии поддерживаемых методов
        console.log("[Socks5Handler] handleHandshake: метод No Auth не найден");
        await writer.write(new Uint8Array([SOCKS_VERSION, 0xFF]));
        await writer.close();
        return false;
      }

      // Отправляем ответ: версия SOCKS5, метод No Auth
      console.log("[Socks5Handler] handleHandshake: отправка ответа...");
      await writer.write(new Uint8Array([SOCKS_VERSION, METHOD_NO_AUTH]));
      console.log(
        "[Socks5Handler] handleHandshake: ответ отправлен, handshake успешен",
      );

      return true;
    } catch (error) {
      console.error("Error in handshake:", error);
      return false;
    }
  }

  /**
   * Обработка запроса на подключение (CONNECT).
   * Парсит адрес и порт целевого сервера и устанавливает соединение через ConnectionHandler.
   */
  private async handleConnectRequest(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    writer: WritableStreamDefaultWriter<Uint8Array>,
  ): Promise<
    {
      reader: ReadableStreamDefaultReader<Uint8Array>;
      writer: WritableStreamDefaultWriter<Uint8Array>;
    } | null
  > {
    console.log("[Socks5Handler] handleConnectRequest: начало");
    try {
      // Читаем версию SOCKS (1 байт)
      console.log("[Socks5Handler] handleConnectRequest: чтение версии...");
      const versionData = await this.readBytes(reader, 1);
      console.log(
        `[Socks5Handler] handleConnectRequest: версия прочитана: ${
          versionData.length > 0 ? versionData[0] : "пусто"
        }`,
      );
      if (versionData.length === 0 || versionData[0] !== SOCKS_VERSION) {
        await this.sendConnectReply(
          writer,
          REPLY_GENERAL_FAILURE,
          "0.0.0.0",
          0,
        );
        return null;
      }

      // Читаем команду (1 байт)
      console.log("[Socks5Handler] handleConnectRequest: чтение команды...");
      const commandData = await this.readBytes(reader, 1);
      console.log(
        `[Socks5Handler] handleConnectRequest: команда прочитана: ${
          commandData.length > 0 ? commandData[0] : "пусто"
        }`,
      );
      if (commandData.length === 0) {
        console.log(
          "[Socks5Handler] handleConnectRequest: команда не прочитана",
        );
        await this.sendConnectReply(
          writer,
          REPLY_GENERAL_FAILURE,
          "0.0.0.0",
          0,
        );
        return null;
      }
      const command = commandData[0];
      console.log(
        `[Socks5Handler] handleConnectRequest: команда: ${command} (ожидается ${CMD_CONNECT})`,
      );
      if (command !== CMD_CONNECT) {
        await this.sendConnectReply(
          writer,
          REPLY_COMMAND_NOT_SUPPORTED,
          "0.0.0.0",
          0,
        );
        return null;
      }

      // Резервный байт (1 байт)
      await this.readBytes(reader, 1);

      // Читаем тип адреса (1 байт)
      const addressTypeData = await this.readBytes(reader, 1);
      if (addressTypeData.length === 0) {
        await this.sendConnectReply(
          writer,
          REPLY_GENERAL_FAILURE,
          "0.0.0.0",
          0,
        );
        return null;
      }
      const addressType = addressTypeData[0];

      let targetAddress: string;

      switch (addressType) {
        case ADDR_TYPE_IPV4: {
          // IPv4 адрес (4 байта)
          const ipBytes = await this.readBytes(reader, 4);
          if (ipBytes.length !== 4) {
            await this.sendConnectReply(
              writer,
              REPLY_GENERAL_FAILURE,
              "0.0.0.0",
              0,
            );
            return null;
          }
          targetAddress = `${ipBytes[0]}.${ipBytes[1]}.${ipBytes[2]}.${
            ipBytes[3]
          }`;
          break;
        }
        case ADDR_TYPE_DOMAIN: {
          // Доменное имя
          const domainLengthData = await this.readBytes(reader, 1);
          if (domainLengthData.length === 0) {
            await this.sendConnectReply(
              writer,
              REPLY_GENERAL_FAILURE,
              "0.0.0.0",
              0,
            );
            return null;
          }
          const domainLength = domainLengthData[0];
          const domainBytes = await this.readBytes(reader, domainLength);
          if (domainBytes.length !== domainLength) {
            await this.sendConnectReply(
              writer,
              REPLY_GENERAL_FAILURE,
              "0.0.0.0",
              0,
            );
            return null;
          }
          targetAddress = new TextDecoder().decode(domainBytes);
          break;
        }
        case ADDR_TYPE_IPV6: {
          // IPv6 адрес (16 байт) - пока не поддерживаем
          await this.readBytes(reader, 16);
          await this.sendConnectReply(
            writer,
            REPLY_ADDRESS_TYPE_NOT_SUPPORTED,
            "0.0.0.0",
            0,
          );
          return null;
        }
        default: {
          await this.sendConnectReply(
            writer,
            REPLY_ADDRESS_TYPE_NOT_SUPPORTED,
            "0.0.0.0",
            0,
          );
          return null;
        }
      }

      // Читаем порт (2 байта, big-endian)
      console.log(
        `[Socks5Handler] handleConnectRequest: чтение порта (2 байта)...`,
      );
      const portData = await this.readBytes(reader, 2);
      console.log(
        `[Socks5Handler] handleConnectRequest: порт прочитан: ${portData.length} байт из 2, данные: [${
          Array.from(portData).map((b) =>
            "0x" + b.toString(16).padStart(2, "0")
          ).join(", ")
        }]`,
      );
      if (portData.length !== 2) {
        console.log(
          `[Socks5Handler] handleConnectRequest: ошибка - порт не полностью прочитан (${portData.length} из 2 байт)`,
        );
        await this.sendConnectReply(
          writer,
          REPLY_GENERAL_FAILURE,
          "0.0.0.0",
          0,
        );
        return null;
      }
      const targetPort = (portData[0] << 8) | portData[1];
      console.log(
        `[Socks5Handler] handleConnectRequest: порт распознан: ${targetPort}`,
      );

      // Устанавливаем соединение через ConnectionHandler
      console.log(
        `[Socks5Handler] Вызов connectionHandler.connect(${targetAddress}, ${targetPort})...`,
      );
      let targetStreams;
      try {
        targetStreams = await this.connectionHandler.connect(
          targetAddress,
          targetPort,
        );
        console.log(
          `[Socks5Handler] connectionHandler.connect завершен успешно`,
        );
      } catch (error) {
        console.error(
          `[Socks5Handler] Failed to connect to ${targetAddress}:${targetPort}:`,
          error,
        );
        await this.sendConnectReply(
          writer,
          REPLY_CONNECTION_REFUSED,
          "0.0.0.0",
          0,
        );
        return null;
      }

      // Отправляем успешный ответ
      console.log(`[Socks5Handler] Отправка успешного ответа CONNECT...`);
      // Используем адрес сервера для ответа
      const localAddr = this.conn.localAddr;
      const serverAddress = localAddr.transport === "tcp"
        ? localAddr.hostname
        : "0.0.0.0";
      const serverPort = localAddr.transport === "tcp" ? localAddr.port : 0;
      await this.sendConnectReply(
        writer,
        REPLY_SUCCESS,
        serverAddress,
        serverPort,
      );
      console.log(`[Socks5Handler] Ответ CONNECT отправлен успешно`);

      // Возвращаем потоки для передачи данных
      return targetStreams;
    } catch (error) {
      console.error("Error in connect request:", error);
      try {
        await this.sendConnectReply(
          writer,
          REPLY_GENERAL_FAILURE,
          "0.0.0.0",
          0,
        );
      } catch {
        // Игнорируем ошибки отправки ответа
      }
      return null;
    }
  }

  /**
   * Отправка ответа на запрос подключения.
   */
  private async sendConnectReply(
    writer: WritableStreamDefaultWriter<Uint8Array>,
    replyCode: number,
    address: string,
    port: number,
  ): Promise<void> {
    const addressParts = address.split(".");
    if (addressParts.length !== 4) {
      // Если адрес не IPv4, используем 0.0.0.0
      addressParts[0] = "0";
      addressParts[1] = "0";
      addressParts[2] = "0";
      addressParts[3] = "0";
    }

    const addressBytes = new Uint8Array([
      parseInt(addressParts[0]),
      parseInt(addressParts[1]),
      parseInt(addressParts[2]),
      parseInt(addressParts[3]),
    ]);

    const reply = new Uint8Array([
      SOCKS_VERSION,
      replyCode,
      0x00, // Резервный байт
      ADDR_TYPE_IPV4,
      addressBytes[0],
      addressBytes[1],
      addressBytes[2],
      addressBytes[3],
      (port >> 8) & 0xFF,
      port & 0xFF,
    ]);

    console.log(
      `[Socks5Handler] sendConnectReply: отправка ответа (${reply.length} байт), код: ${replyCode}, адрес: ${address}, порт: ${port}`,
    );
    console.log(
      `[Socks5Handler] sendConnectReply: данные ответа: [${
        Array.from(reply).map((b) => "0x" + b.toString(16).padStart(2, "0"))
          .join(", ")
      }]`,
    );
    await writer.write(reply);
    console.log(`[Socks5Handler] sendConnectReply: ответ записан в writer`);
  }

  /**
   * Передача данных между клиентом и целевым сервером.
   */
  private async transferData(
    clientReader: ReadableStreamDefaultReader<Uint8Array>,
    clientWriter: WritableStreamDefaultWriter<Uint8Array>,
    targetReader: ReadableStreamDefaultReader<Uint8Array>,
    targetWriter: WritableStreamDefaultWriter<Uint8Array>,
  ): Promise<void> {
    console.log(
      "[Socks5Handler] transferData: запуск двунаправленной передачи данных...",
    );
    // Запускаем две асинхронные задачи для двунаправленной передачи данных
    const clientToTarget = this.pipeStream(
      clientReader,
      targetWriter,
      "client->target",
    );
    const targetToClient = this.pipeStream(
      targetReader,
      clientWriter,
      "target->client",
    );

    // Ждем завершения обеих задач
    const results = await Promise.allSettled([clientToTarget, targetToClient]);
    console.log(
      `[Socks5Handler] transferData: обе задачи завершены. client->target: ${
        results[0].status
      }, target->client: ${results[1].status}`,
    );
  }

  /**
   * Передает данные из reader в writer.
   * Добавлены таймауты для чтения, чтобы обнаружить проблемы с передачей данных.
   */
  private async pipeStream(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    writer: WritableStreamDefaultWriter<Uint8Array>,
    direction?: string,
  ): Promise<void> {
    const streamId = direction || "unknown";
    const startTime = Date.now();
    const logger = getLogger();
    logger.info(
      `[Socks5Handler] [${startTime}] pipeStream начат для ${streamId}`,
    );
    let totalBytes = 0;
    let chunkCount = 0;
    const readTimeout = 30000; // 30 секунд таймаут для чтения
    let lastReadTime = startTime;

    try {
      while (true) {
        const now = Date.now();
        // Проверяем таймаут чтения
        const timeSinceLastRead = now - lastReadTime;
        if (timeSinceLastRead > readTimeout) {
          logger.info(
            `[Socks5Handler] [${now}] pipeStream таймаут чтения для ${streamId}: ${timeSinceLastRead}ms без данных (таймаут: ${readTimeout}ms)`,
          );
          throw new Error(
            `Read timeout: no data received for ${timeSinceLastRead}ms`,
          );
        }

        // Читаем с таймаутом
        const readStartTime = Date.now();
        const readPromise = reader.read();
        const timeoutPromise = new Promise<
          { done: boolean; value?: Uint8Array }
        >((_, reject) => {
          setTimeout(
            () =>
              reject(
                new Error(
                  `Read timeout: no data received for ${readTimeout}ms`,
                ),
              ),
            readTimeout,
          );
        });

        let result: { done: boolean; value?: Uint8Array };
        try {
          result = await Promise.race([readPromise, timeoutPromise]);
        } catch (timeoutError) {
          const timeoutTime = Date.now();
          const logger = getLogger();
          logger.info(
            `[Socks5Handler] [${timeoutTime}] pipeStream таймаут чтения для ${streamId} (ожидание данных, прошло: ${
              timeoutTime - readStartTime
            }ms)`,
          );
          throw timeoutError;
        }

        const readEndTime = Date.now();
        lastReadTime = readEndTime;

        if (result.done) {
          const logger = getLogger();
          logger.info(
            `[Socks5Handler] [${readEndTime}] pipeStream завершен для ${streamId}: done=true, всего ${totalBytes} байт в ${chunkCount} чанках (время работы: ${
              readEndTime - startTime
            }ms)`,
          );
          break;
        }
        if (result.value) {
          chunkCount++;
          totalBytes += result.value.length;
          const logger = getLogger();
          logger.info(
            `[Socks5Handler] [${readEndTime}] pipeStream передача для ${streamId}: ${result.value.length} байт (чанк #${chunkCount}, всего ${totalBytes} байт, задержка чтения: ${
              readEndTime - readStartTime
            }ms)`,
          );
          await writer.write(result.value);
        }
      }
    } catch (error) {
      const errorTime = Date.now();
      const logger = getLogger();
      logger.info(
        `[Socks5Handler] [${errorTime}] pipeStream ошибка для ${streamId}:`,
        error,
      );
      // Соединение закрыто или ошибка - отменяем reader, чтобы уведомить другую сторону
      try {
        await reader.cancel();
        const cancelTime = Date.now();
        logger.info(
          `[Socks5Handler] [${cancelTime}] pipeStream reader отменен для ${streamId} из-за ошибки`,
        );
      } catch (cancelError) {
        const cancelErrorTime = Date.now();
        logger.info(
          `[Socks5Handler] [${cancelErrorTime}] pipeStream ошибка при отмене reader для ${streamId}:`,
          cancelError,
        );
        // Игнорируем ошибки отмены
      }
    } finally {
      try {
        const closeTime = Date.now();
        const logger = getLogger();
        logger.info(
          `[Socks5Handler] [${closeTime}] pipeStream закрытие writer для ${streamId}`,
        );
        await writer.close();
      } catch (error) {
        const closeErrorTime = Date.now();
        const logger = getLogger();
        logger.info(
          `[Socks5Handler] [${closeErrorTime}] pipeStream ошибка при закрытии writer для ${streamId}:`,
          error,
        );
        // Игнорируем ошибки закрытия
      }
    }
  }

  /**
   * Читает указанное количество байт из reader.
   * Использует внутренний буфер для хранения остатка данных.
   */
  private async readBytes(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    count: number,
  ): Promise<Uint8Array> {
    console.log(
      `[Socks5Handler] readBytes: запрос на чтение ${count} байт, буфер: ${
        this.buffer.length - this.bufferOffset
      } байт`,
    );
    const result = new Uint8Array(count);
    let offset = 0;

    // Сначала используем данные из буфера, если они есть
    if (this.buffer.length > this.bufferOffset) {
      const available = this.buffer.length - this.bufferOffset;
      const toCopy = Math.min(available, count);
      result.set(
        this.buffer.slice(this.bufferOffset, this.bufferOffset + toCopy),
        0,
      );
      offset = toCopy;
      this.bufferOffset += toCopy;

      // Если буфер полностью использован, очищаем его
      if (this.bufferOffset >= this.buffer.length) {
        this.buffer = new Uint8Array(0);
        this.bufferOffset = 0;
      }
    }

    // Читаем остальные данные из потока
    while (offset < count) {
      console.log(
        `[Socks5Handler] readBytes: чтение из потока, нужно еще ${
          count - offset
        } байт...`,
      );
      const { done, value } = await reader.read();
      console.log(
        `[Socks5Handler] readBytes: прочитано из потока: done=${done}, value.length=${
          value?.length || 0
        }`,
      );
      if (done) {
        console.log(
          `[Socks5Handler] readBytes: поток закрыт, возвращаем ${offset} байт из ${count}`,
        );
        return result.slice(0, offset);
      }
      if (value) {
        const needed = count - offset;
        const toCopy = Math.min(value.length, needed);
        result.set(value.slice(0, toCopy), offset);
        offset += toCopy;

        // Если остались данные, сохраняем их в буфер
        if (value.length > toCopy) {
          this.buffer = value.slice(toCopy);
          this.bufferOffset = 0;
        }
      }
    }

    return result;
  }
}
