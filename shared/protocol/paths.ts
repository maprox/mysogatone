/**
 * Пути к файлам протокола
 */

/**
 * Класс для генерации путей к файлам протокола
 */
export class ProtocolPaths {
  constructor(
    private requestsFolder: string = "requests",
    private responsesFolder: string = "responses"
  ) {}

  /**
   * Путь к файлу метаданных запроса
   */
  requestMetadata(requestId: string): string {
    return `${this.requestsFolder}/${requestId}.req`;
  }

  /**
   * Путь к файлу данных запроса
   */
  requestData(requestId: string): string {
    return `${this.requestsFolder}/${requestId}.data`;
  }

  /**
   * Путь к файлу чанка данных запроса
   */
  requestDataChunk(requestId: string, chunkIndex: number): string {
    return `${this.requestsFolder}/${requestId}.chunk.${chunkIndex}`;
  }

  /**
   * Путь к файлу-маркеру готовности данных (создается когда все чанки загружены)
   */
  requestDataReady(requestId: string): string {
    return `${this.requestsFolder}/${requestId}.ready`;
  }

  /**
   * Путь к файлу ответа
   */
  response(requestId: string): string {
    return `${this.responsesFolder}/${requestId}.resp`;
  }

  /**
   * Путь к файлу ошибки
   */
  error(requestId: string): string {
    return `${this.responsesFolder}/${requestId}.error`;
  }
}

