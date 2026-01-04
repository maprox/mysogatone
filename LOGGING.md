# Логирование

Проект использует систему логирования, которая записывает логи одновременно в файл и в stdout.

## Структура

- **Типы**: `shared/logger/types.ts` (интерфейс Logger, enum LogLevel)
- **FileLogger**: `shared/logger/file-logger.ts` (основной логгер с записью в файл)
- **ConsoleLoggerAdapter**: `shared/logger/console-logger.ts` (адаптер для console)
- **SharedLoggerAdapter**: `shared/logger/shared-logger-adapter.ts` (адаптер для FileLogger)
- **Утилиты**: `shared/logger/utils.ts` (функции форматирования)
- **LISTENER**: использует `@shared/logger/file-logger.ts`
- **CALLER**: использует `@shared/logger/file-logger.ts`

## Использование

### Инициализация

Логгер автоматически инициализируется в `main.ts` при запуске приложения.

#### Переменные окружения

**LISTENER:**
- `LISTENER_LOG_PATH` - путь к файлу лога (по умолчанию: `logs/listener.log`)
- `LISTENER_LOG_LEVEL` - минимальный уровень логирования: `DEBUG`, `INFO`, `WARN`, `ERROR` (по умолчанию: `INFO`)

**CALLER:**
- `CALLER_LOG_PATH` - путь к файлу лога (по умолчанию: `logs/caller.log`)
- `CALLER_LOG_LEVEL` - минимальный уровень логирования: `DEBUG`, `INFO`, `WARN`, `ERROR` (по умолчанию: `INFO`)

### Примеры использования

```typescript
import { getLogger } from "@shared/logger/file-logger.ts";

// Получить глобальный логгер
const logger = getLogger();

// Синхронные методы (реализуют интерфейс Logger)
logger.info("Сообщение");
logger.warn("Предупреждение");
logger.error("Ошибка", error);
logger.debug("Отладочная информация");
```

### Уровни логирования

- **DEBUG** (0) - отладочная информация
- **INFO** (1) - информационные сообщения (по умолчанию)
- **WARN** (2) - предупреждения
- **ERROR** (3) - ошибки

### Формат логов

```
[2025-01-15T10:30:45.123Z] [LISTENER] [INFO] Сообщение
[2025-01-15T10:30:45.456Z] [CALLER] [WARN] Предупреждение
```

## Миграция с console.log

Для постепенной миграции можно использовать синхронные методы:

```typescript
// Было:
console.log("Сообщение");

// Стало:
const logger = getLogger();
logger.info("Сообщение");
```

## Файлы логов

Логи сохраняются в:
- `logs/listener.log` - логи LISTENER
- `logs/caller.log` - логи CALLER

Папка `logs/` создается автоматически при первом запуске.

## Анализ логов

Логи можно анализировать с помощью стандартных инструментов:

```bash
# Просмотр последних 100 строк
tail -n 100 logs/listener.log

# Поиск ошибок
grep ERROR logs/listener.log

# Фильтрация по времени
grep "2025-01-15T10:" logs/listener.log
```

## Примечания

- Логи записываются в файл с буферизацией, но буфер сбрасывается после каждой записи (`sync()`)
- Если запись в файл не удается, логирование продолжается в stdout
- Логгер автоматически закрывается при завершении приложения

