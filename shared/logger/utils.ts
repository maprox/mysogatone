/**
 * Утилиты для форматирования логов
 */

/**
 * Форматирует аргументы сообщения в строку
 */
function formatArgs(...args: unknown[]): string {
  if (args.length === 0) {
    return "";
  }
  return ` ${args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ')}`;
}

/**
 * Форматирует сообщение лога с timestamp
 */
export function formatLogMessageWithTimestamp(
  level: string,
  prefix: string,
  message: string,
  ...args: unknown[]
): string {
  const timestamp = new Date().toISOString();
  const formattedMessage = message + formatArgs(...args);
  return `[${timestamp}] [${prefix}] [${level}] ${formattedMessage}`;
}

/**
 * Форматирует сообщение лога без timestamp
 */
export function formatLogMessage(
  level: string,
  prefix: string,
  message: string,
  ...args: unknown[]
): string {
  const prefixStr = prefix ? `[${prefix}] ` : "";
  const formattedMessage = message + formatArgs(...args);
  return `${prefixStr}[${level}] ${formattedMessage}`;
}

