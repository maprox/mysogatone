/**
 * HTTP клиент с поддержкой retry и обработки ошибок
 */

import { YandexDiskApiError } from "@src/storage-provider/errors.ts";
import { handleRateLimit } from "@src/storage-provider/rate-limit-handler.ts";
import { executeWithRetryLogic } from "@src/storage-provider/retry-strategy.ts";
import type { RetryConfig } from "@src/storage-provider/types.ts";

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
 * Выполнение запроса с retry логикой
 */
export async function executeWithRetry(
  url: string,
  options: RequestInit,
  config: RetryConfig,
): Promise<Response> {
  return await executeWithRetryLogic(
    url,
    options,
    config,
    handleRateLimit,
    parseApiError,
  );
}
