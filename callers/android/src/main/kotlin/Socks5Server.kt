import java.net.ServerSocket

/**
 * SOCKS5 сервер.
 * Принимает входящие соединения и обрабатывает их через Socks5Handler.
 */
class Socks5Server(
    private val port: Int = 1080,
    private val connectionHandler: ConnectionHandler
) {
    private var serverSocket: ServerSocket? = null
    private var running = false
    
    /**
     * Запускает сервер и начинает принимать соединения.
     */
    fun start() {
        serverSocket = ServerSocket(port)
        running = true
        println("SOCKS5 сервер запущен на порту $port")
        
        while (running) {
            try {
                val clientSocket = serverSocket!!.accept()
                println("Новое подключение от ${clientSocket.remoteSocketAddress}")
                
                // Запускаем обработчик в отдельном потоке
                val handler = Socks5Handler(clientSocket, connectionHandler)
                Thread(handler).start()
            } catch (e: Exception) {
                if (running) {
                    e.printStackTrace()
                }
            }
        }
    }
    
    /**
     * Останавливает сервер.
     */
    fun stop() {
        running = false
        try {
            serverSocket?.close()
        } catch (e: Exception) {
            e.printStackTrace()
        }
        println("SOCKS5 сервер остановлен")
    }
}

/**
 * Точка входа в приложение.
 */
fun main() {
    // Создаем сервер с DefaultConnectionHandler для тестирования
    val server = Socks5Server(1080, DefaultConnectionHandler())
    
    // Обработка сигнала завершения
    Runtime.getRuntime().addShutdownHook(Thread {
        server.stop()
    })
    
    // Запускаем сервер
    server.start()
}

