/**
 * Типы для логгера
 */

/**
 * Уровни логирования
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

/**
 * Интерфейс для логирования
 */
export interface Logger {
  /** Логирует сообщение уровня DEBUG */
  debug(message: string, ...args: unknown[]): void;
  /** Логирует сообщение уровня INFO */
  info(message: string, ...args: unknown[]): void;
  /** Логирует сообщение уровня WARN */
  warn(message: string, ...args: unknown[]): void;
  /** Логирует сообщение уровня ERROR */
  error(message: string, ...args: unknown[]): void;
}

