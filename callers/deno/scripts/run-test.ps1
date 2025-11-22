# Скрипт для запуска SOCKS5 сервера и теста
# Использование: .\scripts\run-test.ps1

Write-Host "🚀 Запуск SOCKS5 сервера..." -ForegroundColor Green

# Запускаем сервер в фоне
$serverJob = Start-Job -ScriptBlock {
    Set-Location $using:PWD
    deno run --allow-net --allow-read --allow-write --allow-env src\main.ts
}

# Ждем запуска сервера
Write-Host "⏳ Ожидание запуска сервера..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

# Проверяем, что сервер запущен
$portCheck = netstat -an | Select-String ":1080"
if (-not $portCheck) {
    Write-Host "❌ Сервер не запустился на порту 1080" -ForegroundColor Red
    Stop-Job $serverJob
    Remove-Job $serverJob
    exit 1
}

Write-Host "✅ Сервер запущен" -ForegroundColor Green
Write-Host "🧪 Запуск теста..." -ForegroundColor Cyan

# Запускаем тест
$env:TARGET_HOST = "ya.ru"
$env:TARGET_PORT = "80"
deno run --allow-net --allow-env scripts\test-socks5-server.ts

# Останавливаем сервер
Write-Host "🛑 Остановка сервера..." -ForegroundColor Yellow
Stop-Job $serverJob
Remove-Job $serverJob

Write-Host "✅ Готово!" -ForegroundColor Green

