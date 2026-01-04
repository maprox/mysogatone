/**
 * Конфигурация LISTENER
 */

/**
 * Конфигурация LISTENER
 */
export interface ListenerConfig {
  /** OAuth токен для Яндекс Диск API */
  accessToken: string;
  /** Папка для мониторинга запросов */
  requestsFolder: string;
  /** Папка для записи ответов */
  responsesFolder: string;
  /** Интервал polling в миллисекундах */
  pollInterval: number;
  /** Таймаут подключения к GOAL в миллисекундах */
  connectionTimeout: number;
}

/**
 * Параметры ожидания файла данных
 */
export interface WaitForDataFileOptions {
  /** Максимальное время ожидания в миллисекундах */
  maxWaitTime?: number;
  /** Интервал проверки в миллисекундах */
  checkInterval?: number;
}

/**
 * Получает конфигурацию из переменных окружения
 */
export function getConfigFromEnv(): ListenerConfig {
  const accessToken = Deno.env.get("YANDEX_DISK_TOKEN");
  if (!accessToken) {
    throw new Error(
      "YANDEX_DISK_TOKEN environment variable is required. " +
        "Set it with: export YANDEX_DISK_TOKEN=your_token",
    );
  }

  return {
    accessToken,
    requestsFolder: Deno.env.get("REQUESTS_FOLDER") || ".mysogatone/requests",
    responsesFolder: Deno.env.get("RESPONSES_FOLDER") ||
      ".mysogatone/responses",
    pollInterval: parseInt(
      Deno.env.get("POLL_INTERVAL_MS") || "2000",
      10,
    ),
    connectionTimeout: parseInt(
      Deno.env.get("CONNECTION_TIMEOUT_MS") || "10000",
      10,
    ),
  };
}
