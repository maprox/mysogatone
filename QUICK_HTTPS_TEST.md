# Быстрый тест Session Management для HTTPS

## Быстрый старт (3 команды)

### 1. LISTENER (терминал 1)
```powershell
cd listeners\yandex-disk
$env:YANDEX_DISK_TOKEN="ваш_токен"
deno task start
```

### 2. CALLER (терминал 2)
```powershell
cd callers\deno
$env:YANDEX_DISK_TOKEN="ваш_токен"
deno task start
```

### 3. Тест HTTPS (терминал 3)
```powershell
# Первый запрос - создание сессии
curl.exe --proxy socks5://127.0.0.1:1080 https://ya.ru

# Второй запрос (в течение 60 сек) - переиспользование сессии
curl.exe --proxy socks5://127.0.0.1:1080 https://ya.ru
```

## Что искать в логах

### CALLER - первый запрос:
```
[SessionManager] Создана сессия <ID> для ya.ru:443
[YandexDiskConnectionHandler] Сессия: <ID>, первый в сессии: true
```

### CALLER - второй запрос (должен быть тот же ID):
```
[YandexDiskConnectionHandler] Сессия: <ID>, первый в сессии: false  ← ВАЖНО!
```

### LISTENER - первый запрос:
```
[SessionManager] Создание новой сессии <ID> для ya.ru:443
[<request-id>] ✅ TCP соединение получено (переиспользовано: false)
```

### LISTENER - второй запрос:
```
[SessionManager] Сессия <ID> уже существует, переиспользуем
[<request-id>] ✅ TCP соединение получено (переиспользовано: true)  ← ВАЖНО!
```

## ✅ Успех если:
- Второй запрос показывает `первый в сессии: false`
- Второй запрос показывает `переиспользовано: true`
- Session ID одинаковый в обоих запросах

## ❌ Проблема если:
- Второй запрос создает новую сессию
- `переиспользовано: false` во втором запросе
- TCP соединение закрывается после каждого запроса
