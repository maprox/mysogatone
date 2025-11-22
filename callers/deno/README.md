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

```bash
deno task start
```

Или напрямую:

```bash
deno run --allow-net src/main.ts
```

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

