# Упрощенный скрипт для поиска порога - тестирует значения по очереди

param(
    [int]$StartDelay = 0,
    [int]$EndDelay = 10000,
    [int]$Step = 500
)

Write-Host "Поиск порогового значения задержки"
Write-Host "Диапазон: $StartDelay - $EndDelay мс, шаг: $Step мс"
Write-Host ""
Write-Host "Для каждого значения:"
Write-Host "1. Установите переменные окружения"
Write-Host "2. Запустите сервер: deno task start"
Write-Host "3. В другом терминале: curl.exe --proxy socks5://127.0.0.1:1080 https://mail.ru"
Write-Host "4. Остановите сервер (Ctrl+C)"
Write-Host "5. Перейдите к следующему значению"
Write-Host ""
Write-Host "========================================"
Write-Host ""

$lastWorking = -1
$firstBroken = -1

for ($delay = $StartDelay; $delay -le $EndDelay; $delay += $Step) {
    Write-Host "Тест #$((($delay - $StartDelay) / $Step) + 1): $delay мс"
    Write-Host "Команды для теста:"
    Write-Host "  `$env:USE_DELAYED_HANDLER='true'"
    Write-Host "  `$env:SECOND_ROUND_METADATA_DELAY_MS='0'"
    Write-Host "  `$env:SECOND_ROUND_UPLOAD_DELAY_MS='0'"
    Write-Host "  `$env:ROUND_DELAY_MS='$delay'"
    Write-Host "  deno task start"
    Write-Host ""
    Write-Host "Результат: [ ] Работает  [ ] Не работает"
    Write-Host ""
    Write-Host "Нажмите Enter для следующего теста..."
    Read-Host
}

