# Проверка работоспособности

Этот документ описывает различные способы проверки работоспособности проекта.

## Быстрая проверка

### 1. Проверка настройки (без реального API)

Проверяет импорты, типы и базовую функциональность без необходимости в реальном API токене:

```bash
deno task verify
```

**Что проверяется:**
- ✅ Импорт всех модулей
- ✅ Создание провайдера
- ✅ Валидация токена
- ✅ Работа утилит (normalizePath, buildApiUrl)
- ✅ Работа типов
- ✅ Обработка ошибок

### 2. Линтинг и проверка типов

```bash
# Линтинг
deno task lint

# Проверка типов
deno task check
```

### 3. Запуск юнит-тестов

```bash
# Все тесты
deno task test

# Тесты в режиме watch
deno task test:watch

# Конкретный тестовый файл
deno test --allow-net --allow-read --allow-write tests/utils_test.ts
```

## Проверка с реальным API

### Требования

- OAuth токен для Яндекс Диск API
- Доступ к интернету

### Получение токена

1. Зарегистрируйте приложение на [Яндекс ID](https://oauth.yandex.ru/)
2. Получите OAuth токен через OAuth flow
3. Используйте токен для проверки

### Запуск проверки

```bash
# Способ 1: Через аргумент командной строки
deno task health YOUR_TOKEN_HERE

# Способ 2: Через переменную окружения
export YANDEX_DISK_TOKEN=your_token
deno task health

# Способ 3: Напрямую
deno run --allow-net --allow-read --allow-env scripts/check-health.ts YOUR_TOKEN_HERE
```

### Что проверяется

Скрипт `check-health.ts` выполняет полный цикл операций:

1. ✅ **Создание провайдера** - проверяет валидацию токена
2. ✅ **Получение списка файлов** - проверяет работу `listFiles()`
3. ✅ **Загрузка файла** - проверяет работу `uploadFile()`
4. ✅ **Скачивание файла** - проверяет работу `downloadFile()`
5. ✅ **Удаление файла** - проверяет работу `deleteFile()`

**Примечание:** Скрипт создает временный тестовый файл и удаляет его после проверки.

## Комплексная проверка

Для полной проверки выполните все шаги последовательно:

```bash
# 1. Проверка настройки
deno task verify

# 2. Линтинг
deno task lint

# 3. Проверка типов
deno task check

# 4. Запуск тестов
deno task test

# 5. Проверка с реальным API (если есть токен)
deno task health YOUR_TOKEN
```

## Отладка проблем

### Проблема: Ошибки импорта

**Решение:**
```bash
deno task verify
```

Проверьте, что все модули доступны и правильно импортированы.

### Проблема: Ошибки линтера

**Решение:**
```bash
deno task lint
deno task lint:fix  # Автоматическое исправление
```

### Проблема: Ошибки типов

**Решение:**
```bash
deno task check
```

Проверьте, что все типы определены правильно.

### Проблема: Тесты не проходят

**Решение:**
```bash
deno task test
```

Проверьте вывод тестов для деталей ошибок.

### Проблема: Ошибки при работе с реальным API

**Возможные причины:**
1. Неверный или истекший токен
2. Недостаточно прав у токена
3. Проблемы с сетью
4. Превышение rate limits

**Решение:**
```bash
deno task health YOUR_TOKEN
```

Проверьте сообщения об ошибках в выводе скрипта.

## Автоматизация проверки

### CI/CD интеграция

Пример для GitHub Actions:

```yaml
name: Check

on: [push, pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: denoland/setup-deno@v1
      - run: deno task verify
      - run: deno task lint
      - run: deno task check
      - run: deno task test
```

### Pre-commit hook

Создайте `.git/hooks/pre-commit`:

```bash
#!/bin/bash
cd listeners/yandex-disk
deno task verify && deno task lint && deno task check
```

## Дополнительная информация

- [README.md](README.md) - Основная документация
- [ARCHITECTURE.md](../../ARCHITECTURE.md) - Архитектура системы
- [shared/protocol/PROTOCOL.md](../../shared/protocol/PROTOCOL.md) - Протокол обмена

