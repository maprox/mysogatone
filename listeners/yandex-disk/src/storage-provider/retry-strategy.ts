/**
 * Стратегия retry для HTTP запросов
 */

import { YandexDiskApiError } from "./errors.ts";
import type { RetryConfig } from "./types.ts";
import { sleep, calculateDelay } from "./utils.ts";

/**
 * Проверка, нужно ли делать retry для ошибки
 */
export function shouldRetry(
  error: Error,
  attempt: number,
  maxRetries: number
): boolean {
  if (attempt >= maxRetries) {
    return false;
  }
  
  // Не делаем retry для критических ошибок
  if (error instanceof YandexDiskApiError) {
    // 401 - неавторизован, 403 - запрещено - не retry
    if (error.statusCode === 401 || error.statusCode === 403) {
      return false;
    }
    // 404 - файл не найден - это нормально, не retry (будет обработано через polling)
    if (error.statusCode === 404) {
      return false;
    }
  }
  
  // Retry для остальных ошибок (500, 502, 503, network errors и т.д.)
  return true;
}

/**
 * Выполнение одного HTTP запроса
 */
export async function executeRequest(
  url: string,
  options: RequestInit
): Promise<Response> {
  try {
    const response = await fetch(url, options);
    return response;
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}

/**
 * Выполнение запроса с retry логикой
 */
export async function executeWithRetryLogic(
  url: string,
  options: RequestInit,
  config: RetryConfig,
  handleRateLimitFn: (
    response: Response,
    attempt: number,
    delay: number,
    config: RetryConfig
  ) => Promise<number | null>,
  parseApiErrorFn: (response: Response) => Promise<YandexDiskApiError>
): Promise<Response> {
  let lastError: Error | null = null;
  let delay = config.initialDelayMs;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const response = await executeRequest(url, options);

      // Успешный ответ
      if (response.ok) {
        return response;
      }

      // Обработка rate limit (429)
      if (response.status === 429) {
        const newDelay = await handleRateLimitFn(
          response,
          attempt,
          delay,
          config
        );
        if (newDelay !== null) {
          delay = newDelay;
          continue;
        }
      }

      // Парсим ошибку для других статусов
      throw await parseApiErrorFn(response);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Если не нужно делать retry, выбрасываем ошибку
      if (!shouldRetry(lastError, attempt, config.maxRetries)) {
        throw lastError;
      }

      // Retry с exponential backoff
      if (config.maxRetries > 0) {
        const errorMessage = lastError instanceof YandexDiskApiError
          ? `Status ${lastError.statusCode}: ${lastError.message}`
          : lastError.message || String(lastError);
        console.warn(
          `Request failed: ${errorMessage}. Retrying after ${delay}ms (attempt ${attempt + 1}/${config.maxRetries})`
        );
        await sleep(delay);
        delay = calculateDelay(delay, null, config);
      } else {
        // Если maxRetries = 0, не делаем retry
        throw lastError;
      }
    }
  }

  const finalError = lastError || new Error("Request failed after all retries");
  const errorMessage = finalError instanceof YandexDiskApiError
    ? `Status ${finalError.statusCode}: ${finalError.message}`
    : finalError.message || String(finalError);
  console.error(`Request failed after all retries: ${errorMessage}`);
  throw finalError;
}

