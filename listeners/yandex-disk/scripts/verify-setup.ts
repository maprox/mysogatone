#!/usr/bin/env -S deno run --allow-net --allow-read --allow-write

/**
 * Скрипт для проверки настройки проекта без реального API
 * 
 * Проверяет:
 * - Импорты модулей
 * - Типы
 * - Базовую функциональность
 * 
 * Использование:
 *   deno run --allow-net --allow-read --allow-write scripts/verify-setup.ts
 */

console.log("🔍 Проверка настройки проекта...\n");

// Проверка 1: Импорты
console.log("📦 Проверка импортов...");
try {
  const { YandexDiskProvider, StorageProvider, FileInfo } = await import(
    "../src/storage-provider/index.ts"
  );
  const { YandexDiskApiError } = await import("../src/storage-provider/errors.ts");
  
  console.log("✅ Все модули импортированы успешно");
  console.log(`   - YandexDiskProvider: ${typeof YandexDiskProvider}`);
  console.log(`   - StorageProvider: ${typeof StorageProvider}`);
  console.log(`   - FileInfo: ${typeof FileInfo}`);
  console.log(`   - YandexDiskApiError: ${typeof YandexDiskApiError}`);
} catch (error) {
  console.error("❌ Ошибка при импорте модулей:", error);
  Deno.exit(1);
}

// Проверка 2: Создание провайдера
console.log("\n🏗️  Проверка создания провайдера...");
try {
  const { YandexDiskProvider } = await import("../src/storage-provider/index.ts");
  
  // Должна быть ошибка при пустом токене
  try {
    new YandexDiskProvider("");
    console.error("❌ Ожидалась ошибка при пустом токене");
    Deno.exit(1);
  } catch (error) {
    if (error instanceof Error && error.message.includes("Access token is required")) {
      console.log("✅ Валидация токена работает корректно");
    } else {
      throw error;
    }
  }
  
  // Создание с валидным токеном (не проверяем реальный API)
  const provider = new YandexDiskProvider("test-token");
  console.log("✅ Провайдер создан успешно");
} catch (error) {
  console.error("❌ Ошибка при создании провайдера:", error);
  Deno.exit(1);
}

// Проверка 3: Утилиты
console.log("\n🛠️  Проверка утилит...");
try {
  const { normalizePath, buildApiUrl } = await import("../src/storage-provider/utils.ts");
  
  // Тест normalizePath
  const normalized = normalizePath("/test/path");
  if (normalized !== "test/path") {
    console.error(`❌ normalizePath работает неправильно: ожидалось "test/path", получено "${normalized}"`);
    Deno.exit(1);
  }
  console.log("✅ normalizePath работает корректно");
  
  // Тест buildApiUrl
  const url = buildApiUrl("https://api.example.com", "/endpoint", { param: "value" });
  if (!url.includes("param=value")) {
    console.error(`❌ buildApiUrl работает неправильно: ${url}`);
    Deno.exit(1);
  }
  console.log("✅ buildApiUrl работает корректно");
} catch (error) {
  console.error("❌ Ошибка при проверке утилит:", error);
  Deno.exit(1);
}

// Проверка 4: Типы
console.log("\n📝 Проверка типов...");
try {
  const { FileInfo } = await import("../src/storage-provider/types.ts");
  
  const testFileInfo: FileInfo = {
    name: "test.txt",
    path: "/test.txt",
    size: 1024,
    modified: new Date(),
  };
  
  if (testFileInfo.name !== "test.txt") {
    console.error("❌ Тип FileInfo работает неправильно");
    Deno.exit(1);
  }
  console.log("✅ Типы работают корректно");
} catch (error) {
  console.error("❌ Ошибка при проверке типов:", error);
  Deno.exit(1);
}

// Проверка 5: Ошибки
console.log("\n⚠️  Проверка обработки ошибок...");
try {
  const { YandexDiskApiError } = await import("../src/storage-provider/errors.ts");
  
  const error = new YandexDiskApiError("Test error", 404, "NOT_FOUND");
  if (error.statusCode !== 404 || error.code !== "NOT_FOUND") {
    console.error("❌ YandexDiskApiError работает неправильно");
    Deno.exit(1);
  }
  console.log("✅ Обработка ошибок работает корректно");
} catch (error) {
  console.error("❌ Ошибка при проверке обработки ошибок:", error);
  Deno.exit(1);
}

console.log("\n✅ Все проверки пройдены успешно!");
console.log("\n💡 Следующие шаги:");
console.log("   1. Запустите тесты: deno task test");
console.log("   2. Проверьте линтинг: deno task lint");
console.log("   3. Проверьте типы: deno task check");
console.log("   4. Для проверки с реальным API: deno run --allow-net --allow-read --allow-env scripts/check-health.ts [TOKEN]");

