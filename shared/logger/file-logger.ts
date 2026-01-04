/**
 * Реализация логгера с записью в файл
 */

import type { Logger } from "./types.ts";
import { LogLevel } from "./types.ts";
import { formatLogMessageWithTimestamp } from "./utils.ts";

/**
 * Реализация логгера с записью в файл
 */
export class FileLogger implements Logger {
  private logFile: Deno.FsFile | null = null;
  private logFilePath: string;
  private minLevel: LogLevel;
  private prefix: string;

  constructor(
    logFilePath: string = "logs/app.log",
    minLevel: LogLevel = LogLevel.INFO,
    prefix: string = "APP"
  ) {
    this.logFilePath = logFilePath;
    this.minLevel = minLevel;
    this.prefix = prefix;
  }

  /**
   * Инициализирует логгер (создает файл и папку, если нужно)
   */
  async initialize(): Promise<void> {
    try {
      // Создаем папку для логов, если её нет
      // Поддерживаем как Unix (/), так и Windows (\) пути
      const lastSlash = Math.max(
        this.logFilePath.lastIndexOf("/"),
        this.logFilePath.lastIndexOf("\\")
      );
      const logDir = lastSlash > 0 ? this.logFilePath.substring(0, lastSlash) : "";
      if (logDir) {
        try {
          await Deno.mkdir(logDir, { recursive: true });
        } catch (e) {
          // Папка уже существует - это нормально
          if (!(e instanceof Deno.errors.AlreadyExists)) {
            throw e;
          }
        }
      }

      // Открываем файл для записи (append mode)
      this.logFile = await Deno.open(this.logFilePath, {
        create: true,
        append: true,
        write: true,
      });
    } catch (error) {
      console.error(`[${this.prefix}] Ошибка при инициализации логгера:`, error);
      // Продолжаем работу без записи в файл
      this.logFile = null;
    }
  }

  /**
   * Закрывает файл лога
   */
  async close(): Promise<void> {
    if (this.logFile) {
      try {
        this.logFile.close();
      } catch (error) {
        console.error(`[${this.prefix}] Ошибка при закрытии файла лога:`, error);
      }
      this.logFile = null;
    }
  }

  /**
   * Записывает сообщение в файл и stdout
   */
  private async writeLog(level: string, message: string, ...args: unknown[]): Promise<void> {
    const formattedMessage = formatLogMessageWithTimestamp(level, this.prefix, message, ...args);
    const line = `${formattedMessage}\n`;

    // Записываем в stdout
    console.log(formattedMessage);

    // Записываем в файл
    if (this.logFile) {
      try {
        const encoder = new TextEncoder();
        await this.logFile.write(encoder.encode(line));
        // Сбрасываем буфер, чтобы данные сразу записались
        await this.logFile.sync();
      } catch (error) {
        // Если ошибка записи в файл, просто логируем в stdout
        console.error(`[${this.prefix}] Ошибка при записи в файл лога:`, error);
      }
    }
  }

  /**
   * Синхронные версии методов для реализации Logger
   * (используют async внутри, но не блокируют)
   */
  debug(message: string, ...args: unknown[]): void {
    if (this.minLevel <= LogLevel.DEBUG) {
      this.writeLog("DEBUG", message, ...args).catch(() => {});
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.minLevel <= LogLevel.INFO) {
      this.writeLog("INFO", message, ...args).catch(() => {});
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.minLevel <= LogLevel.WARN) {
      this.writeLog("WARN", message, ...args).catch(() => {});
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.minLevel <= LogLevel.ERROR) {
      this.writeLog("ERROR", message, ...args).catch(() => {});
    }
  }

}

/**
 * Глобальный экземпляр логгера
 */
let globalLogger: FileLogger | null = null;

/**
 * Инициализирует глобальный логгер
 */
export async function initializeLogger(
  logFilePath?: string,
  minLevel?: LogLevel,
  prefix?: string
): Promise<FileLogger> {
  if (!globalLogger) {
    globalLogger = new FileLogger(logFilePath, minLevel, prefix);
    await globalLogger.initialize();
  }
  return globalLogger;
}

/**
 * Получает глобальный логгер (создает новый, если не инициализирован)
 */
export function getLogger(): FileLogger {
  if (!globalLogger) {
    globalLogger = new FileLogger();
    // Инициализируем асинхронно, но не ждем
    globalLogger.initialize().catch(() => {});
  }
  return globalLogger;
}

/**
 * Закрывает глобальный логгер
 */
export async function closeLogger(): Promise<void> {
  if (globalLogger) {
    await globalLogger.close();
    globalLogger = null;
  }
}

