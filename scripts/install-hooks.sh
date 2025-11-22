#!/bin/sh
#
# Скрипт автоматической установки Git hooks
# Запускается при клонировании или вручную
#

set -e

# Определяем корневую директорию репозитория
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
HOOKS_DIR="$REPO_ROOT/.git/hooks"
SOURCE_HOOKS_DIR="$REPO_ROOT/hooks"

if [ ! -d "$SOURCE_HOOKS_DIR" ]; then
    echo "Ошибка: директория hooks не найдена"
    exit 1
fi

# Создаем директорию для hooks, если её нет
mkdir -p "$HOOKS_DIR"

# Копируем hooks
for hook in "$SOURCE_HOOKS_DIR"/*; do
    if [ -f "$hook" ] && [ "$(basename "$hook")" != "README.md" ]; then
        hook_name=$(basename "$hook")
        target="$HOOKS_DIR/$hook_name"
        
        # Копируем только если файл изменился или не существует
        if [ ! -f "$target" ] || ! cmp -s "$hook" "$target"; then
            cp "$hook" "$target"
            chmod +x "$target"
            echo "✓ Установлен hook: $hook_name"
        fi
    fi
done

echo "✓ Git hooks установлены"

