/**
 * Главный файл для запуска всех тестов
 * 
 * Запуск: deno test tests/test_runner.ts
 * Или: deno task test
 */

// Импортируем все тестовые файлы

// Storage Provider тесты
import "./storage-provider/utils.test.ts";
import "./storage-provider/errors.test.ts";
import "./storage-provider/file-operations.test.ts";
import "./storage-provider/http-client.test.ts";
import "./storage-provider/yandex-disk-provider.test.ts";

// Connection тесты
import "./connection/tcp-connection.test.ts";
import "./connection/response-reader.test.ts";
import "./connection/error-handler.test.ts";
import "./connection-handler.test.ts";

// Listener тесты
import "./listener/utils.test.ts";
import "./listener/config.test.ts";
import "./listener/request-reader.test.ts";
import "./listener/request-cleanup.test.ts";
import "./listener/folder-manager.test.ts";
import "./monitor.test.ts";

// Protocol тесты
import "./protocol/utils.test.ts";

