#!/usr/bin/env -S deno run --allow-net --allow-read --allow-env

/**
 * Скрипт для проверки работоспособности YandexDiskProvider
 * 
 * Использование:
 *   deno run --allow-net --allow-read --allow-env scripts/check-health.ts [YANDEX_DISK_TOKEN]
 * 
 * Или через переменную окружения:
 *   export YANDEX_DISK_TOKEN=your_token
 *   deno run --allow-net --allow-read --allow-env scripts/check-health.ts
 */

import { YandexDiskProvider } from "../src/storage-provider/index.ts";
import { YandexDiskApiError } from "../src/storage-provider/errors.ts";

async function checkHealth(token: string): Promise<boolean> {
  console.log("🔍 Проверка работоспособности YandexDiskProvider...\n");

  try {
    const provider = new YandexDiskProvider(token);
    console.log("✅ Провайдер создан успешно");

    // Проверка 1: Получение списка файлов в корневой папке
    console.log("\n📋 Проверка: получение списка файлов...");
    try {
      const files = await provider.listFiles("/");
      console.log(`✅ Получен список файлов: ${files.length} элементов`);
      if (files.length > 0) {
        console.log(`   Первый файл: ${files[0].name}`);
      }
    } catch (error) {
      if (error instanceof YandexDiskApiError) {
        console.error(`❌ Ошибка при получении списка файлов: ${error.message} (${error.statusCode})`);
        return false;
      }
      throw error;
    }

    // Проверка 2: Создание тестового файла
    console.log("\n📤 Проверка: загрузка тестового файла...");
    const testFileName = `test-health-check-${Date.now()}.txt`;
    const testData = new TextEncoder().encode("Health check test file");
    
    try {
      await provider.uploadFile(`/${testFileName}`, testData);
      console.log(`✅ Файл загружен: ${testFileName}`);
    } catch (error) {
      if (error instanceof YandexDiskApiError) {
        console.error(`❌ Ошибка при загрузке файла: ${error.message} (${error.statusCode})`);
        return false;
      }
      throw error;
    }

    // Проверка 3: Скачивание тестового файла
    console.log("\n📥 Проверка: скачивание тестового файла...");
    try {
      const downloadedData = await provider.downloadFile(`/${testFileName}`);
      const downloadedText = new TextDecoder().decode(downloadedData);
      if (downloadedText === "Health check test file") {
        console.log("✅ Файл скачан успешно, содержимое совпадает");
      } else {
        console.error("❌ Содержимое файла не совпадает");
        return false;
      }
    } catch (error) {
      if (error instanceof YandexDiskApiError) {
        console.error(`❌ Ошибка при скачивании файла: ${error.message} (${error.statusCode})`);
        return false;
      }
      throw error;
    }

    // Проверка 4: Удаление тестового файла
    console.log("\n🗑️  Проверка: удаление тестового файла...");
    try {
      await provider.deleteFile(`/${testFileName}`);
      console.log("✅ Файл удален успешно");
    } catch (error) {
      if (error instanceof YandexDiskApiError) {
        console.error(`❌ Ошибка при удалении файла: ${error.message} (${error.statusCode})`);
        // Не критично, файл может быть уже удален
        console.log("   (Это не критично, файл может быть уже удален)");
      } else {
        throw error;
      }
    }

    console.log("\n✅ Все проверки пройдены успешно!");
    return true;
  } catch (error) {
    console.error("\n❌ Критическая ошибка:", error);
    return false;
  }
}

// Получение токена из аргументов или переменной окружения
const token = Deno.args[0] || Deno.env.get("YANDEX_DISK_TOKEN");

if (!token) {
  console.error("❌ Ошибка: Токен не указан");
  console.error("\nИспользование:");
  console.error("  deno run --allow-net --allow-read --allow-env scripts/check-health.ts [TOKEN]");
  console.error("\nИли через переменную окружения:");
  console.error("  export YANDEX_DISK_TOKEN=your_token");
  console.error("  deno run --allow-net --allow-read --allow-env scripts/check-health.ts");
  Deno.exit(1);
}

// Запуск проверки
const success = await checkHealth(token);
Deno.exit(success ? 0 : 1);

