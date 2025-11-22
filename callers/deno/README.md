# CALLER для Deno

SOCKS5 сервер на Deno для тестирования на Windows/Linux/Mac.

## Описание

CALLER принимает запросы от приложений через SOCKS5 прокси и:
- Создает запросы в облачном хранилище через StorageProvider
- Мониторит ответы от LISTENER через polling
- Передает данные между приложением и хранилищем

## Требования

- Deno runtime
- OAuth токен для доступа к Яндекс Диск API (если используется YandexDiskProvider)

## Запуск

### Запуск SOCKS5 сервера

```bash
deno task start
```

Или напрямую:

```bash
deno run --allow-net --allow-read --allow-write src/main.ts
```

### Переменные окружения

- `SOCKS5_PORT` - Порт для SOCKS5 сервера (по умолчанию: 1080)
- `YANDEX_DISK_TOKEN` - OAuth токен для Яндекс Диск API (если не указан, используется DefaultConnectionHandler)
- `REQUESTS_FOLDER` - Папка для запросов в хранилище (по умолчанию: `.mysogatone/requests`)
- `RESPONSES_FOLDER` - Папка для ответов в хранилище (по умолчанию: `.mysogatone/responses`)
- `POLL_INTERVAL_MS` - Интервал polling для проверки ответов в миллисекундах (по умолчанию: 2000)
- `RESPONSE_TIMEOUT_MS` - Таймаут ожидания ответа в миллисекундах (по умолчанию: 60000)

### Тестирование SOCKS5 сервера

Для тестирования SOCKS5 сервера в реальных условиях:

1. Запустите SOCKS5 сервер в отдельном терминале:
```bash
deno task start
```

2. В другом терминале запустите тестовый скрипт:
```bash
deno task test:socks5
```

Или напрямую:
```bash
deno run --allow-net scripts/test-socks5-server.ts
```

### Переменные окружения для тестирования

- `SOCKS5_HOST` - Хост SOCKS5 сервера (по умолчанию: 127.0.0.1)
- `SOCKS5_PORT` - Порт SOCKS5 сервера (по умолчанию: 1080)
- `TARGET_HOST` - Целевой хост для тестирования (по умолчанию: httpbin.org)
- `TARGET_PORT` - Порт целевого хоста (по умолчанию: 80)

## Линтинг и проверка кода

Проверка кода линтером:

```bash
deno task lint
```

Автоматическое исправление проблем:

```bash
deno task lint:fix
```

Проверка типов и линтинг:

```bash
deno task check
```

## Структура

- `main.ts` - Точка входа приложения
- `connection-handler.ts` - Абстракция ConnectionHandler
- `storage/` - Провайдеры хранилища
- `yandex-disk-connection-handler.ts` - ConnectionHandler через StorageProvider
- `socks5-server.ts` - SOCKS5 сервер
- `socks5-handler.ts` - Обработчик SOCKS5 протокола

## Статус

В разработке. Будет реализован после завершения LISTENER.

