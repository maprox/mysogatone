import { StorageProvider, FileInfo } from "./storage-provider.ts";

/**
 * Мониторинг изменений в Яндекс Диске
 * 
 * Реализует polling механизм для обнаружения новых запросов на подключение.
 */
export class Monitor {
  private storageProvider: StorageProvider;
  private watchFolder: string;
  private pollInterval: number; // в миллисекундах
  private knownFiles: Set<string> = new Set();
  private running: boolean = false;
  
  constructor(
    storageProvider: StorageProvider,
    watchFolder: string,
    pollInterval: number = 5000 // 5 секунд по умолчанию
  ) {
    this.storageProvider = storageProvider;
    this.watchFolder = watchFolder;
    this.pollInterval = pollInterval;
  }
  
  /**
   * Запускает мониторинг
   */
  async start(onNewRequest: (fileInfo: FileInfo) => Promise<void>): Promise<void> {
    this.running = true;
    console.log(`Мониторинг запущен для папки: ${this.watchFolder}`);
    
    // Инициализация: получаем текущий список файлов
    const initialFiles = await this.storageProvider.listFiles(this.watchFolder);
    for (const file of initialFiles) {
      this.knownFiles.add(file.path);
    }
    
    // Основной цикл polling
    while (this.running) {
      try {
        await this.checkForNewFiles(onNewRequest);
      } catch (error) {
        console.error("Ошибка при проверке файлов:", error);
      }
      
      // Ждем перед следующей проверкой
      await this.sleep(this.pollInterval);
    }
  }
  
  /**
   * Останавливает мониторинг
   */
  stop(): void {
    this.running = false;
    console.log("Мониторинг остановлен");
  }
  
  private async checkForNewFiles(
    onNewRequest: (fileInfo: FileInfo) => Promise<void>
  ): Promise<void> {
    const files = await this.storageProvider.listFiles(this.watchFolder);
    
    for (const file of files) {
      if (!this.knownFiles.has(file.path)) {
        // Обнаружен новый файл
        console.log(`Обнаружен новый запрос: ${file.path}`);
        this.knownFiles.add(file.path);
        
        // Обрабатываем новый запрос
        await onNewRequest(file);
      }
    }
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

