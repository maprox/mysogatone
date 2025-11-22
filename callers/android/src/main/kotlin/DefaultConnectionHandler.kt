import java.io.InputStream
import java.io.OutputStream
import java.net.Socket

/**
 * Базовая реализация ConnectionHandler для тестирования.
 * Использует стандартное TCP соединение с целевым сервером.
 */
class DefaultConnectionHandler : ConnectionHandler {
    override fun connect(targetAddress: String, targetPort: Int): Pair<InputStream, OutputStream> {
        val socket = Socket(targetAddress, targetPort)
        return Pair(socket.getInputStream(), socket.getOutputStream())
    }
}

