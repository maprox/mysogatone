# Скрипт для поиска порогового значения задержки между раундами TLS handshake
# Использует бинарный поиск для определения минимальной задержки, при которой соединение ломается

param(
    [int]$MinDelay = 0,
    [int]$MaxDelay = 10000,
    [string]$TestUrl = "https://mail.ru"
)

Write-Host "🔍 Поиск порогового значения задержки между раундами TLS handshake"
Write-Host "Диапазон: $MinDelay - $MaxDelay мс"
Write-Host "Тестовый URL: $TestUrl"
Write-Host ""

$low = $MinDelay
$high = $MaxDelay
$threshold = -1
$lastWorking = -1

function Test-Connection {
    param([int]$Delay)
    
    Write-Host "🧪 Тестирование с задержкой: $Delay мс"
    
    # Запускаем сервер в фоне
    $env:USE_DELAYED_HANDLER = "true"
    $env:SECOND_ROUND_METADATA_DELAY_MS = "0"
    $env:SECOND_ROUND_UPLOAD_DELAY_MS = "0"
    $env:ROUND_DELAY_MS = "$Delay"
    
    $serverProcess = Start-Process -FilePath "deno" -ArgumentList "run", "--allow-net", "--allow-read", "--allow-write", "--allow-env", "src/main.ts" -PassThru -WindowStyle Hidden
    
    # Ждем запуска сервера
    Start-Sleep -Seconds 3
    
    try {
        # Выполняем тестовый запрос
        $result = curl.exe --proxy socks5://127.0.0.1:1080 $TestUrl 2>&1
        $success = $LASTEXITCODE -eq 0 -and $result -notmatch "failed to receive handshake"
        
        if ($success) {
            Write-Host "✅ Соединение работает с задержкой $Delay мс" -ForegroundColor Green
            return $true
        } else {
            Write-Host "❌ Соединение не работает с задержкой $Delay мс" -ForegroundColor Red
            return $false
        }
    } finally {
        # Останавливаем сервер
        Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
    }
}

# Бинарный поиск
while ($low -le $high) {
    $mid = [math]::Floor(($low + $high) / 2)
    
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    Write-Host "Тест #$(([math]::Log($high - $low + 1) / [math]::Log(2))): $mid мс (диапазон: $low - $high)"
    
    if (Test-Connection -Delay $mid) {
        $lastWorking = $mid
        $low = $mid + 1
        Write-Host "✅ Работает, увеличиваем нижнюю границу до $low" -ForegroundColor Green
    } else {
        $high = $mid - 1
        Write-Host "❌ Не работает, уменьшаем верхнюю границу до $high" -ForegroundColor Red
    }
    
    Write-Host ""
    Start-Sleep -Seconds 2
}

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host "🎯 РЕЗУЛЬТАТ:" -ForegroundColor Cyan
if ($lastWorking -ge 0) {
    Write-Host "Максимальная задержка, при которой соединение работает: $lastWorking мс" -ForegroundColor Green
    Write-Host "Минимальная задержка, при которой соединение ломается: $($lastWorking + 1) мс" -ForegroundColor Red
    Write-Host ""
    Write-Host "Пороговое значение: ~$($lastWorking + 1) мс" -ForegroundColor Yellow
} else {
    Write-Host "Соединение не работает даже с минимальной задержкой ($MinDelay мс)" -ForegroundColor Red
}

