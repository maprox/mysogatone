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
