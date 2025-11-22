# Mysogatone - Система проксирования через облачные хранилища

Монорепозиторий для системы проксирования трафика через облачные хранилища (Яндекс Диск, Google Drive и др.).

## Архитектура

Система состоит из двух основных компонентов:

1. **LISTENER** - сервер в интернете, который мониторит облачное хранилище и обрабатывает запросы на подключение
2. **CALLER** - SOCKS5 сервер на устройстве пользователя, который создает запросы через облачное хранилище

### Поток данных

```
APP → CALLER (SOCKS5) → StorageProvider (создание запроса) → LISTENER (polling) → GOAL
GOAL → LISTENER → StorageProvider (запись ответа) → CALLER (polling) → APP
```

## Структура монорепозитория

```
mysogatone/
├── listeners/             # Модули LISTENER (Deno) - разные провайдеры
│   └── yandex-disk/      # LISTENER для Яндекс Диск
│
├── callers/               # Модули CALLER - разные платформы
│   ├── deno/             # CALLER на Deno - для тестирования
│   └── android/          # CALLER для Android (Kotlin)
│
├── shared/                # Общий код
│   └── protocol/          # Протокол обмена через хранилище
│       ├── PROTOCOL.md    # Описание протокола
│       ├── types.ts       # TypeScript типы
│       └── README.md      # Документация протокола
│
├── ARCHITECTURE.md        # Подробная архитектура системы
└── README.md              # Этот файл
```

## Модули

### LISTENER (listeners/yandex-disk/)

Сервер в интернете, который:
- Подключается к облачному хранилищу через API
- Мониторит изменения в определенной папке (polling)
- Обнаруживает запросы на подключение
- Подключается к целевому серверу (GOAL)
- Записывает ответы от GOAL в хранилище

**Технологии**: Deno, TypeScript

**Статус**: В разработке

### CALLER для Android (callers/android/)

SOCKS5 сервер на Kotlin для Android приложения:
- Принимает запросы от приложений через SOCKS5 (127.0.0.1:1080)
- Использует ConnectionHandler для работы с хранилищем
- Создает запросы через провайдер хранилища
- Polling для проверки ответов от LISTENER

**Технологии**: Kotlin, Gradle

**Статус**: Базовая реализация SOCKS5 сервера готова

### CALLER для Deno (callers/deno/)

SOCKS5 сервер на Deno для тестирования на Windows/Linux/Mac:
- Аналогично CALLER для Android, но реализован на Deno
- Для разработки и тестирования

**Технологии**: Deno, TypeScript

**Статус**: В разработке

## Особенности

- **Абстракция провайдеров**: Система поддерживает разные провайдеры облачных хранилищ через интерфейс StorageProvider
- **Polling вместо webhooks**: Используется периодический опрос API (webhooks не поддерживаются Яндекс Диск API)
- **Rate limiting**: Реализована обработка ограничений API с экспоненциальной задержкой
- **Модульность**: Каждый компонент может быть разработан и протестирован независимо

## Быстрый старт

### Установка Git Hooks

После клонирования репозитория установите Git hooks для автоматической проверки кода перед коммитом:

```bash
# Через npm (если установлен Node.js)
npm install

# Или вручную через скрипт
./scripts/install-hooks.sh
# Или на Windows: scripts\install-hooks.bat
```

Подробнее см. [GIT_HOOKS.md](GIT_HOOKS.md)

### LISTENER для Яндекс Диск

```bash
cd listeners/yandex-disk
deno task start
```

### CALLER для Android

```bash
cd callers/android
./gradlew run
```

## Документация

- [ARCHITECTURE.md](ARCHITECTURE.md) - Подробная архитектура системы
- [GIT_HOOKS.md](GIT_HOOKS.md) - Настройка Git hooks для автоматической проверки кода
- [shared/protocol/PROTOCOL.md](shared/protocol/PROTOCOL.md) - Протокол передачи данных через файлы
- [listeners/yandex-disk/README.md](listeners/yandex-disk/README.md) - Документация LISTENER
- [callers/android/README.md](callers/android/README.md) - Документация CALLER для Android
- [callers/deno/README.md](callers/deno/README.md) - Документация CALLER для Deno

## Требования

- **LISTENER**: Deno runtime, OAuth токен для доступа к API
- **CALLER Android**: JDK 11+, Gradle, Android SDK (для Android приложения)
- **CALLER Deno**: Deno runtime, OAuth токен для доступа к API

## Лицензия

MIT
