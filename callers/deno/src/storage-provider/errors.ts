/**
 * Ошибки API Яндекс Диска
 */

/**
 * Ошибка API Яндекс Диска
 */
export class YandexDiskApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string
  ) {
    super(message);
    this.name = "YandexDiskApiError";
  }
}

