# Простой скрипт для тестирования одного значения задержки

param(
    [int]$Delay = 0
)

Write-Host "Тестирование задержки: $Delay мс"

$env:USE_DELAYED_HANDLER = "true"
$env:SECOND_ROUND_METADATA_DELAY_MS = "0"
$env:SECOND_ROUND_UPLOAD_DELAY_MS = "0"
$env:ROUND_DELAY_MS = "$Delay"

Write-Host "Запустите сервер вручную:"
Write-Host "  deno task start"
Write-Host ""
Write-Host "Затем в другом терминале выполните:"
Write-Host "  curl.exe --proxy socks5://127.0.0.1:1080 https://mail.ru"
Write-Host ""
Write-Host "Если соединение работает - задержка $Delay мс допустима"
Write-Host "Если соединение не работает - задержка $Delay мс превышает порог"

