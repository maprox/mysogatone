/**
 * Основной класс LISTENER
 * 
 * Сервер в интернете, который мониторит Яндекс Диск и обрабатывает запросы на подключение.
 */

import type { StorageProvider } from "@src/storage-provider/index.ts";
import { Monitor } from "@src/monitor.ts";
import { ConnectionHandler } from "@src/connection-handler.ts";
import { ProtocolPaths } from "@shared/protocol/types.ts";
import type { ListenerConfig } from "./config.ts";
import {
  processRequest,
  extractRequestIdFromPath,
} from "./request-handler.ts";
import { sleep } from "./utils.ts";
import { ensureFoldersExist } from "./folder-manager.ts";
import { setupSignalHandlers } from "./signal-handler.ts";

/**
 * Основной класс LISTENER
 */
export class Listener {
  private storageProvider: StorageProvider;
  private monitor: Monitor;
  private connectionHandler: ConnectionHandler;
  private protocolPaths: ProtocolPaths;
  private config: ListenerConfig;
  private running: boolean = false;
  private processingRequests: Set<string> = new Set();

  constructor(
    config: ListenerConfig,
    storageProvider: StorageProvider
  ) {
    this.config = config;
    this.storageProvider = storageProvider;
    this.protocolPaths = new ProtocolPaths(
      config.requestsFolder,
      config.responsesFolder
    );
    this.monitor = new Monitor(
      this.storageProvider,
      config.requestsFolder,
      config.pollInterval
    );
    this.connectionHandler = new ConnectionHandler(
      this.storageProvider,
      this.protocolPaths,
      config.connectionTimeout
    );
  }

  /**
   * Запускает LISTENER
   */
  async start(): Promise<void> {
    if (this.running) {
      console.warn("LISTENER уже запущен");
      return;
    }

    this.running = true;
    this.logStartupInfo();

    // Создаем необходимые папки
    await ensureFoldersExist(
      ".mysogatone",
      this.config.requestsFolder,
      this.config.responsesFolder,
      this.storageProvider,
      this.config.accessToken
    );

    // Обработка сигналов для graceful shutdown (устанавливаем ДО запуска monitor)
    setupSignalHandlers(() => this.stop());

    // Запускаем мониторинг (блокирующий вызов с бесконечным циклом)
    await this.monitor.start((fileInfo) => this.handleNewFile(fileInfo));
  }

  /**
   * Останавливает LISTENER
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    console.log("\n🛑 Остановка LISTENER...");
    this.running = false;
    this.monitor.stop();

    // Ждем завершения обработки текущих запросов
    await this.waitForPendingRequests();

    console.log("✅ LISTENER остановлен");
  }

  /**
   * Обрабатывает новый файл, обнаруженный монитором
   */
  private async handleNewFile(fileInfo: { path: string }): Promise<void> {
    console.log(`[Listener] handleNewFile вызван для пути: ${fileInfo.path}`);
    const requestId = extractRequestIdFromPath(fileInfo.path);
    if (!requestId) {
      console.log(`[Listener] Не удалось извлечь requestId из ${fileInfo.path}, пропускаем`);
      return;
    }

    // Проверяем, не обрабатывается ли уже этот запрос
    if (this.processingRequests.has(requestId)) {
      console.log(`[Listener] Запрос ${requestId} уже обрабатывается, пропускаем`);
      return;
    }

    console.log(`[Listener] Начинаем обработку запроса ${requestId}`);
    // Добавляем в список обрабатываемых
    this.processingRequests.add(requestId);

    try {
      await processRequest({
        requestId,
        storageProvider: this.storageProvider,
        connectionHandler: this.connectionHandler,
        protocolPaths: this.protocolPaths,
      });
    } catch (error) {
      console.error(`❌ Ошибка при обработке запроса ${requestId}:`, error);
      // Ошибка уже обработана в ConnectionHandler и записана в .error файл
      // Файлы запроса будут удалены в processRequest через cleanupRequest
    } finally {
      // Удаляем из списка обрабатываемых
      this.processingRequests.delete(requestId);
      console.log(`[Listener] Завершена обработка запроса ${requestId}`);
    }
  }

  /**
   * Выводит информацию о запуске
   */
  private logStartupInfo(): void {
    console.log("🚀 LISTENER для Яндекс Диск запускается...");
    console.log(`📁 Папка запросов: ${this.config.requestsFolder}`);
    console.log(`📁 Папка ответов: ${this.config.responsesFolder}`);
    console.log(`⏱️  Интервал polling: ${this.config.pollInterval}ms`);
    console.log(`⏱️  Таймаут подключения: ${this.config.connectionTimeout}ms`);
  }

  /**
   * Ожидает завершения обработки всех текущих запросов
   */
  private async waitForPendingRequests(): Promise<void> {
    while (this.processingRequests.size > 0) {
      console.log(
        `⏳ Ожидание завершения ${this.processingRequests.size} запросов...`
      );
      await sleep(1000);
    }
  }

}

