# LISTENER для Яндекс Диск

Сервер в интернете, который мониторит Яндекс Диск и обрабатывает запросы на подключение.

## Описание

LISTENER подключается к Яндекс Диск аккаунту пользователя через API и:
- Мониторит изменения в определенной папке на Яндекс Диске
- Обнаруживает запросы на подключение (папки/файлы)
- Подключается к целевому серверу (GOAL)
- Записывает ответы от GOAL в Яндекс Диск папку через API

## Требования

- Deno runtime
- OAuth токен для доступа к Яндекс Диск API

## Настройка

1. Создайте OAuth приложение в [Яндекс ID](https://oauth.yandex.ru/)
2. Получите OAuth токен
3. Настройте переменные окружения или конфигурационный файл

## Запуск

```bash
deno task start
```

Или напрямую:

```bash
deno run --allow-net --allow-read --allow-write src/main.ts
```

## Структура

- `main.ts` - Точка входа приложения
- `storage-provider.ts` - Реализация StorageProvider для Яндекс Диск API
- `monitor.ts` - Polling механизм для мониторинга изменений
- `connection-handler.ts` - Обработка подключений к целевым серверам

## Протокол обмена

Формат запросов и ответов описан в [shared/protocol/PROTOCOL.md](../../shared/protocol/PROTOCOL.md).

Протокол использует файлы в облачном хранилище:
- `requests/{requestId}.req` - метаданные запроса (JSON)
- `requests/{requestId}.data` - данные для отправки на GOAL (binary)
- `responses/{requestId}.resp` - ответ от GOAL (binary)
- `responses/{requestId}.error` - ошибка при обработке (JSON)

