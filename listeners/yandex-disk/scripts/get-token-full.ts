#!/usr/bin/env -S deno run --allow-net --allow-read --allow-env

/**
 * Полный скрипт для получения токена через Client ID и Client Secret
 * 
 * Использование:
 *   deno run --allow-net --allow-env scripts/get-token-full.ts CLIENT_ID CLIENT_SECRET
 * 
 * Или через переменные окружения:
 *   export YANDEX_CLIENT_ID=your_client_id
 *   export YANDEX_CLIENT_SECRET=your_client_secret
 *   deno run --allow-net --allow-env scripts/get-token-full.ts
 */

const CLIENT_ID = Deno.env.get("YANDEX_CLIENT_ID") || Deno.args[0];
const CLIENT_SECRET = Deno.env.get("YANDEX_CLIENT_SECRET") || Deno.args[1];

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("❌ Ошибка: Client ID и Client Secret не указаны\n");
  console.error("Использование:");
  console.error("  deno run --allow-net --allow-env scripts/get-token-full.ts CLIENT_ID CLIENT_SECRET");
  console.error("\nИли через переменные окружения:");
  console.error("  export YANDEX_CLIENT_ID=your_client_id");
  console.error("  export YANDEX_CLIENT_SECRET=your_client_secret");
  console.error("  deno run --allow-net --allow-env scripts/get-token-full.ts");
  Deno.exit(1);
}

console.log("🔐 Получение токена через OAuth flow...\n");

// Шаг 1: Получаем код авторизации
const authUrl = `https://oauth.yandex.ru/authorize?response_type=code&client_id=${CLIENT_ID}`;

console.log("📋 Шаг 1: Откройте этот URL в браузере:");
console.log(`\n   ${authUrl}\n`);
console.log("После авторизации вы будете перенаправлены на callback URL.");
console.log("Скопируйте код из параметра 'code' в URL.\n");
console.log("Пример URL после перенаправления:");
console.log("   http://localhost:8080/oauth?code=YOUR_AUTHORIZATION_CODE\n");

// Попытка открыть браузер
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
  
  console.log("🌐 Открываю браузер...\n");
  await Deno.run({
    cmd: platform === "windows" ? ["cmd", "/c", command] : command.split(" "),
  }).status();
} catch {
  console.log("💡 Скопируйте URL выше и откройте его вручную.\n");
}

// Ждем ввода кода авторизации
console.log("⏳ Введите код авторизации из URL (или нажмите Enter для выхода):");
const decoder = new TextDecoder();
const buffer = new Uint8Array(1024);
const n = await Deno.stdin.read(buffer);
if (!n || n === 0) {
  console.log("\n❌ Код не введен. Выход.");
  Deno.exit(1);
}

const authCode = decoder.decode(buffer.subarray(0, n)).trim();
if (!authCode) {
  console.log("\n❌ Код не введен. Выход.");
  Deno.exit(1);
}

console.log("\n🔄 Обмениваю код на токен...\n");

// Шаг 2: Обмениваем код на токен
try {
  const formData = new URLSearchParams();
  formData.append("grant_type", "authorization_code");
  formData.append("code", authCode);
  formData.append("client_id", CLIENT_ID);
  formData.append("client_secret", CLIENT_SECRET);

  const response = await fetch("https://oauth.yandex.ru/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("❌ Ошибка при получении токена:");
    console.error(`   Статус: ${response.status}`);
    console.error(`   Ответ: ${errorText}`);
    Deno.exit(1);
  }

  const data = await response.json();
  
  if (!data.access_token) {
    console.error("❌ Токен не найден в ответе:");
    console.error(JSON.stringify(data, null, 2));
    Deno.exit(1);
  }

  console.log("✅ Токен получен успешно!\n");
  console.log("📝 Ваш токен:");
  console.log(`\n   ${data.access_token}\n`);
  console.log("💡 Сохраните этот токен в безопасном месте!");
  console.log("⚠️  НЕ коммитьте токен в git!\n");
  
  console.log("🧪 Проверка токена...\n");
  
  // Проверяем токен
  const checkResponse = await fetch("https://cloud-api.yandex.net/v1/disk", {
    headers: {
      "Authorization": `OAuth ${data.access_token}`,
    },
  });
  
  if (checkResponse.ok) {
    console.log("✅ Токен работает корректно!");
    console.log("\n🚀 Теперь вы можете использовать токен:");
    console.log(`   deno task health ${data.access_token}`);
  } else {
    console.log("⚠️  Токен получен, но проверка не прошла. Возможно, нужны дополнительные права.");
    console.log(`   Статус: ${checkResponse.status}`);
  }
  
} catch (error) {
  console.error("❌ Ошибка:", error);
  Deno.exit(1);
}

