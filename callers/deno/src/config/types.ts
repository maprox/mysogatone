/**
 * Типы для конфигурации приложения
 */

/**
 * Конфигурация приложения
 */
export interface AppConfig {
  /** Порт SOCKS5 сервера */
  port: number;
  /** Токен Yandex Disk */
  accessToken?: string;
  /** Папка для запросов */
  requestsFolder: string;
  /** Папка для ответов */
  responsesFolder: string;
  /** Интервал опроса (мс) */
  pollInterval: number;
  /** Таймаут ответа (мс) */
  responseTimeout: number;
  /** Использовать DirectConnectionHandler */
  useDirectHandler: boolean;
  /** Использовать DelayedConnectionHandler */
  useDelayedHandler: boolean;
  /** Путь к логу задержек */
  delayLogPath: string;
}

/**
 * Конфигурация задержек из переменных окружения
 */
export interface DelayEnvConfig {
  firstChunkDelay: number;
  chunkInterval: number;
  interChunkDelay: number;
  bytesPerDelay: number;
  bytesPerDelayInFirstBytes: number;
  firstBytesCount: number;
  byteDelayInFirstBytes: number;
  secondRoundMetadataDelay: number;
  secondRoundUploadDelay: number;
  roundDelay: number;
  nextRequestDelay: number;
  nextRequestMetadataDelay: number;
  nextRequestUploadDelay: number;
  simulateIdleConnection: boolean;
}
