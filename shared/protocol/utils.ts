/**
 * Утилиты для работы с протоколом передачи TCP данных через файлы
 */

/**
 * Генерирует уникальный идентификатор запроса (UUID v4)
 */
export function generateRequestId(): string {
  // Используем crypto.randomUUID() если доступно, иначе fallback
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback для старых окружений
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
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

