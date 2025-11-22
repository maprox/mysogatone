#!/usr/bin/env -S deno run --allow-net --allow-read --allow-env

/**
 * Скрипт для получения OAuth токена Яндекс Диск
 * 
 * Использование:
 *   deno run --allow-net --allow-env scripts/get-token.ts CLIENT_ID
 * 
 * Или через переменную окружения:
 *   export YANDEX_CLIENT_ID=your_client_id
 *   deno run --allow-net --allow-env scripts/get-token.ts
 */

const CLIENT_ID = Deno.env.get("YANDEX_CLIENT_ID") || Deno.args[0];

if (!CLIENT_ID) {
  console.error("❌ Ошибка: Client ID не указан\n");
  console.error("Использование:");
  console.error("  deno run --allow-net --allow-env scripts/get-token.ts CLIENT_ID");
  console.error("\nИли через переменную окружения:");
  console.error("  export YANDEX_CLIENT_ID=your_client_id");
  console.error("  deno run --allow-net --allow-env scripts/get-token.ts");
  console.error("\n📖 Подробная инструкция: GETTING_TOKEN.md");
  Deno.exit(1);
}

console.log("🔐 Получение OAuth токена для Яндекс Диск API\n");

const authUrl = `https://oauth.yandex.ru/authorize?response_type=token&client_id=${CLIENT_ID}`;

console.log("📋 Инструкция:");
console.log("1. Откройте следующий URL в браузере:");
console.log(`\n   ${authUrl}\n`);
console.log("2. Войдите в свой аккаунт Яндекс (если потребуется)");
console.log("3. Разрешите доступ приложению к Яндекс Диску");
console.log("4. После перенаправления токен будет в URL в параметре 'access_token'");
console.log("5. Скопируйте токен и используйте его для проверки:");
console.log("\n   deno task health YOUR_TOKEN\n");
console.log("💡 Пример URL с токеном:");
console.log("   http://localhost:8080/oauth#access_token=AQAAAAA...&token_type=bearer\n");
console.log("⚠️  ВАЖНО: Не делитесь токеном и не коммитьте его в git!\n");

// Попытка открыть браузер автоматически (опционально)
try {
  const platform = Deno.build.os;
  let command: string;
  
  if (platform === "windows") {
    command = `start "" "${authUrl}"`;
  } else if (platform === "darwin") {
    command = `open "${authUrl}"`;
  } else {
    command = `xdg-open "${authUrl}"`;
  }
  
  console.log("🌐 Попытка открыть браузер автоматически...\n");
  await Deno.run({
    cmd: platform === "windows" ? ["cmd", "/c", command] : command.split(" "),
  }).status();
} catch {
  // Игнорируем ошибки, если не удалось открыть браузер
  console.log("💡 Скопируйте URL выше и откройте его вручную в браузере.\n");
}

