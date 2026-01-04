/**
 * Скрипт для создания тестового запроса на Яндекс Диске
 * 
 * Создает файлы .req, .chunk.N и .ready для тестирования LISTENER
 */

import { YandexDiskProvider } from "@src/storage-provider/index.ts";
import { RequestMetadata } from "@shared/protocol/types.ts";
import { ProtocolPaths } from "@shared/protocol/paths.ts";
import { generateRequestId } from "@shared/protocol/utils.ts";
import { ensureFoldersExist } from "@src/listener/folder-manager.ts";

/**
 * Создает тестовый запрос на Яндекс Диске
 */
async function createTestRequest(
  token: string,
  targetAddress: string,
  targetPort: number,
  requestsFolder: string
): Promise<string> {
  const provider = new YandexDiskProvider(token);
  const protocolPaths = new ProtocolPaths(requestsFolder, ".mysogatone/responses");

  // Создаем необходимые папки
  await ensureFoldersExist(
    ".mysogatone",
    requestsFolder,
    ".mysogatone/responses",
    provider,
    token
  );

  // Генерируем уникальный requestId
  const requestId = generateRequestId();
  console.log(`📝 Создание тестового запроса: ${requestId}`);

  // Создаем метаданные запроса
  const metadata: RequestMetadata = {
    requestId,
    targetAddress,
    targetPort,
    timestamp: Date.now(),
  };

  // Создаем HTTP GET запрос
  const httpRequest = `GET / HTTP/1.1\r\nHost: ${targetAddress}\r\nUser-Agent: Mysogatone-Test/1.0\r\nAccept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8\r\nAccept-Language: ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7\r\nAccept-Encoding: identity\r\nConnection: close\r\n\r\n`;
  const requestData = new TextEncoder().encode(httpRequest);

  // Загружаем файл метаданных
  const metadataPath = protocolPaths.requestMetadata(requestId);
  await provider.uploadFile(metadataPath, new TextEncoder().encode(JSON.stringify(metadata, null, 2)));
  console.log(`✅ Метаданные загружены`);

  // Загружаем данные в новом формате (чанки + .ready)
  if (requestData.length > 0) {
    // Загружаем данные как один чанк
    const chunkPath = protocolPaths.requestDataChunk(requestId, 0);
    await provider.uploadFile(chunkPath, requestData);
    console.log(`✅ Чанк #0 загружен (${requestData.length} байт)`);
  }

  // Создаем файл .ready с метаданными
  const readyPath = protocolPaths.requestDataReady(requestId);
  const readyInfo = {
    totalChunks: requestData.length > 0 ? 1 : 0,
    totalBytes: requestData.length,
  };
  const readyData = new TextEncoder().encode(JSON.stringify(readyInfo));
  await provider.uploadFile(readyPath, readyData);
  console.log(`✅ Файл готовности создан (${readyInfo.totalChunks} чанков, ${readyInfo.totalBytes} байт)`);

  console.log(`\n✅ Тестовый запрос создан успешно!`);
  console.log(`📋 RequestId: ${requestId}`);
  console.log(`🎯 Целевой сервер: ${targetAddress}:${targetPort}`);

  return requestId;
}

/**
 * Парсит адрес и порт из аргументов
 */
function parseTarget(args: string[]): { address: string; port: number } {
  const target = args[0] || "ya.ru";
  let address = target;
  let port = parseInt(args[1] || "80", 10);

  if (target.startsWith("https://")) {
    address = target.replace("https://", "").replace(/\/.*$/, "");
    port = 443;
  } else if (target.startsWith("http://")) {
    address = target.replace("http://", "").replace(/\/.*$/, "");
    port = 80;
  }

  return { address, port };
}

/**
 * Основная функция
 */
async function main(): Promise<void> {
  const token = Deno.env.get("YANDEX_DISK_TOKEN") || Deno.args[0];
  const args = Deno.env.get("YANDEX_DISK_TOKEN") ? Deno.args : Deno.args.slice(1);

  if (!token) {
    console.error("❌ Ошибка: требуется OAuth токен");
    console.error("\nИспользование:");
    console.error("  deno run --allow-net --allow-env scripts/create-test-request.ts [ADDRESS] [PORT]");
    console.error("\nПримеры:");
    console.error("  deno run --allow-net --allow-env scripts/create-test-request.ts ya.ru 80");
    console.error("  deno run --allow-net --allow-env scripts/create-test-request.ts https://ya.ru");
    console.error("\nИли через переменную окружения:");
    console.error("  $env:YANDEX_DISK_TOKEN=\"your_token\"");
    console.error("  deno run --allow-net --allow-env scripts/create-test-request.ts ya.ru");
    Deno.exit(1);
  }

  const { address, port } = parseTarget(args);

  try {
    await createTestRequest(token, address, port, ".mysogatone/requests");
  } catch (error) {
    console.error("❌ Критическая ошибка:", error);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}

