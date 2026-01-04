/**
 * Реализация Logger на основе общего логгера из shared/logger
 */

import type { Logger } from "./types.ts";
import { FileLogger, getLogger } from "./file-logger.ts";

/**
 * Реализация Logger на основе общего логгера из shared/logger
 */
export class SharedLoggerAdapter implements Logger {
  private logger: FileLogger;

  constructor(logger?: FileLogger) {
    this.logger = logger ?? getLogger();
  }

  debug(message: string, ...args: unknown[]): void {
    this.logger.debug(message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.logger.info(message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.logger.warn(message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.logger.error(message, ...args);
  }
}

