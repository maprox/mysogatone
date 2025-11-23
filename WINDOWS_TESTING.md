# Тестирование системы на Windows

Инструкция по запуску и тестированию системы Mysogatone на Windows.

## Автоматическое тестирование

Для автоматического запуска CALLER и LISTENER с логированием используйте скрипт:

```powershell
# Установите токен
$env:YANDEX_DISK_TOKEN="ваш_токен"

# Запустите автоматическое тестирование
.\scripts\test-full-system.ps1
```

Скрипт:
- Запускает LISTENER и CALLER автоматически
- Сохраняет логи в папку `logs/`
- Периодически выводит последние строки логов
- Останавливает процессы при нажатии Ctrl+C

После тестирования проанализируйте логи:

```powershell
.\scripts\analyze-logs.ps1
```

Скрипт анализа покажет:
- Статистику работы CALLER и LISTENER
- Найденные ошибки
- Проблемы синхронизации
- Рекомендации по исправлению

## Ручное тестирование

## Предварительные требования

1. **Deno runtime** - установите с [deno.land](https://deno.land)
2. **OAuth токен для Яндекс Диск** - см. [listeners/yandex-disk/QUICK_START.md](listeners/yandex-disk/QUICK_START.md)

## Быстрый старт

### Шаг 1: Получение токена Яндекс Диск

Если у вас еще нет токена:

1. Откройте в браузере (замените `YOUR_CLIENT_ID` на ваш Client ID):
   ```
   https://oauth.yandex.ru/authorize?response_type=token&client_id=YOUR_CLIENT_ID
   ```
2. Разрешите доступ
3. Скопируйте токен из URL: `access_token=ВАШ_ТОКЕН`

Подробнее: [listeners/yandex-disk/QUICK_START.md](listeners/yandex-disk/QUICK_START.md)

### Шаг 2: Запуск LISTENER

LISTENER должен работать на сервере в интернете и мониторить Яндекс Диск.

Откройте **первый терминал PowerShell** и выполните:

```powershell
cd listeners\yandex-disk
$env:YANDEX_DISK_TOKEN="ваш_токен"
deno task start
```

LISTENER начнет мониторить папку `.mysogatone/requests` на Яндекс Диске.

### Шаг 3: Запуск CALLER

CALLER запускает SOCKS5 сервер на `127.0.0.1:1080`.

Откройте **второй терминал PowerShell** и выполните:

```powershell
cd callers\deno
$env:YANDEX_DISK_TOKEN="ваш_токен"
deno task start
```

CALLER запустит SOCKS5 сервер на порту 1080.

**Примечание:** Если токен не установлен, CALLER будет использовать `DefaultConnectionHandler` (прямые соединения без использования хранилища).

### Шаг 4: Настройка прокси в Windows

⚠️ **ВАЖНО:** CALLER работает как **SOCKS5 прокси**, а не HTTP прокси. Системные настройки Windows используют **HTTP прокси**, поэтому они **не будут работать** напрямую с CALLER.

#### ❌ Не работает: Системные настройки Windows

Настройки Windows (через Параметры или `netsh winhttp`) используют HTTP прокси протокол, а CALLER ожидает SOCKS5. Если вы попытаетесь использовать системные настройки, вы увидите ошибки в логах типа:
```
[Socks5Handler] handleHandshake: версия прочитана: 67
[Socks5Handler] Handshake не удался
```
(Байт 67 = 'C' - начало HTTP команды "CONNECT")

#### ✅ Работает: Настройка в конкретных приложениях

Используйте приложения, которые поддерживают SOCKS5 прокси напрямую:

**1. curl (рекомендуется для тестирования):**
```powershell
curl --proxy socks5://127.0.0.1:1080 http://httpbin.org/ip
```

**2. Браузеры с расширениями:**
- **Firefox**: Настройки → Сеть → Настройки → Ручная настройка прокси → SOCKS5 → `127.0.0.1:1080`
- **Chrome/Edge**: Используйте расширения типа "Proxy SwitchyOmega" или "FoxyProxy" для настройки SOCKS5

**3. Тестовый скрипт проекта:**
```powershell
cd callers\deno
deno task test:socks5
```

**4. Другие приложения:**
Многие приложения поддерживают SOCKS5 через переменные окружения или конфигурационные файлы. Проверьте документацию вашего приложения.

### Шаг 5: Тестирование

После запуска CALLER и LISTENER проверьте работу системы:

⚠️ **Важно для Chrome пользователей:** Chrome расширения (включая FoxyProxy) **не могут напрямую использовать SOCKS5** из-за ограничений Chrome API. Для браузерного тестирования рекомендуется использовать **Firefox** или **тестовый скрипт проекта**.

#### Тест 1: Использование тестового скрипта проекта (рекомендуется для PowerShell)

```powershell
cd callers\deno
deno task test:socks5
```

Этот скрипт автоматически тестирует SOCKS5 соединение и отправляет HTTP запрос через прокси.

#### Тест 2: Простой тест через curl.exe (если curl установлен)

⚠️ **Важно:** В PowerShell команда `curl` является алиасом для `Invoke-WebRequest` и не поддерживает SOCKS5. Используйте `curl.exe`:

```powershell
# Используйте curl.exe вместо curl
curl.exe --proxy socks5://127.0.0.1:1080 http://httpbin.org/ip

# Или более подробный вывод
curl.exe -v --proxy socks5://127.0.0.1:1080 http://httpbin.org/ip
```

Если curl не установлен, скачайте его с [curl.se](https://curl.se/windows/) или используйте тестовый скрипт проекта.

#### Тест 3: Упрощенный тест (только CONNECT)

```powershell
cd callers\deno
deno task test:socks5:simple
```

Этот скрипт выполняет только CONNECT запрос без полного HTTP запроса.

#### Тест 4: Проверка через браузер

**Firefox (рекомендуется для браузерного тестирования):**
   
   Firefox имеет встроенную поддержку SOCKS5 и работает лучше всего:
   
   **Встроенные настройки Firefox:**
   1. Откройте Настройки (или `about:preferences`)
   2. Прокрутите вниз до раздела "Сеть"
   3. Нажмите "Настройки" рядом с "Настройки прокси"
   4. Выберите "Ручная настройка прокси"
   5. В разделе "SOCKS5 хост" введите: `127.0.0.1`
   6. В поле "Порт" введите: `1080`
   7. Убедитесь, что выбран именно **SOCKS5**, а не SOCKS4
   8. Нажмите OK
   9. Откройте любой сайт и проверьте логи CALLER
   
   **Firefox с расширением FoxyProxy:**
   - Установите [FoxyProxy Standard](https://addons.mozilla.org/firefox/addon/foxyproxy-standard/)
   - Откройте настройки FoxyProxy (иконка расширения → Options)
   - Нажмите "Add New Proxy"
   - В разделе **Proxy Type** выберите **SOCKS5**
   - Proxy IP: `127.0.0.1`, Port: `1080`
   - Сохраните и активируйте профиль

3. **Chrome/Edge (ограниченная поддержка SOCKS5)**:
   
   ⚠️ **Важно:** Chrome расширения (включая FoxyProxy) **не могут напрямую использовать SOCKS5** из-за ограничений Chrome API. Они могут настраивать только HTTP/HTTPS прокси.
   
   **Варианты для Chrome:**
   
   **Вариант A: Используйте Proxy SwitchyOmega (может работать с SOCKS5):**
   1. Установите [Proxy SwitchyOmega](https://chrome.google.com/webstore/detail/proxy-switchyomega/padekgcemlokbadohgkifijomclgjgif)
   2. Создайте новый профиль
   3. Выберите протокол **SOCKS5**
   4. Сервер: `127.0.0.1`, Порт: `1080`
   5. Сохраните и активируйте профиль
   6. Если не работает, используйте Firefox или тестовый скрипт
   
   **Вариант B: Используйте системные настройки Windows + HTTP-to-SOCKS5 мост:**
   - Требует дополнительной настройки HTTP-to-SOCKS5 прокси моста (например, через Privoxy или другие инструменты)
   - Не рекомендуется для простого тестирования
   
   **Вариант C: Используйте тестовый скрипт проекта (рекомендуется для Chrome):**
   ```powershell
   cd callers\deno
   deno task test:socks5
   ```

## Структура запуска

```
┌─────────────────┐
│   Ваше приложение│
│  (браузер, curl) │
└────────┬─────────┘
         │ SOCKS5
         │ 127.0.0.1:1080
         ▼
┌─────────────────┐
│     CALLER      │
│  (SOCKS5 Server)│
└────────┬─────────┘
         │ StorageProvider
         │ (Яндекс Диск)
         ▼
┌─────────────────┐
│    LISTENER     │
│  (мониторинг)    │
└────────┬─────────┘
         │ TCP
         ▼
┌─────────────────┐
│   Целевой сайт   │
│  (GOAL)          │
└─────────────────┘
```

## Переменные окружения

### CALLER

- `SOCKS5_PORT` - Порт для SOCKS5 сервера (по умолчанию: 1080)
- `YANDEX_DISK_TOKEN` - OAuth токен для Яндекс Диск API
- `REQUESTS_FOLDER` - Папка для запросов (по умолчанию: `.mysogatone/requests`)
- `RESPONSES_FOLDER` - Папка для ответов (по умолчанию: `.mysogatone/responses`)
- `POLL_INTERVAL_MS` - Интервал polling (по умолчанию: 2000 мс)
- `RESPONSE_TIMEOUT_MS` - Таймаут ожидания ответа (по умолчанию: 60000 мс)

### LISTENER

- `YANDEX_DISK_TOKEN` - OAuth токен для Яндекс Диск API (обязательно)
- `REQUESTS_FOLDER` - Папка для мониторинга запросов (по умолчанию: `.mysogatone/requests`)
- `RESPONSES_FOLDER` - Папка для записи ответов (по умолчанию: `.mysogatone/responses`)
- `POLL_INTERVAL_MS` - Интервал polling (по умолчанию: 2000 мс)
- `CONNECTION_TIMEOUT_MS` - Таймаут подключения к GOAL (по умолчанию: 10000 мс)

## Отладка

### Проверка работы CALLER

```powershell
cd callers\deno
deno task test:socks5
```

### Проверка работы LISTENER

```powershell
cd listeners\yandex-disk
deno task health "ваш_токен"
```

### Просмотр логов

Оба компонента выводят логи в консоль:
- CALLER показывает подключения к SOCKS5 серверу
- LISTENER показывает обнаруженные запросы и обработку

## Остановка системы

1. В терминале CALLER нажмите `Ctrl+C`
2. В терминале LISTENER нажмите `Ctrl+C`
3. Отключите прокси в Windows (если использовали системные настройки)

## Устранение проблем

### CALLER не запускается

- Проверьте, что Deno установлен: `deno --version`
- Проверьте, что порт 1080 свободен: `netstat -an | findstr :1080`
- Измените порт через переменную окружения: `$env:SOCKS5_PORT=1081`

### LISTENER не запускается

- Проверьте токен: `deno task health "ваш_токен"`
- Убедитесь, что токен установлен: `$env:YANDEX_DISK_TOKEN`

### Прокси не работает

- **Проверьте, что CALLER запущен и слушает порт 1080**: `netstat -an | findstr :1080`
- **Используйте SOCKS5, а не HTTP прокси**: Системные настройки Windows не работают, используйте curl или браузеры с SOCKS5 поддержкой
- **Проверьте логи CALLER**: 
  - Если видите "версия прочитана: 67" (0x43, 'C') - это HTTP команда "CONNECT"
  - Если видите "версия прочитана: 72" (0x48, 'H') - это начало HTTP запроса "HTTP/1.1" или "Host:"
  - Оба случая означают, что клиент отправляет HTTP вместо SOCKS5
  - **Решение**: Проверьте настройки прокси в приложении - должен быть выбран тип **SOCKS5**, а не HTTP
- **Для FoxyProxy**: Убедитесь, что в настройках выбран **Proxy Type: SOCKS5**, а не HTTP
- **Попробуйте использовать `127.0.0.1` вместо `localhost`**
- **Проверьте файрвол Windows**: Убедитесь, что порт 1080 не заблокирован
- **Проверьте, что LISTENER запущен**: CALLER не может работать без LISTENER (если используется YandexDiskConnectionHandler)

### Нет соединения между CALLER и LISTENER

- Убедитесь, что оба используют один и тот же токен
- Проверьте, что папки `.mysogatone/requests` и `.mysogatone/responses` совпадают
- Проверьте логи обоих компонентов

## Дополнительная информация

- [Архитектура системы](ARCHITECTURE.md)
- [Протокол обмена](shared/protocol/PROTOCOL.md)
- [Документация CALLER](callers/deno/README.md)
- [Документация LISTENER](listeners/yandex-disk/README.md)

