# Git Hooks

Эта директория содержит Git hooks для проекта.

## Установка

После клонирования репозитория скопируйте hook в `.git/hooks/`:

```bash
# Linux/Mac или Git Bash на Windows
cp hooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit

# Windows (cmd.exe) - Git автоматически установит права
copy hooks\pre-commit .git\hooks\pre-commit
```

## Доступные hooks

- **pre-commit** - запускает тесты и линтер перед коммитом

Hook проверяет только измененные проекты:
- Deno проекты: lint, type check, tests
- Kotlin проект: компиляция

Подробнее см. [GIT_HOOKS.md](../GIT_HOOKS.md)

