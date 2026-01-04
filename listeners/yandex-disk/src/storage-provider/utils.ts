/**
 * Утилиты для работы с путями и задержками
 */

import type { RetryConfig } from "@src/storage-provider/types.ts";

/**
 * Нормализует путь (убирает ведущий слэш, если есть)
 */
export function normalizePath(path: string): string {
  return path.startsWith("/") ? path.slice(1) : path;
}

/**
 * Строит URL для API запроса с параметрами
 */
export function buildApiUrl(
  baseUrl: string,
  endpoint: string,
  params: Record<string, string>,
): string {
  const queryString = Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join("&");
  return `${baseUrl}${endpoint}?${queryString}`;
}

/**
 * Утилита для задержки
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Вычисляет задержку для retry с учетом exponential backoff
 */
export function calculateDelay(
  currentDelay: number,
  retryAfter: string | null,
  config: RetryConfig,
): number {
  if (retryAfter) {
    return parseInt(retryAfter) * 1000;
  }
  return Math.min(
    currentDelay * config.backoffMultiplier,
    config.maxDelayMs,
  );
}
