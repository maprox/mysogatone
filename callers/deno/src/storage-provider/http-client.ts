/**
 * HTTP клиент с поддержкой retry и обработки ошибок
 */

import { YandexDiskApiError } from "@src/storage-provider/errors.ts";
import type { RetryConfig } from "@src/storage-provider/types.ts";
import { calculateDelay, sleep } from "@src/storage-provider/utils.ts";

/**
 * Создание заголовков запроса с авторизацией
 */
export function createAuthHeaders(accessToken: string): Headers {
  const headers = new Headers();
  headers.set("Authorization", `OAuth ${accessToken}`);
  headers.set("Accept", "application/json");
  return headers;
}

/**
 * Парсинг ошибки из ответа API
 */
export async function parseApiError(
  response: Response,
): Promise<YandexDiskApiError> {
  let errorMessage = `API request failed with status ${response.status}`;
  let errorCode: string | undefined;

  // Клонируем response для чтения, так как body можно прочитать только один раз
  const clonedResponse = response.clone();

  try {
    const errorData = await clonedResponse.json();
    if (errorData.error) {
      errorMessage = errorData.error;
    }
    if (errorData.error_description) {
      errorMessage += `: ${errorData.error_description}`;
    }
    if (errorData.code) {
      errorCode = errorData.code;
    }
  } catch {
    // Если JSON невалиден, пытаемся прочитать как текст
    // Используем оригинальный response, так как clonedResponse уже был использован
    try {
      const textResponse = response.clone();
      const text = await textResponse.text();
      if (text) {
        errorMessage = text;
      }
    } catch {
      // Если и текст не удалось прочитать, используем дефолтное сообщение
    }
  }

  return new YandexDiskApiError(errorMessage, response.status, errorCode);
}

/**
 * Обработка rate limit (429)
 */
export async function handleRateLimit(
  response: Response,
  attempt: number,
  delay: number,
  config: RetryConfig,
): Promise<number | null> {
  if (response.status !== 429 || attempt >= config.maxRetries) {
    return null;
  }

  const retryAfter = response.headers.get("Retry-After");
  const newDelay = calculateDelay(delay, retryAfter, config);

  console.warn(
    `Rate limit exceeded. Retrying after ${newDelay}ms (attempt ${
      attempt + 1
    }/${config.maxRetries})`,
  );

  await sleep(newDelay);
  return newDelay;
}

/**
 * Выполнение одного HTTP запроса
 */
export async function executeRequest(
  url: string,
  options: RequestInit,
): Promise<Response> {
  try {
    const response = await fetch(url, options);
    return response;
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}

/**
 * Проверка, нужно ли делать retry для ошибки
 */
export function shouldRetry(
  error: Error,
  attempt: number,
  maxRetries: number,
): boolean {
  if (attempt >= maxRetries) {
    return false;
  }
  // Retry для всех ошибок кроме некоторых критических
  return error instanceof YandexDiskApiError && error.statusCode !== 401 &&
    error.statusCode !== 403;
}

/**
 * Выполнение запроса с retry логикой
 */
export async function executeWithRetry(
  url: string,
  options: RequestInit,
  config: RetryConfig,
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
        const newDelay = await handleRateLimit(
          response,
          attempt,
          delay,
          config,
        );
        if (newDelay !== null) {
          delay = newDelay;
          continue;
        }
      }

      // Парсим ошибку для других статусов
      throw await parseApiError(response);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Если не нужно делать retry, выбрасываем ошибку
      if (!shouldRetry(lastError, attempt, config.maxRetries)) {
        throw lastError;
      }

      // Retry с exponential backoff
      console.warn(
        `Request failed. Retrying after ${delay}ms (attempt ${
          attempt + 1
        }/${config.maxRetries})`,
      );
      await sleep(delay);
      delay = calculateDelay(delay, null, config);
    }
  }

  throw lastError || new Error("Request failed after all retries");
}
