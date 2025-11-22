/**
 * LISTENER для Яндекс Диск
 * 
 * Точка входа приложения.
 */

import { Listener } from "./listener/listener.ts";
import { getConfigFromEnv } from "./listener/config.ts";

/**
 * Точка входа
 */
async function main(): Promise<void> {
  try {
    const config = getConfigFromEnv();
    const listener = new Listener(config);
    await listener.start();
  } catch (error) {
    console.error("❌ Критическая ошибка:", error);
    Deno.exit(1);
  }
}

// Запускаем только если файл выполняется напрямую
if (import.meta.main) {
  await main();
}
