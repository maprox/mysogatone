# DelayedConnectionHandler - Эмуляция задержек для отладки TLS handshake

## Описание

`DelayedConnectionHandler` - это handler, который эмулирует задержки, возникающие при работе через `YandexDiskConnectionHandler`, но использует прямое TCP соединение. Это позволяет выяснить, на каком этапе TLS handshake происходит обрыв соединения из-за задержек.

## Использование

### Шаг 1: Запись задержек из YandexDiskConnectionHandler

Сначала запустите тест с `YandexDiskConnectionHandler`, чтобы записать задержки в лог:

```bash
# Убедитесь, что переменные окружения настроены
export YANDEX_DISK_TOKEN="your_token"
export REQUESTS_FOLDER=".mysogatone/requests"
export RESPONSES_FOLDER=".mysogatone/responses"

# Запустите сервер с YandexDiskConnectionHandler
deno run --allow-env --allow-net --allow-read --allow-write src/main.ts

# Выполните тест (например, HTTPS запрос)
# Задержки будут записаны в файл delay-log.jsonl
```

### Шаг 2: Использование DelayedConnectionHandler

После записи задержек, используйте `DelayedConnectionHandler` для эмуляции:

```bash
# Используйте переменную окружения USE_DELAYED_HANDLER
export USE_DELAYED_HANDLER="true"
export DELAY_LOG_PATH="delay-log.jsonl"  # По умолчанию: delay-log.jsonl

# Запустите сервер с DelayedConnectionHandler
deno run --allow-env --allow-net --allow-read --allow-write src/main.ts

# Выполните тот же тест
# Handler автоматически загрузит задержки из лога и применит их
```

### Шаг 3: Анализ результатов

Сравните результаты работы:
- `DirectConnectionHandler` (без задержек) - должен работать
- `DelayedConnectionHandler` (с эмулированными задержками) - должен показать, где происходит обрыв
- `YandexDiskConnectionHandler` (реальные задержки) - для сравнения

## Конфигурация задержек

Handler автоматически анализирует лог и вычисляет медианные значения задержек для:
- `chunkInterval` - задержка между чанками данных
- `metadataDelay` - задержка при создании метаданных
- `uploadDelay` - задержка при загрузке данных
- `pollInterval` - задержка между polling итерациями
- `responseReadDelay` - задержка при чтении ответа

Также можно задать задержки вручную через конфигурацию (см. `types.ts`).

## Логирование

Все задержки записываются в файл `delay-log.jsonl` в формате JSONL (JSON Lines):
- Каждая строка - отдельная запись о задержке
- Формат: `{"operation": "...", "stage": "...", "delay": ..., "timestamp": ...}`

## Отладка TLS handshake

При отладке TLS handshake важно обратить внимание на:
1. Задержки между отправкой чанков данных (chunk_interval)
2. Задержки при загрузке данных (upload_data)
3. Порядок отправки данных - все чанки должны отправляться без разрывов

Handler применяет задержки только при записи данных (writer), так как именно задержки при отправке данных критичны для TLS handshake.

