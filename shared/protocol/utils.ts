/**
 * Утилиты для работы с протоколом передачи TCP данных через файлы
 */

/**
 * Генерирует уникальный идентификатор запроса (UUID v4)
 */
export function generateRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Парсит requestId из имени файла
 */
export function parseRequestId(filename: string): string | null {
  // Извлекает UUID из имени файла вида "{requestId}.req" или "{requestId}.data"
  const match = filename.match(/^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\./i);
  return match ? match[1] : null;
}

/**
 * Проверяет, является ли файл файлом метаданных запроса
 */
export function isRequestMetadata(filename: string): boolean {
  return filename.endsWith(".req");
}

/**
 * Проверяет, является ли файл файлом данных запроса
 */
export function isRequestData(filename: string): boolean {
  return filename.endsWith(".data");
}

/**
 * Проверяет, является ли файл файлом ответа
 */
export function isResponse(filename: string): boolean {
  return filename.endsWith(".resp");
}

/**
 * Проверяет, является ли файл файлом ошибки
 */
export function isError(filename: string): boolean {
  return filename.endsWith(".error");
}

