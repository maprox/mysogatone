/**
 * Типы для создания запросов
 */

/**
 * Параметры для создания метаданных запроса
 */
export interface CreateRequestMetadataParams {
  requestId: string;
  targetAddress: string;
  targetPort: number;
  sessionId?: string;
  isFirstInSession?: boolean;
  keepSessionAlive?: boolean;
}
