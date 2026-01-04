/**
 * Скрипт для тестирования SOCKS5 сервера в реальных условиях
 * 
 * Использование:
 * 1. Запустите SOCKS5 сервер в отдельном терминале:
 *    deno run --allow-net src/main.ts
 * 
 * 2. Запустите этот скрипт:
 *    deno run --allow-net scripts/test-socks5-server.ts
 */

import type { TcpConn } from "../src/connection/types.ts";

/**
 * SOCKS5 клиент для тестирования сервера
 */
class Socks5TestClient {
  private conn: TcpConn | null = null;

  /**
   * Подключается к SOCKS5 серверу
   */
  async connect(serverHost: string, serverPort: number): Promise<void> {
    this.conn = await Deno.connect({
      hostname: serverHost,
      port: serverPort,
    });
    console.log(`✅ Подключено к SOCKS5 серверу ${serverHost}:${serverPort}`);
  }

  /**
   * Выполняет SOCKS5 handshake
   */
  async handshake(): Promise<void> {
    if (!this.conn) {
      throw new Error("Not connected");
    }

    // Отправляем приветствие: версия (0x05), количество методов (0x01), метод No Auth (0x00)
    const greeting = new Uint8Array([0x05, 0x01, 0x00]);
    await this.conn.write(greeting);
    console.log("📤 Отправлено приветствие SOCKS5");

    // Читаем ответ сервера
    const response = new Uint8Array(2);
    const n = await this.conn.read(response);
    if (n !== 2) {
      throw new Error(`Ожидалось 2 байта, получено ${n}`);
    }

    if (response[0] !== 0x05) {
      throw new Error(`Неверная версия SOCKS5: ${response[0]}`);
    }

    if (response[1] !== 0x00) {
      throw new Error(`Метод аутентификации не поддерживается: ${response[1]}`);
    }

    console.log("✅ SOCKS5 handshake успешен");
  }

  /**
   * Отправляет CONNECT запрос к целевому серверу
   */
  async connectToTarget(targetHost: string, targetPort: number): Promise<void> {
    if (!this.conn) {
      throw new Error("Not connected");
    }

    // Формируем CONNECT запрос
    // Структура: версия(1) + команда(1) + reserved(1) + тип_адреса(1) + длина_домена(1) + домен(N) + порт(2)
    const hostBytes = new TextEncoder().encode(targetHost);
    const request = new Uint8Array(4 + 1 + hostBytes.length + 2); // 4 байта заголовка + 1 байт длины + домен + 2 байта порта
    request[0] = 0x05; // Версия SOCKS5
    request[1] = 0x01; // CONNECT команда
    request[2] = 0x00; // Reserved
    request[3] = 0x03; // DOMAINNAME тип адреса
    request[4] = hostBytes.length; // Длина домена
    request.set(hostBytes, 5);
    const portOffset = 5 + hostBytes.length;
    request[portOffset] = (targetPort >> 8) & 0xff; // Старший байт порта
    request[portOffset + 1] = targetPort & 0xff; // Младший байт порта

    console.log(`📤 Формирование CONNECT запроса: длина=${request.length}, хост=${targetHost}, порт=${targetPort}`);
    console.log(`📤 Данные запроса: ${Array.from(request).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`);
    
    // Записываем данные с проверкой
    let totalWritten = 0;
    while (totalWritten < request.length) {
      const bytesWritten = await this.conn.write(request.slice(totalWritten));
      totalWritten += bytesWritten;
      console.log(`📤 Записано байт: ${bytesWritten}, всего: ${totalWritten}/${request.length}`);
      if (bytesWritten === 0) {
        throw new Error(`Failed to write all data: ${totalWritten}/${request.length} bytes written`);
      }
    }
    console.log(`📤 Отправлен CONNECT запрос к ${targetHost}:${targetPort}, записано байт: ${totalWritten}`);

    // Читаем ответ сервера
    // Минимальный ответ: версия (1) + код ответа (1) + reserved (1) + тип адреса (1) + адрес + порт (2)
    // Для IPv4: минимум 10 байт (4 байта адреса)
    const responseBuffer = new Uint8Array(256);
    let totalRead = 0;
    let minBytesRead = 4; // Минимум для проверки версии и кода ответа
    
    // Читаем минимум 4 байта для проверки версии и кода ответа
    console.log(`📥 Ожидание ответа CONNECT (минимум ${minBytesRead} байт)...`);
    while (totalRead < minBytesRead) {
      console.log(`📥 Попытка чтения ответа, уже прочитано: ${totalRead}/${minBytesRead} байт...`);
      const n = await this.conn.read(responseBuffer.subarray(totalRead));
      console.log(`📥 Прочитано байт: ${n}`);
      if (n === null || n === 0) {
        throw new Error(`Неверный ответ сервера: получено ${totalRead} байт, ожидалось минимум ${minBytesRead}`);
      }
      totalRead += n;
      console.log(`📥 Всего прочитано: ${totalRead} байт, данные: [${Array.from(responseBuffer.slice(0, totalRead)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(', ')}]`);
    }

    if (responseBuffer[0] !== 0x05) {
      throw new Error(`Неверная версия SOCKS5 в ответе: ${responseBuffer[0]}`);
    }

    if (responseBuffer[1] !== 0x00) {
      const errorCodes: Record<number, string> = {
        0x01: "General SOCKS server failure",
        0x02: "Connection not allowed by ruleset",
        0x03: "Network unreachable",
        0x04: "Host unreachable",
        0x05: "Connection refused",
        0x06: "TTL expired",
        0x07: "Command not supported",
        0x08: "Address type not supported",
      };
      const errorMsg = errorCodes[responseBuffer[1]] || `Unknown error code: ${responseBuffer[1]}`;
      throw new Error(`SOCKS5 ошибка: ${errorMsg}`);
    }

    // Определяем сколько еще байт нужно прочитать в зависимости от типа адреса
    const addressType = responseBuffer[3];
    let addressLength = 0;
    
    if (addressType === 0x01) {
      // IPv4: 4 байта адреса + 2 байта порта = 6 байт после типа адреса
      addressLength = 6;
    } else if (addressType === 0x03) {
      // Доменное имя: 1 байт длины + домен + 2 байта порта
      // Нужно прочитать еще минимум 1 байт для длины домена
      if (totalRead < 5) {
        const n = await this.conn.read(responseBuffer.subarray(totalRead));
        if (n === null || n === 0) {
          throw new Error("Неверный ответ: не удалось прочитать длину домена");
        }
        totalRead += n;
      }
      const domainLength = responseBuffer[4];
      addressLength = 1 + domainLength + 2; // длина + домен + порт
    } else if (addressType === 0x04) {
      // IPv6: 16 байт адреса + 2 байта порта = 18 байт после типа адреса
      addressLength = 18;
    } else {
      throw new Error(`Неизвестный тип адреса в ответе: ${addressType}`);
    }

    // Читаем оставшиеся байты адреса и порта
    const expectedTotal = 4 + addressLength;
    while (totalRead < expectedTotal) {
      const n = await this.conn.read(responseBuffer.subarray(totalRead));
      if (n === null || n === 0) {
        break;
      }
      totalRead += n;
    }

    console.log("✅ CONNECT запрос успешен, туннель установлен");
  }

  /**
   * Отправляет HTTP запрос через туннель
   */
  async sendHttpRequest(host: string, path: string = "/"): Promise<string> {
    if (!this.conn) {
      throw new Error("Not connected");
    }

    const httpRequest = `GET ${path} HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`;
    const requestBytes = new TextEncoder().encode(httpRequest);
    await this.conn.write(requestBytes);
    console.log(`📤 Отправлен HTTP запрос: GET ${path}`);

    // Читаем ответ
    const chunks: Uint8Array[] = [];
    const buffer = new Uint8Array(4096);
    
    while (true) {
      const n = await this.conn.read(buffer);
      if (n === null || n === 0) {
        break;
      }
      chunks.push(buffer.slice(0, n));
    }

    const response = new Uint8Array(chunks.reduce((acc, chunk) => acc + chunk.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      response.set(chunk, offset);
      offset += chunk.length;
    }

    const responseText = new TextDecoder().decode(response);
    console.log(`📥 Получен ответ (${response.length} байт)`);
    return responseText;
  }

  /**
   * Закрывает соединение
   */
  close(): void {
    if (this.conn) {
      this.conn.close();
      this.conn = null;
      console.log("🔌 Соединение закрыто");
    }
  }
}

/**
 * Основная функция тестирования
 */
async function main(): Promise<void> {
  const serverHost = Deno.env.get("SOCKS5_HOST") || "127.0.0.1";
  const serverPort = parseInt(Deno.env.get("SOCKS5_PORT") || "1080", 10);
  const targetHost = Deno.env.get("TARGET_HOST") || "httpbin.org";
  const targetPort = parseInt(Deno.env.get("TARGET_PORT") || "80", 10);

  console.log("🧪 Тестирование SOCKS5 сервера");
  console.log(`   Сервер: ${serverHost}:${serverPort}`);
  console.log(`   Целевой хост: ${targetHost}:${targetPort}`);
  console.log("");

  const client = new Socks5TestClient();

  try {
    // Подключаемся к SOCKS5 серверу
    await client.connect(serverHost, serverPort);

    // Выполняем handshake
    await client.handshake();

    // Подключаемся к целевому серверу
    await client.connectToTarget(targetHost, targetPort);

    // Отправляем HTTP запрос
    const response = await client.sendHttpRequest(targetHost, "/get");
    
    // Проверяем ответ
    if (response.includes("HTTP/1.1") || response.includes("HTTP/1.0")) {
      console.log("✅ HTTP запрос успешен!");
      console.log("\n📄 Первые 500 символов ответа:");
      console.log(response.substring(0, 500));
      if (response.length > 500) {
        console.log("...");
      }
    } else {
      console.log("⚠️  Получен неожиданный ответ:");
      console.log(response.substring(0, 500));
    }

  } catch (error) {
    console.error("❌ Ошибка при тестировании:", error);
    Deno.exit(1);
  } finally {
    client.close();
  }

  console.log("\n✅ Тестирование завершено успешно!");
}

if (import.meta.main) {
  await main();
}

