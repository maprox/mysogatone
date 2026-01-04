# Тестирование с логированием временных меток

## Шаг 1: Очистка предыдущих логов (опционально)

```powershell
cd D:\Projects\sunsay\mysogatone\callers\deno
Remove-Item delay-log.jsonl -ErrorAction SilentlyContinue
```

## Шаг 2: Запуск LISTENER (в отдельном терминале)

```powershell
cd D:\Projects\sunsay\mysogatone\listeners\yandex-disk
deno task start
```

## Шаг 3: Запуск CALLER с YandexDiskConnectionHandler

```powershell
cd D:\Projects\sunsay\mysogatone\callers\deno

# Убедитесь, что установлен токен Yandex Disk
$env:YANDEX_DISK_TOKEN="ваш_токен"

# Убедитесь, что не используется DelayedConnectionHandler
$env:USE_DELAYED_HANDLER="false"
$env:USE_DIRECT_HANDLER="false"

# Запуск сервера
deno task start
```

## Шаг 4: Выполнение тестового запроса (в другом терминале)

```powershell
curl.exe --proxy socks5://127.0.0.1:1080 https://mail.ru
```

## Шаг 5: Анализ логов

После выполнения запроса проверьте файл `delay-log.jsonl`:

```powershell
cd D:\Projects\sunsay\mysogatone\callers\deno
Get-Content delay-log.jsonl | ConvertFrom-Json | Where-Object { $_.operation -eq "timeline" } | Format-Table
```

Или для просмотра всех timeline записей:

```powershell
Get-Content delay-log.jsonl | Select-String "timeline" | ForEach-Object { $_ | ConvertFrom-Json }
```

## Что искать в логах

Ищите записи с `operation: "timeline"` и следующими `stage`:
- `first_chunk_received` - получение первого чанка
- `file_created` - создание файла данных
- `polling_started` - начало polling
- `response_received` - получение ответа
- `next_request_created` - создание следующего запроса
- `file_updated` - обновление файла данных

## Быстрый тест

Если нужно быстро протестировать без LISTENER (только для проверки логирования):

```powershell
cd D:\Projects\sunsay\mysogatone\callers\deno
$env:YANDEX_DISK_TOKEN="ваш_токен"
$env:USE_DELAYED_HANDLER="false"
$env:USE_DIRECT_HANDLER="false"
deno task start
```

Затем в другом терминале:
```powershell
curl.exe --proxy socks5://127.0.0.1:1080 https://mail.ru
```

