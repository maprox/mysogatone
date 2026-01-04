# Эмуляция "висящего" соединения

## Описание

Флаг `SIMULATE_IDLE_CONNECTION` позволяет эмулировать поведение LISTENER, где соединение не используется между раундами TLS handshake.

## Проблема

В LISTENER:
- После первого раунда TLS handshake соединение сохраняется, но **не используется** между раундами
- Между раундами проходит ~4.3 секунды (задержки Yandex Disk API)
- Соединение просто "висит" без чтения/записи
- Сервер (GOAL) закрывает соединение по таймауту неактивности

В DelayedConnectionHandler (по умолчанию):
- Reader продолжает читать из соединения между раундами
- Соединение остается активным
- Сервер не закрывает соединение

## Решение

Включите флаг `SIMULATE_IDLE_CONNECTION=true` для эмуляции поведения LISTENER:

```bash
export SIMULATE_IDLE_CONNECTION=true
export USE_DELAYED_HANDLER=true
deno task start
```

## Что происходит

1. После получения первого ответа (ServerHello + Certificate + ServerKeyExchange + ServerHelloDone) reader **останавливается**
2. Соединение "висит" без активности между раундами
3. Задержки между раундами применяются в writer (nextRequestDelay, nextRequestMetadataDelay, nextRequestUploadDelay)
4. Когда writer получает следующий чанк (ClientKeyExchange), он применяет задержки и отправляет данные
5. **Ожидаемый результат**: сервер закрывает соединение по таймауту неактивности (как в LISTENER)

## Использование

```bash
# Включить эмуляцию "висящего" соединения
export SIMULATE_IDLE_CONNECTION=true
export USE_DELAYED_HANDLER=true

# Можно также задать задержки между раундами (как в LISTENER)
export NEXT_REQUEST_DELAY=2424
export NEXT_REQUEST_METADATA_DELAY=1083
export NEXT_REQUEST_UPLOAD_DELAY=1234

# Запустить CALLER
deno task start
```

## Ожидаемый результат

Если гипотеза верна, то при включенном `SIMULATE_IDLE_CONNECTION=true`:
- Соединение будет закрыто сервером между раундами
- TLS handshake не завершится
- Это подтвердит, что проблема в неактивности соединения, а не в таймауте TLS handshake

