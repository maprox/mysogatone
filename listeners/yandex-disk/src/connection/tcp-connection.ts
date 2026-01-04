/**
 * TCP/TLS соединение с таймаутом
 */

/**
 * Устанавливает TCP соединение с таймаутом
 *
 * ВАЖНО: Для прокси-сервера ВСЕГДА используется обычное TCP соединение,
 * даже для порта 443 (HTTPS). TLS handshake выполняет клиент (браузер, curl),
 * а прокси просто передает байты между клиентом и сервером.
 *
 * Если прокси сам устанавливает TLS соединение, то получается двойной TLS:
 * - Клиент отправляет TLS ClientHello через прокси
 * - Прокси пытается установить свое TLS соединение
 * - Сервер получает TLS ClientHello через TLS туннель - это неправильно!
 */
export async function connectWithTimeout(
  hostname: string,
  port: number,
  timeout: number,
): Promise<Deno.TcpConn> {
  // Для прокси-сервера ВСЕГДА используется обычное TCP соединение
  // TLS handshake делает клиент, прокси просто передает байты
  const connectPromise = Deno.connect({ hostname, port });

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Connection timeout after ${timeout}ms`));
    }, timeout);
  });

  const conn = await Promise.race([connectPromise, timeoutPromise]);

  // Отключаем алгоритм Nagle для немедленной отправки данных (критично для TLS)
  conn.setNoDelay(true);
  console.log(
    `[connectWithTimeout] ✅ TCP_NODELAY установлен для ${hostname}:${port}`,
  );

  return conn;
}
