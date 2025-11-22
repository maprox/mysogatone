/**
 * Чтение ответа от TCP соединения
 */

/**
 * Читает ответ от соединения с таймаутом
 */
export async function readResponse(
  conn: Deno.TcpConn,
  readTimeout: number = 5000
): Promise<Uint8Array> {
  const buffer = new Uint8Array(4096);
  const chunks: Uint8Array[] = [];
  let lastReadTime = Date.now();
  
  // Читаем данные до закрытия соединения или таймаута
  while (true) {
    // Проверяем таймаут: если прошло больше времени с последнего чтения, завершаем
    if (Date.now() - lastReadTime > readTimeout) {
      console.log(`[readResponse] Таймаут чтения (${readTimeout}ms), завершаем чтение`);
      break;
    }
    
    // Пытаемся прочитать данные с небольшим таймаутом
    try {
      const readPromise = conn.read(buffer);
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 1000); // Проверяем каждую секунду
      });
      
      const result = await Promise.race([readPromise, timeoutPromise]);
      
      if (result === null) {
        // Таймаут чтения, проверяем, есть ли уже данные
        if (chunks.length > 0) {
          console.log(`[readResponse] Таймаут чтения, но есть данные (${chunks.length} чанков), завершаем`);
          break;
        }
        continue;
      }
      
      const bytesRead = result;
      if (bytesRead === null) {
        // Соединение закрыто
        console.log(`[readResponse] Соединение закрыто сервером`);
        break;
      }
      
      if (bytesRead > 0) {
        chunks.push(buffer.slice(0, bytesRead));
        lastReadTime = Date.now();
        console.log(`[readResponse] Прочитано ${bytesRead} байт, всего чанков: ${chunks.length}`);
      }
    } catch (error) {
      console.log(`[readResponse] Ошибка при чтении: ${error}`);
      break;
    }
  }
  
  // Объединяем все чанки
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  console.log(`[readResponse] Всего прочитано: ${totalLength} байт из ${chunks.length} чанков`);
  
  if (totalLength === 0) {
    throw new Error("No data received from server");
  }
  
  const responseData = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    responseData.set(chunk, offset);
    offset += chunk.length;
  }
  
  return responseData;
}

