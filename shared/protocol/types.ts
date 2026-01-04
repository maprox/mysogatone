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
  /** Уникальный идентификатор сессии (UUID v4) - для поддержки постоянных соединений */
  sessionId?: string;
  /** Является ли это первым запросом в сессии */
  isFirstInSession?: boolean;
  /** Сохранять ли сессию после обработки ответа (для HTTPS, WebSocket и т.д.) */
  keepSessionAlive?: boolean;
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
