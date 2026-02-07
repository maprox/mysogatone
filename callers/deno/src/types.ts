/**
 * Абстрактный интерфейс для обработки подключений к целевому серверу.
 * Позволяет реализовать кастомную логику вместо стандартного TCP соединения.
 */

/**
 * Интерфейс ConnectionHandler для установки соединений с целевым сервером.
 */
export interface ConnectionHandler {
  /**
   * Устанавливает соединение с целевым сервером.
   *
   * @param targetAddress IP адрес или доменное имя целевого сервера
   * @param targetPort Порт целевого сервера
   * @returns Promise с парами (reader, writer) для передачи данных
   * @throws Error если не удалось установить соединение
   */
  connect(
    targetAddress: string,
    targetPort: number,
  ): Promise<
    {
      reader: ReadableStreamDefaultReader<Uint8Array>;
      writer: WritableStreamDefaultWriter<Uint8Array>;
    }
  >;
}
