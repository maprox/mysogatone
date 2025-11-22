/**
 * Обработчик SOCKS5 протокола для одного клиента.
 */

import type { ConnectionHandler } from "./connection-handler.ts";

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
    try {
      const reader = this.conn.readable.getReader();
      const writer = this.conn.writable.getWriter();

      // Этап 1: Handshake
      if (!(await this.handleHandshake(reader, writer))) {
        return;
      }

      // Этап 2: Запрос на подключение
      const targetStreams = await this.handleConnectRequest(reader, writer);
      if (!targetStreams) {
        return;
      }

      // Этап 3: Передача данных
      await this.transferData(reader, writer, targetStreams.reader, targetStreams.writer);
    } catch (error) {
      console.error("Error handling SOCKS5 connection:", error);
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
    writer: WritableStreamDefaultWriter<Uint8Array>
  ): Promise<boolean> {
    try {
      // Читаем версию SOCKS (1 байт)
      const versionData = await this.readBytes(reader, 1);
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
      if (!hasNoAuth) {
        // Отправляем ответ об отсутствии поддерживаемых методов
        await writer.write(new Uint8Array([SOCKS_VERSION, 0xFF]));
        await writer.close();
        return false;
      }

      // Отправляем ответ: версия SOCKS5, метод No Auth
      await writer.write(new Uint8Array([SOCKS_VERSION, METHOD_NO_AUTH]));

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
    writer: WritableStreamDefaultWriter<Uint8Array>
  ): Promise<{ reader: ReadableStreamDefaultReader<Uint8Array>; writer: WritableStreamDefaultWriter<Uint8Array> } | null> {
    try {
      // Читаем версию SOCKS (1 байт)
      const versionData = await this.readBytes(reader, 1);
      if (versionData.length === 0 || versionData[0] !== SOCKS_VERSION) {
        await this.sendConnectReply(writer, REPLY_GENERAL_FAILURE, "0.0.0.0", 0);
        return null;
      }

      // Читаем команду (1 байт)
      const commandData = await this.readBytes(reader, 1);
      if (commandData.length === 0) {
        await this.sendConnectReply(writer, REPLY_GENERAL_FAILURE, "0.0.0.0", 0);
        return null;
      }
      const command = commandData[0];
      if (command !== CMD_CONNECT) {
        await this.sendConnectReply(writer, REPLY_COMMAND_NOT_SUPPORTED, "0.0.0.0", 0);
        return null;
      }

      // Резервный байт (1 байт)
      await this.readBytes(reader, 1);

      // Читаем тип адреса (1 байт)
      const addressTypeData = await this.readBytes(reader, 1);
      if (addressTypeData.length === 0) {
        await this.sendConnectReply(writer, REPLY_GENERAL_FAILURE, "0.0.0.0", 0);
        return null;
      }
      const addressType = addressTypeData[0];

      let targetAddress: string;

      switch (addressType) {
        case ADDR_TYPE_IPV4: {
          // IPv4 адрес (4 байта)
          const ipBytes = await this.readBytes(reader, 4);
          if (ipBytes.length !== 4) {
            await this.sendConnectReply(writer, REPLY_GENERAL_FAILURE, "0.0.0.0", 0);
            return null;
          }
          targetAddress = `${ipBytes[0]}.${ipBytes[1]}.${ipBytes[2]}.${ipBytes[3]}`;
          break;
        }
        case ADDR_TYPE_DOMAIN: {
          // Доменное имя
          const domainLengthData = await this.readBytes(reader, 1);
          if (domainLengthData.length === 0) {
            await this.sendConnectReply(writer, REPLY_GENERAL_FAILURE, "0.0.0.0", 0);
            return null;
          }
          const domainLength = domainLengthData[0];
          const domainBytes = await this.readBytes(reader, domainLength);
          if (domainBytes.length !== domainLength) {
            await this.sendConnectReply(writer, REPLY_GENERAL_FAILURE, "0.0.0.0", 0);
            return null;
          }
          targetAddress = new TextDecoder().decode(domainBytes);
          break;
        }
        case ADDR_TYPE_IPV6: {
          // IPv6 адрес (16 байт) - пока не поддерживаем
          await this.readBytes(reader, 16);
          await this.sendConnectReply(writer, REPLY_ADDRESS_TYPE_NOT_SUPPORTED, "0.0.0.0", 0);
          return null;
        }
        default: {
          await this.sendConnectReply(writer, REPLY_ADDRESS_TYPE_NOT_SUPPORTED, "0.0.0.0", 0);
          return null;
        }
      }

      // Читаем порт (2 байта, big-endian)
      const portData = await this.readBytes(reader, 2);
      if (portData.length !== 2) {
        await this.sendConnectReply(writer, REPLY_GENERAL_FAILURE, "0.0.0.0", 0);
        return null;
      }
      const targetPort = (portData[0] << 8) | portData[1];

      // Устанавливаем соединение через ConnectionHandler
      let targetStreams;
      try {
        targetStreams = await this.connectionHandler.connect(targetAddress, targetPort);
      } catch (error) {
        console.error(`Failed to connect to ${targetAddress}:${targetPort}:`, error);
        await this.sendConnectReply(writer, REPLY_CONNECTION_REFUSED, "0.0.0.0", 0);
        return null;
      }

      // Отправляем успешный ответ
      // Используем адрес сервера для ответа
      const localAddr = this.conn.localAddr;
      const serverAddress = localAddr.transport === "tcp" ? localAddr.hostname : "0.0.0.0";
      const serverPort = localAddr.transport === "tcp" ? localAddr.port : 0;
      await this.sendConnectReply(writer, REPLY_SUCCESS, serverAddress, serverPort);

      // Возвращаем потоки для передачи данных
      return targetStreams;
    } catch (error) {
      console.error("Error in connect request:", error);
      try {
        await this.sendConnectReply(writer, REPLY_GENERAL_FAILURE, "0.0.0.0", 0);
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
    port: number
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

    await writer.write(reply);
  }

  /**
   * Передача данных между клиентом и целевым сервером.
   */
  private async transferData(
    clientReader: ReadableStreamDefaultReader<Uint8Array>,
    clientWriter: WritableStreamDefaultWriter<Uint8Array>,
    targetReader: ReadableStreamDefaultReader<Uint8Array>,
    targetWriter: WritableStreamDefaultWriter<Uint8Array>
  ): Promise<void> {
    // Запускаем две асинхронные задачи для двунаправленной передачи данных
    const clientToTarget = this.pipeStream(clientReader, targetWriter);
    const targetToClient = this.pipeStream(targetReader, clientWriter);

    // Ждем завершения обеих задач
    await Promise.allSettled([clientToTarget, targetToClient]);
  }

  /**
   * Передает данные из reader в writer.
   */
  private async pipeStream(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    writer: WritableStreamDefaultWriter<Uint8Array>
  ): Promise<void> {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (value) {
          await writer.write(value);
        }
      }
    } catch {
      // Соединение закрыто или ошибка
    } finally {
      try {
        await writer.close();
      } catch {
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
    count: number
  ): Promise<Uint8Array> {
    const result = new Uint8Array(count);
    let offset = 0;

    // Сначала используем данные из буфера, если они есть
    if (this.buffer.length > this.bufferOffset) {
      const available = this.buffer.length - this.bufferOffset;
      const toCopy = Math.min(available, count);
      result.set(this.buffer.slice(this.bufferOffset, this.bufferOffset + toCopy), 0);
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
      const { done, value } = await reader.read();
      if (done) {
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

