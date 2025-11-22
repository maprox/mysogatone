import java.io.InputStream
import java.io.OutputStream
import java.net.Socket

/**
 * Обработчик SOCKS5 протокола для одного клиента.
 */
class Socks5Handler(
    private val clientSocket: Socket,
    private val connectionHandler: ConnectionHandler
) : Runnable {
    
    companion object {
        // SOCKS5 константы
        private const val SOCKS_VERSION: Byte = 0x05
        private const val METHOD_NO_AUTH: Byte = 0x00
        private const val CMD_CONNECT: Byte = 0x01
        private const val ADDR_TYPE_IPV4: Byte = 0x01
        private const val ADDR_TYPE_DOMAIN: Byte = 0x03
        private const val REPLY_SUCCESS: Byte = 0x00
        private const val REPLY_GENERAL_FAILURE: Byte = 0x01
    }
    
    override fun run() {
        try {
            val input = clientSocket.getInputStream()
            val output = clientSocket.getOutputStream()
            
            // Этап 1: Handshake
            if (!handleHandshake(input, output)) {
                return
            }
            
            // Этап 2: Запрос на подключение
            val targetStreams = handleConnectRequest(input, output)
            if (targetStreams == null) {
                return
            }
            
            // Этап 3: Передача данных
            transferData(input, output, targetStreams.first, targetStreams.second)
            
        } catch (e: Exception) {
            e.printStackTrace()
        } finally {
            try {
                clientSocket.close()
            } catch (e: Exception) {
                // Игнорируем ошибки закрытия
            }
        }
    }
    
    /**
     * Обработка handshake (рукопожатия).
     * Клиент отправляет список методов аутентификации, сервер выбирает No Auth.
     */
    private fun handleHandshake(input: InputStream, output: OutputStream): Boolean {
        try {
            // Читаем версию SOCKS (1 байт)
            val version = input.read()
            if (version != SOCKS_VERSION.toInt()) {
                return false
            }
            
            // Читаем количество методов (1 байт)
            val numMethods = input.read()
            if (numMethods <= 0) {
                return false
            }
            
            // Читаем методы аутентификации
            val methods = ByteArray(numMethods)
            input.read(methods)
            
            // Проверяем наличие метода No Auth (0x00)
            val hasNoAuth = methods.contains(METHOD_NO_AUTH)
            if (!hasNoAuth) {
                // Отправляем ответ об отсутствии поддерживаемых методов
                output.write(byteArrayOf(SOCKS_VERSION, 0xFF.toByte()))
                output.flush()
                return false
            }
            
            // Отправляем ответ: версия SOCKS5, метод No Auth
            output.write(byteArrayOf(SOCKS_VERSION, METHOD_NO_AUTH))
            output.flush()
            
            return true
        } catch (e: Exception) {
            e.printStackTrace()
            return false
        }
    }
    
    /**
     * Обработка запроса на подключение (CONNECT).
     * Парсит адрес и порт целевого сервера и устанавливает соединение через ConnectionHandler.
     * Возвращает пару потоков (InputStream, OutputStream) для передачи данных или null при ошибке.
     */
    private fun handleConnectRequest(input: InputStream, output: OutputStream): Pair<InputStream, OutputStream>? {
        try {
            // Читаем версию SOCKS (1 байт)
            val version = input.read()
            if (version != SOCKS_VERSION.toInt()) {
                sendConnectReply(output, REPLY_GENERAL_FAILURE, "0.0.0.0", 0)
                return null
            }
            
            // Читаем команду (1 байт)
            val command = input.read()
            if (command != CMD_CONNECT.toInt()) {
                sendConnectReply(output, REPLY_GENERAL_FAILURE, "0.0.0.0", 0)
                return null
            }
            
            // Резервный байт (1 байт)
            input.read()
            
            // Читаем тип адреса (1 байт)
            val addressType = input.read()
            
            val targetAddress: String
            val targetPort: Int
            
            when (addressType) {
                ADDR_TYPE_IPV4.toInt() -> {
                    // IPv4 адрес (4 байта)
                    val ipBytes = ByteArray(4)
                    input.read(ipBytes)
                    targetAddress = "${ipBytes[0].toInt() and 0xFF}.${ipBytes[1].toInt() and 0xFF}.${ipBytes[2].toInt() and 0xFF}.${ipBytes[3].toInt() and 0xFF}"
                }
                ADDR_TYPE_DOMAIN.toInt() -> {
                    // Доменное имя
                    val domainLength = input.read()
                    val domainBytes = ByteArray(domainLength)
                    input.read(domainBytes)
                    targetAddress = String(domainBytes)
                }
                else -> {
                    sendConnectReply(output, REPLY_GENERAL_FAILURE, "0.0.0.0", 0)
                    return null
                }
            }
            
            // Читаем порт (2 байта, big-endian)
            val portByte1 = input.read()
            val portByte2 = input.read()
            targetPort = (portByte1 shl 8) or portByte2
            
            // Устанавливаем соединение через ConnectionHandler
            val (targetInput, targetOutput) = try {
                connectionHandler.connect(targetAddress, targetPort)
            } catch (e: Exception) {
                e.printStackTrace()
                sendConnectReply(output, REPLY_GENERAL_FAILURE, "0.0.0.0", 0)
                return null
            }
            
            // Отправляем успешный ответ
            // Используем адрес клиента для ответа
            val clientAddress = clientSocket.localAddress.hostAddress ?: "0.0.0.0"
            val clientPort = clientSocket.localPort
            sendConnectReply(output, REPLY_SUCCESS, clientAddress, clientPort)
            
            // Возвращаем потоки для передачи данных
            return Pair(targetInput, targetOutput)
            
        } catch (e: Exception) {
            e.printStackTrace()
            try {
                sendConnectReply(output, REPLY_GENERAL_FAILURE, "0.0.0.0", 0)
            } catch (ex: Exception) {
                // Игнорируем ошибки отправки ответа
            }
            return null
        }
    }
    
    /**
     * Отправка ответа на запрос подключения.
     */
    private fun sendConnectReply(output: OutputStream, replyCode: Byte, address: String, port: Int) {
        val addressBytes = address.split(".").map { it.toInt().toByte() }.toByteArray()
        val reply = byteArrayOf(
            SOCKS_VERSION,
            replyCode,
            0x00, // Резервный байт
            ADDR_TYPE_IPV4,
            addressBytes[0],
            addressBytes[1],
            addressBytes[2],
            addressBytes[3],
            ((port shr 8) and 0xFF).toByte(),
            (port and 0xFF).toByte()
        )
        output.write(reply)
        output.flush()
    }
    
    /**
     * Передача данных между клиентом и целевым сервером.
     */
    private fun transferData(
        clientInput: InputStream,
        clientOutput: OutputStream,
        targetInput: InputStream,
        targetOutput: OutputStream
    ) {
        // Запускаем два потока для двунаправленной передачи данных
        val clientToTarget = Thread {
            try {
                clientInput.copyTo(targetOutput)
            } catch (e: Exception) {
                // Соединение закрыто
            } finally {
                try {
                    targetOutput.close()
                } catch (e: Exception) {
                    // Игнорируем ошибки закрытия
                }
            }
        }
        
        val targetToClient = Thread {
            try {
                targetInput.copyTo(clientOutput)
            } catch (e: Exception) {
                // Соединение закрыто
            } finally {
                try {
                    clientOutput.close()
                } catch (e: Exception) {
                    // Игнорируем ошибки закрытия
                }
            }
        }
        
        clientToTarget.start()
        targetToClient.start()
        
        // Ждем завершения обоих потоков
        try {
            clientToTarget.join()
            targetToClient.join()
        } catch (e: Exception) {
            // Игнорируем ошибки
        }
    }
}

