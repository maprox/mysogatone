/**
 * Тесты для утилит LISTENER
 */

import { assertEquals } from "https://deno.land/std@0.211.0/assert/mod.ts";
import { sleep } from "@src/listener/utils.ts";

Deno.test({
  name: "sleep - создает задержку на указанное время",
  sanitizeResources: false,
  sanitizeOps: false,
}, async () => {
  const start = Date.now();
  await sleep(100);
  const duration = Date.now() - start;
  
  // Проверяем, что задержка была примерно 100ms (с допуском ±20ms)
  assertEquals(duration >= 80 && duration <= 120, true);
});

Deno.test("sleep - обрабатывает нулевую задержку", async () => {
  const start = Date.now();
  await sleep(0);
  const duration = Date.now() - start;
  
  // Нулевая задержка должна быть очень быстрой
  assertEquals(duration < 50, true);
});

