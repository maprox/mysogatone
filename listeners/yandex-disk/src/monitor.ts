import { StorageProvider, FileInfo } from "./storage-provider/index.ts";

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
    console.log(`[Monitor] Инициализация: получение списка файлов из ${this.watchFolder}...`);
    const initialFiles = await this.storageProvider.listFiles(this.watchFolder);
    console.log(`[Monitor] Найдено ${initialFiles.length} файлов при инициализации`);
    for (const file of initialFiles) {
      // Нормализуем путь: убираем префикс "disk:" если есть
      const normalizedPath = file.path.startsWith("disk:") 
        ? file.path.substring(5) 
        : file.path;
      console.log(`[Monitor] Добавлен в knownFiles: ${normalizedPath} (оригинальный: ${file.path})`);
      this.knownFiles.add(normalizedPath);
    }
    console.log(`[Monitor] Инициализация завершена. Известных файлов: ${this.knownFiles.size}`);
    
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
    try {
      const files = await this.storageProvider.listFiles(this.watchFolder);
      console.log(`[Monitor] Проверка папки ${this.watchFolder}: найдено ${files.length} файлов`);
      
      for (const file of files) {
        // Нормализуем путь: убираем префикс "disk:" если есть
        const normalizedPath = file.path.startsWith("disk:") 
          ? file.path.substring(5) 
          : file.path;
        
        if (!this.knownFiles.has(normalizedPath)) {
          // Обнаружен новый файл
          console.log(`[Monitor] Обнаружен новый запрос: ${normalizedPath} (оригинальный путь: ${file.path})`);
          this.knownFiles.add(normalizedPath);
          
          // Обрабатываем новый запрос (передаем файл с нормализованным путем)
          await onNewRequest({ ...file, path: normalizedPath });
        } else {
          console.log(`[Monitor] Файл уже известен: ${normalizedPath}`);
        }
      }
    } catch (error) {
      console.error(`[Monitor] Ошибка при проверке файлов в ${this.watchFolder}:`, error);
      throw error;
    }
  }
  
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

