/**
 * Тесты для конфигурации LISTENER
 */

import { assertEquals, assertRejects } from "https://deno.land/std@0.211.0/assert/mod.ts";
import { getConfigFromEnv } from "@src/listener/config.ts";

Deno.test("getConfigFromEnv - использует значения по умолчанию", () => {
  // Сохраняем оригинальные значения
  const originalToken = Deno.env.get("YANDEX_DISK_TOKEN");
  const originalRequestsFolder = Deno.env.get("REQUESTS_FOLDER");
  const originalResponsesFolder = Deno.env.get("RESPONSES_FOLDER");
  const originalPollInterval = Deno.env.get("POLL_INTERVAL_MS");
  const originalConnectionTimeout = Deno.env.get("CONNECTION_TIMEOUT_MS");
  
  try {
    // Устанавливаем только токен
    Deno.env.set("YANDEX_DISK_TOKEN", "test-token");
    Deno.env.delete("REQUESTS_FOLDER");
    Deno.env.delete("RESPONSES_FOLDER");
    Deno.env.delete("POLL_INTERVAL_MS");
    Deno.env.delete("CONNECTION_TIMEOUT_MS");
    
    const config = getConfigFromEnv();
    
    assertEquals(config.accessToken, "test-token");
    assertEquals(config.requestsFolder, ".mysogatone/requests");
    assertEquals(config.responsesFolder, ".mysogatone/responses");
    assertEquals(config.pollInterval, 2000);
    assertEquals(config.connectionTimeout, 10000);
  } finally {
    // Восстанавливаем оригинальные значения
    if (originalToken) {
      Deno.env.set("YANDEX_DISK_TOKEN", originalToken);
    } else {
      Deno.env.delete("YANDEX_DISK_TOKEN");
    }
    if (originalRequestsFolder) {
      Deno.env.set("REQUESTS_FOLDER", originalRequestsFolder);
    }
    if (originalResponsesFolder) {
      Deno.env.set("RESPONSES_FOLDER", originalResponsesFolder);
    }
    if (originalPollInterval) {
      Deno.env.set("POLL_INTERVAL_MS", originalPollInterval);
    }
    if (originalConnectionTimeout) {
      Deno.env.set("CONNECTION_TIMEOUT_MS", originalConnectionTimeout);
    }
  }
});

Deno.test("getConfigFromEnv - использует значения из переменных окружения", () => {
  // Сохраняем оригинальные значения
  const originalToken = Deno.env.get("YANDEX_DISK_TOKEN");
  const originalRequestsFolder = Deno.env.get("REQUESTS_FOLDER");
  const originalResponsesFolder = Deno.env.get("RESPONSES_FOLDER");
  const originalPollInterval = Deno.env.get("POLL_INTERVAL_MS");
  const originalConnectionTimeout = Deno.env.get("CONNECTION_TIMEOUT_MS");
  
  try {
    Deno.env.set("YANDEX_DISK_TOKEN", "custom-token");
    Deno.env.set("REQUESTS_FOLDER", "custom-requests");
    Deno.env.set("RESPONSES_FOLDER", "custom-responses");
    Deno.env.set("POLL_INTERVAL_MS", "5000");
    Deno.env.set("CONNECTION_TIMEOUT_MS", "30000");
    
    const config = getConfigFromEnv();
    
    assertEquals(config.accessToken, "custom-token");
    assertEquals(config.requestsFolder, "custom-requests");
    assertEquals(config.responsesFolder, "custom-responses");
    assertEquals(config.pollInterval, 5000);
    assertEquals(config.connectionTimeout, 30000);
  } finally {
    // Восстанавливаем оригинальные значения
    if (originalToken) {
      Deno.env.set("YANDEX_DISK_TOKEN", originalToken);
    } else {
      Deno.env.delete("YANDEX_DISK_TOKEN");
    }
    if (originalRequestsFolder) {
      Deno.env.set("REQUESTS_FOLDER", originalRequestsFolder);
    } else {
      Deno.env.delete("REQUESTS_FOLDER");
    }
    if (originalResponsesFolder) {
      Deno.env.set("RESPONSES_FOLDER", originalResponsesFolder);
    } else {
      Deno.env.delete("RESPONSES_FOLDER");
    }
    if (originalPollInterval) {
      Deno.env.set("POLL_INTERVAL_MS", originalPollInterval);
    } else {
      Deno.env.delete("POLL_INTERVAL_MS");
    }
    if (originalConnectionTimeout) {
      Deno.env.set("CONNECTION_TIMEOUT_MS", originalConnectionTimeout);
    } else {
      Deno.env.delete("CONNECTION_TIMEOUT_MS");
    }
  }
});

Deno.test("getConfigFromEnv - выбрасывает ошибку при отсутствии токена", async () => {
  // Сохраняем оригинальное значение
  const originalToken = Deno.env.get("YANDEX_DISK_TOKEN");
  
  try {
    Deno.env.delete("YANDEX_DISK_TOKEN");
    
    await assertRejects(
      async () => getConfigFromEnv(),
      Error,
      "YANDEX_DISK_TOKEN environment variable is required"
    );
  } finally {
    // Восстанавливаем оригинальное значение
    if (originalToken) {
      Deno.env.set("YANDEX_DISK_TOKEN", originalToken);
    }
  }
});

