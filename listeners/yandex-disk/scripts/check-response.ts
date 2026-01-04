/**
 * Скрипт для проверки ответа от LISTENER
 * 
 * Проверяет наличие файла ответа (.resp) или ошибки (.error) для запроса
 */

import { YandexDiskProvider } from "@src/storage-provider/index.ts";
import { ProtocolPaths } from "@shared/protocol/paths.ts";
import { parseRequestId } from "@shared/protocol/utils.ts";

/**
 * Проверяет ответ для указанного requestId
 */
async function checkResponse(
  token: string,
  requestId: string,
  responsesFolder: string = ".mysogatone/responses",
  maxWaitTime: number = 15000,
  checkInterval: number = 1000,
  showFull: boolean = false
): Promise<void> {
  const provider = new YandexDiskProvider(token);
  const protocolPaths = new ProtocolPaths("requests", responsesFolder);

  const responsePath = protocolPaths.response(requestId);
  const errorPath = protocolPaths.error(requestId);

  console.log(`🔍 Проверка ответа для запроса: ${requestId}`);
  console.log(`📁 Путь к ответу: ${responsePath}`);
  console.log(`📁 Путь к ошибке: ${errorPath}`);
  console.log(`⏱️  Максимальное время ожидания: ${maxWaitTime}ms`);
  console.log(`\n⏳ Ожидание ответа...`);

  const startTime = Date.now();
  let attempts = 0;

  while (Date.now() - startTime < maxWaitTime) {
    attempts++;
    const elapsed = Date.now() - startTime;

    try {
      // Проверяем наличие файла ответа
      try {
        const responseData = await provider.downloadFile(responsePath);
        console.log(`\n✅ Ответ получен!`);
        console.log(`📦 Размер ответа: ${responseData.length} байт`);
        console.log(`⏱️  Время обработки: ${elapsed}ms`);
        console.log(`🔄 Попыток проверки: ${attempts}`);
        
        // Показываем ответ (полный или превью)
        const text = new TextDecoder().decode(responseData);
        
        if (showFull) {
          console.log(`\n📄 Полный ответ:`);
          console.log("=".repeat(80));
          console.log(text);
          console.log("=".repeat(80));
        } else {
          // Показываем первые 500 байт ответа
          const preview = responseData.slice(0, 500);
          const previewText = new TextDecoder().decode(preview);
          console.log(`\n📄 Превью ответа (первые 500 байт):`);
          console.log("─".repeat(50));
          console.log(previewText);
          if (responseData.length > 500) {
            console.log(`... (еще ${responseData.length - 500} байт)`);
            console.log(`💡 Используйте --full для просмотра полного ответа`);
          }
          console.log("─".repeat(50));
        }
        return;
      } catch (_error) {
        // Файл ответа не найден, проверяем ошибку
      }

      // Проверяем наличие файла ошибки
      try {
        const errorData = await provider.downloadFile(errorPath);
        const errorText = new TextDecoder().decode(errorData);
        const error = JSON.parse(errorText);
        
        console.log(`\n❌ Получена ошибка:`);
        console.log(`📋 RequestId: ${error.requestId}`);
        console.log(`🔴 Код ошибки: ${error.code}`);
        console.log(`📝 Сообщение: ${error.error}`);
        console.log(`⏱️  Время обработки: ${elapsed}ms`);
        return;
      } catch (_error) {
        // Файл ошибки тоже не найден
      }

      // Оба файла отсутствуют, продолжаем ожидание
      if (attempts % 5 === 0) {
        console.log(`   ... проверка ${attempts} (${elapsed}ms прошло)`);
      }
    } catch (error) {
      console.error(`⚠️  Ошибка при проверке:`, error);
    }

    await new Promise((resolve) => setTimeout(resolve, checkInterval));
  }

  console.log(`\n⏱️  Таймаут ожидания ответа (${maxWaitTime}ms)`);
  console.log(`💡 Проверьте:`);
  console.log(`   1. Запущен ли LISTENER`);
  console.log(`   2. Правильно ли указан requestId`);
  console.log(`   3. Есть ли доступ к целевому серверу`);
}

/**
 * Основная функция
 */
async function main(): Promise<void> {
  const args = Deno.args;
  const token = Deno.env.get("YANDEX_DISK_TOKEN") || args[0];
  const requestId = args[1];
  
  // Фильтруем флаги из аргументов
  const nonFlagArgs = args.filter(arg => !arg.startsWith("--") && !arg.startsWith("-"));

  if (!token) {
    console.error("❌ Ошибка: требуется OAuth токен");
    console.error("\nИспользование:");
    console.error("  deno run --allow-net --allow-env scripts/check-response.ts [TOKEN] [REQUEST_ID]");
    Deno.exit(1);
  }

  if (!requestId) {
    console.error("❌ Ошибка: требуется requestId");
    console.error("\nИспользование:");
    console.error("  deno run --allow-net --allow-env scripts/check-response.ts [TOKEN] [REQUEST_ID]");
    console.error("\nПример:");
    console.error("  deno run --allow-net --allow-env scripts/check-response.ts YOUR_TOKEN 550e8400-e29b-41d4-a716-446655440000");
    Deno.exit(1);
  }

  // Валидация requestId
  if (!parseRequestId(`${requestId}.req`)) {
    console.error(`❌ Ошибка: неверный формат requestId: ${requestId}`);
    console.error("   RequestId должен быть в формате UUID v4");
    Deno.exit(1);
  }

  const responsesFolder = nonFlagArgs[2] || ".mysogatone/responses";
  const maxWaitTime = parseInt(nonFlagArgs[3] || "3000", 10);
  const showFull = args.includes("--full") || args.includes("-f");

  try {
    await checkResponse(token, requestId, responsesFolder, maxWaitTime, 1000, showFull);
  } catch (error) {
    console.error("❌ Критическая ошибка:", error);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}

