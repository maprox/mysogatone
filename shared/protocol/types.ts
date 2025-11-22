/**
 * Типы для протокола передачи TCP данных через файлы
 */

/**
 * Метаданные запроса на подключение
 */
export interface RequestMetadata {
  /** Уникальный идентификатор запроса (UUID v4) */
  requestId: string;
  /** Адрес целевого сервера (GOAL) */
  targetAddress: string;
  /** Порт целевого сервера (1-65535) */
  targetPort: number;
  /** Unix timestamp создания запроса (опционально) */
  timestamp?: number;
}

/**
 * Метаданные ошибки при обработке запроса
 */
export interface ErrorMetadata {
  /** Уникальный идентификатор запроса */
  requestId: string;
  /** Описание ошибки */
  error: string;
  /** Код ошибки */
  code: string;
  /** Unix timestamp ошибки */
  timestamp: number;
}

/**
 * Коды ошибок
 */
export enum ErrorCode {
  CONNECTION_ERROR = "CONNECTION_ERROR",
  TIMEOUT = "TIMEOUT",
  INVALID_REQUEST = "INVALID_REQUEST",
  STORAGE_ERROR = "STORAGE_ERROR",
}

/**
 * Пути к файлам протокола
 */
export class ProtocolPaths {
  constructor(
    private requestsFolder: string = "requests",
    private responsesFolder: string = "responses"
  ) {}

  /**
   * Путь к файлу метаданных запроса
   */
  requestMetadata(requestId: string): string {
    return `${this.requestsFolder}/${requestId}.req`;
  }

  /**
   * Путь к файлу данных запроса
   */
  requestData(requestId: string): string {
    return `${this.requestsFolder}/${requestId}.data`;
  }

  /**
   * Путь к файлу ответа
   */
  response(requestId: string): string {
    return `${this.responsesFolder}/${requestId}.resp`;
  }

  /**
   * Путь к файлу ошибки
   */
  error(requestId: string): string {
    return `${this.responsesFolder}/${requestId}.error`;
  }
}

/**
 * Утилиты для работы с протоколом
 */
export class ProtocolUtils {
  /**
   * Генерирует уникальный идентификатор запроса (UUID v4)
   */
  static generateRequestId(): string {
    // Используем crypto.randomUUID() если доступно, иначе fallback
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    // Fallback для старых окружений
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  /**
   * Парсит requestId из имени файла
   */
  static parseRequestId(filename: string): string | null {
    // Извлекает UUID из имени файла вида "{requestId}.req" или "{requestId}.data"
    const match = filename.match(/^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\./i);
    return match ? match[1] : null;
  }

  /**
   * Проверяет, является ли файл файлом метаданных запроса
   */
  static isRequestMetadata(filename: string): boolean {
    return filename.endsWith(".req");
  }

  /**
   * Проверяет, является ли файл файлом данных запроса
   */
  static isRequestData(filename: string): boolean {
    return filename.endsWith(".data");
  }

  /**
   * Проверяет, является ли файл файлом ответа
   */
  static isResponse(filename: string): boolean {
    return filename.endsWith(".resp");
  }

  /**
   * Проверяет, является ли файл файлом ошибки
   */
  static isError(filename: string): boolean {
    return filename.endsWith(".error");
  }
}

