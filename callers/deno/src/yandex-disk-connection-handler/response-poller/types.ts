/**
 * Типы для polling ответов
 */

/**
 * Callback для обработки успешного ответа
 */
export type ResponseCallback = (data: Uint8Array) => void | Promise<void>;

/**
 * Callback для обработки ошибки
 */
export type ErrorCallback = (error: Error) => void;
