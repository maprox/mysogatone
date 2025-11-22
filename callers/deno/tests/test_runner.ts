/**
 * Главный файл для запуска всех тестов
 * 
 * Запуск: deno test tests/test_runner.ts
 * Или: deno task test
 */

// Импортируем все тестовые файлы
import "./utils_test.ts";
import "./errors_test.ts";
import "./file-operations_test.ts";
import "./http-client_test.ts";
import "./yandex-disk-provider_test.ts";

