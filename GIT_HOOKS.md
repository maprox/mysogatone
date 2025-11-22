# Настройка Git Hooks

В проекте настроен pre-commit hook, который автоматически запускает тесты и линтер перед каждым коммитом.

## Что проверяется

### Deno проекты (listeners/yandex-disk, callers/deno)
- ✅ Линтинг (`deno task lint`)
- ✅ Проверка типов (`deno check src/`)
- ✅ Тесты (`deno task test`) - только для listeners/yandex-disk

### Kotlin проект (callers/android)
- ✅ Компиляция (`./gradlew build -x test`)

## Как это работает

Hook автоматически запускается при выполнении `git commit`. Он проверяет только те проекты, в которых были изменены файлы.

## Установка

### Автоматическая установка через npm (рекомендуется)

Если у вас установлен Node.js, hooks установятся автоматически при установке зависимостей:

```bash
npm install
```

Или установите hooks вручную:

```bash
npm run install-hooks
```

### Автоматическая установка через скрипт

Запустите скрипт установки:

```bash
# Linux/Mac или Git Bash на Windows
./scripts/install-hooks.sh

# Windows (cmd.exe)
scripts\install-hooks.bat

# Или через Node.js (если установлен)
node scripts/install-hooks.js
```

Скрипт автоматически скопирует все hooks из директории `hooks/` в `.git/hooks/`.

### Ручная установка

Или скопируйте hook вручную:

```bash
# Linux/Mac или Git Bash на Windows
cp hooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit

# Windows (cmd.exe) - Git автоматически установит права
copy hooks\pre-commit .git\hooks\pre-commit
```

## Использование

### Автоматический запуск

Hooks запускаются автоматически при `git commit`. Если проверки не пройдут, коммит будет отменен.

### Пропуск проверок

Если вам нужно пропустить проверки (не рекомендуется), используйте флаг `--no-verify`:

```bash
git commit --no-verify -m "сообщение коммита"
```


## Требования

- **Node.js** (опционально) - для автоматической установки hooks через `npm install`
- **Deno** должен быть установлен и доступен в PATH для проверки Deno проектов
- **Gradle** (или gradlew) должен быть доступен для проверки Kotlin проекта

## Отладка

Если hook не работает:

1. Убедитесь, что файл `.git/hooks/pre-commit` существует и имеет права на выполнение
2. Проверьте, что необходимые инструменты (Deno, Gradle) установлены и доступны в PATH
3. Запустите проверки вручную:
   ```bash
   cd listeners/yandex-disk
   deno task lint
   deno task test
   ```

## ⚠️ ВАЖНО: Правильный запуск тестов

**НЕПРАВИЛЬНО** (без флагов разрешений):
```bash
deno test tests/test_runner.ts
```

**ПРАВИЛЬНО** (с флагами разрешений через deno task):
```bash
deno task test
```

Или напрямую с флагами:
```bash
deno test --allow-net --allow-read --allow-write --allow-env tests/test_runner.ts
```

Hook использует `deno task test`, который автоматически передает все необходимые флаги разрешений (`--allow-net`, `--allow-env`, и т.д.). Если вы запускаете тесты напрямую через `deno test` без этих флагов, тесты будут падать с ошибками о недостающих разрешениях.

## Дополнительная информация

Hook находится в `hooks/pre-commit`. Для изменения логики проверок отредактируйте этот файл.

