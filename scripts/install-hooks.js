#!/usr/bin/env node
/**
 * Скрипт автоматической установки Git hooks
 * Запускается автоматически при npm install через postinstall
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Определяем корневую директорию репозитория
const repoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
const hooksDir = path.join(repoRoot, '.git', 'hooks');
const sourceHooksDir = path.join(repoRoot, 'hooks');

if (!fs.existsSync(sourceHooksDir)) {
  console.error('Ошибка: директория hooks не найдена');
  process.exit(1);
}

// Создаем директорию для hooks, если её нет
if (!fs.existsSync(hooksDir)) {
  fs.mkdirSync(hooksDir, { recursive: true });
}

// Копируем hooks
const hooks = fs.readdirSync(sourceHooksDir);
let installed = 0;

for (const hook of hooks) {
  const hookPath = path.join(sourceHooksDir, hook);
  const targetPath = path.join(hooksDir, hook);
  
  // Пропускаем README.md и другие не-hook файлы
  if (fs.statSync(hookPath).isFile() && hook !== 'README.md' && !hook.endsWith('.md')) {
    fs.copyFileSync(hookPath, targetPath);
    
    // Устанавливаем права на выполнение (Unix)
    if (process.platform !== 'win32') {
      fs.chmodSync(targetPath, 0o755);
    }
    
    console.log(`✓ Установлен hook: ${hook}`);
    installed++;
  }
}

if (installed > 0) {
  console.log(`✓ Git hooks установлены (${installed} hook${installed > 1 ? 's' : ''})`);
} else {
  console.log('ℹ Hooks уже установлены или не найдены');
}

