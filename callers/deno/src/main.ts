/**
 * CALLER для Deno
 * 
 * SOCKS5 сервер на Deno для тестирования на Windows/Linux/Mac.
 */

import { Socks5Server } from "./socks5-server.ts";
import { DefaultConnectionHandler } from "./default-connection-handler.ts";
import { YandexDiskProvider } from "./storage-provider/yandex-disk-provider.ts";
import { YandexDiskConnectionHandler } from "./yandex-disk-connection-handler/index.ts";
import { ProtocolPaths } from "@shared/protocol/types.ts";

/**
 * Точка входа в приложение.
 */
async function main(): Promise<void> {
  const port = parseInt(Deno.env.get("SOCKS5_PORT") || "1080", 10);
  const accessToken = Deno.env.get("YANDEX_DISK_TOKEN");
  const requestsFolder = Deno.env.get("REQUESTS_FOLDER") || ".mysogatone/requests";
  const responsesFolder = Deno.env.get("RESPONSES_FOLDER") || ".mysogatone/responses";
  const pollInterval = parseInt(Deno.env.get("POLL_INTERVAL_MS") || "2000", 10);
  const responseTimeout = parseInt(Deno.env.get("RESPONSE_TIMEOUT_MS") || "60000", 10);

  let connectionHandler;

  if (accessToken) {
    console.log("Используется YandexDiskProvider для ConnectionHandler.");
    const storageProvider = new YandexDiskProvider(accessToken);
    const protocolPaths = new ProtocolPaths(requestsFolder, responsesFolder);
    
    connectionHandler = new YandexDiskConnectionHandler({
      storageProvider,
      protocolPaths,
      pollInterval,
      responseTimeout,
    });
  } else {
    console.log("YANDEX_DISK_TOKEN не найден. Используется DefaultConnectionHandler.");
    connectionHandler = new DefaultConnectionHandler();
  }

  const server = new Socks5Server(port, connectionHandler);

  // Обработка сигнала завершения
  Deno.addSignalListener("SIGINT", () => {
    console.log("\nПолучен сигнал SIGINT, останавливаем сервер...");
    server.stop();
    Deno.exit(0);
  });

  Deno.addSignalListener("SIGTERM", () => {
    console.log("\nПолучен сигнал SIGTERM, останавливаем сервер...");
    server.stop();
    Deno.exit(0);
  });

  try {
    await server.start();
  } catch (error) {
    console.error("Ошибка при запуске сервера:", error);
    Deno.exit(1);
  }
}

// Запускаем приложение
if (import.meta.main) {
  main();
}

