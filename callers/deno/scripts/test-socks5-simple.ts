/**
 * Упрощенный тест SOCKS5 сервера - только CONNECT запрос без HTTP
 * 
 * Использование:
 * deno run --allow-net --allow-env scripts/test-socks5-simple.ts
 */

/**
 * SOCKS5 клиент для простого тестирования
 */
class SimpleSocks5Client {
  private conn: Deno.TcpConn | null = null;

  async connect(serverHost: string, serverPort: number): Promise<void> {
    this.conn = await Deno.connect({
      hostname: serverHost,
      port: serverPort,
    });
    console.log(`✅ Подключено к SOCKS5 серверу ${serverHost}:${serverPort}`);
  }

  async handshake(): Promise<void> {
    if (!this.conn) throw new Error("Not connected");

    const greeting = new Uint8Array([0x05, 0x01, 0x00]);
    await this.conn.write(greeting);
    console.log("📤 Отправлено приветствие SOCKS5");

    const response = new Uint8Array(2);
    const n = await this.conn.read(response);
    if (n !== 2 || response[0] !== 0x05 || response[1] !== 0x00) {
      throw new Error("Handshake failed");
    }
    console.log("✅ SOCKS5 handshake успешен");
  }

  async connectToTarget(targetHost: string, targetPort: number): Promise<void> {
    if (!this.conn) throw new Error("Not connected");

    const hostBytes = new TextEncoder().encode(targetHost);
    const request = new Uint8Array(4 + 1 + hostBytes.length + 2);
    request[0] = 0x05;
    request[1] = 0x01;
    request[2] = 0x00;
    request[3] = 0x03;
    request[4] = hostBytes.length;
    request.set(hostBytes, 5);
    const portOffset = 5 + hostBytes.length;
    request[portOffset] = (targetPort >> 8) & 0xff;
    request[portOffset + 1] = targetPort & 0xff;

    console.log(`📤 Отправка CONNECT запроса к ${targetHost}:${targetPort}...`);
    await this.conn.write(request);

    // Читаем ответ CONNECT
    const responseBuffer = new Uint8Array(10);
    let totalRead = 0;
    
    while (totalRead < 4) {
      const n = await this.conn.read(responseBuffer.subarray(totalRead));
      if (n === null || n === 0) {
        throw new Error(`Неверный ответ: получено ${totalRead} байт`);
      }
      totalRead += n;
    }

    if (responseBuffer[0] !== 0x05) {
      throw new Error(`Неверная версия: ${responseBuffer[0]}`);
    }

    if (responseBuffer[1] !== 0x00) {
      throw new Error(`SOCKS5 ошибка: ${responseBuffer[1]}`);
    }

    // Читаем остальные байты (IPv4 адрес + порт = 6 байт)
    while (totalRead < 10) {
      const n = await this.conn.read(responseBuffer.subarray(totalRead));
      if (n === null || n === 0) {
        break;
      }
      totalRead += n;
    }

    console.log("✅ CONNECT запрос успешен, туннель установлен");
    
    // Отправляем простые данные для теста
    const testData = new TextEncoder().encode("GET / HTTP/1.1\r\nHost: ya.ru\r\n\r\n");
    console.log(`📤 Отправка тестовых данных (${testData.length} байт)...`);
    await this.conn.write(testData);
    
    // Закрываем соединение - это должно загрузить данные в хранилище
    console.log("🔌 Закрытие соединения...");
    this.conn.close();
    this.conn = null;
    console.log("✅ Соединение закрыто, данные должны быть загружены в хранилище");
  }
}

async function main(): Promise<void> {
  const serverHost = Deno.env.get("SOCKS5_HOST") || "127.0.0.1";
  const serverPort = parseInt(Deno.env.get("SOCKS5_PORT") || "1080", 10);
  const targetHost = Deno.env.get("TARGET_HOST") || "ya.ru";
  const targetPort = parseInt(Deno.env.get("TARGET_PORT") || "80", 10);

  console.log("🧪 Упрощенный тест SOCKS5 сервера");
  console.log(`   Сервер: ${serverHost}:${serverPort}`);
  console.log(`   Целевой хост: ${targetHost}:${targetPort}`);
  console.log("");

  const client = new SimpleSocks5Client();

  try {
    await client.connect(serverHost, serverPort);
    await client.handshake();
    await client.connectToTarget(targetHost, targetPort);
    
    // Даем время на загрузку данных
    console.log("⏳ Ожидание загрузки данных в хранилище...");
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log("\n✅ Тест завершен! Проверьте Яндекс Диск - должен быть создан файл .data");
  } catch (error) {
    console.error("❌ Ошибка:", error);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}

