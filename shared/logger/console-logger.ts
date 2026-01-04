/**
 * Простая реализация Logger на основе console
 */

import type { Logger } from "./types.ts";
import { formatLogMessage } from "./utils.ts";

/**
 * Простая реализация Logger на основе console
 */
export class ConsoleLoggerAdapter implements Logger {
  private prefix: string;

  constructor(prefix: string = "") {
    this.prefix = prefix;
  }

  debug(message: string, ...args: unknown[]): void {
    console.log(formatLogMessage("DEBUG", this.prefix, message, ...args));
  }

  info(message: string, ...args: unknown[]): void {
    console.log(formatLogMessage("INFO", this.prefix, message, ...args));
  }

  warn(message: string, ...args: unknown[]): void {
    console.warn(formatLogMessage("WARN", this.prefix, message, ...args));
  }

  error(message: string, ...args: unknown[]): void {
    console.error(formatLogMessage("ERROR", this.prefix, message, ...args));
  }
}

