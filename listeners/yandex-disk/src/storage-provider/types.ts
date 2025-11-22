/**
 * Типы и интерфейсы для StorageProvider
 */

export interface StorageProvider {
  /**
   * Читает список файлов в указанной папке
   */
  listFiles(folderPath: string): Promise<FileInfo[]>;
  
  /**
   * Загружает файл из хранилища
   */
  downloadFile(filePath: string): Promise<Uint8Array>;
  
  /**
   * Загружает файл в хранилище
   */
  uploadFile(filePath: string, data: Uint8Array): Promise<void>;
  
  /**
   * Удаляет файл из хранилища
   */
  deleteFile(filePath: string): Promise<void>;
}

export interface FileInfo {
  name: string;
  path: string;
  size: number;
  modified: Date;
}

/**
 * Конфигурация для retry механизма
 */
export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

