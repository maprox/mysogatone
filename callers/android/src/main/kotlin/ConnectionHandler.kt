import java.io.InputStream
import java.io.OutputStream

/**
 * Абстрактный интерфейс для обработки подключений к целевому серверу.
 * Позволяет реализовать кастомную логику вместо стандартного TCP соединения.
 */
interface ConnectionHandler {
    /**
     * Устанавливает соединение с целевым сервером.
     * 
     * @param targetAddress IP адрес или доменное имя целевого сервера
     * @param targetPort Порт целевого сервера
     * @return Пара (InputStream, OutputStream) для передачи данных
     * @throws Exception если не удалось установить соединение
     */
    fun connect(targetAddress: String, targetPort: Int): Pair<InputStream, OutputStream>
}

