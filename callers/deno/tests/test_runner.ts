/**
 * Главный файл для запуска всех тестов
 * 
 * Запуск: deno test tests/test_runner.ts
 * Или: deno task test
 */

// Storage Provider тесты
import "./utils_test.ts";
import "./errors_test.ts";
import "./file-operations_test.ts";
import "./http-client_test.ts";
import "./yandex-disk-provider_test.ts";

// SOCKS5 тесты
import "./default-connection-handler.test.ts";
import "./socks5-handler.test.ts";
import "./socks5-server.test.ts";

// YandexDiskConnectionHandler тесты
import "./yandex-disk-connection-handler.test.ts";

