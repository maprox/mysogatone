/**
 * Утилиты для LISTENER
 */

/**
 * Задержка на указанное количество миллисекунд
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

