/**
 * TCP соединение с таймаутом
 */

/**
 * Устанавливает TCP соединение с таймаутом
 */
export async function connectWithTimeout(
  hostname: string,
  port: number,
  timeout: number
): Promise<Deno.TcpConn> {
  const connectPromise = Deno.connect({ hostname, port });
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Connection timeout after ${timeout}ms`));
    }, timeout);
  });
  
  return await Promise.race([connectPromise, timeoutPromise]);
}

