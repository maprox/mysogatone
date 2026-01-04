# Упрощенный скрипт для поиска порогового значения задержки
# Тестирует значения с шагом и находит порог

param(
    [int]$StartDelay = 0,
    [int]$EndDelay = 10000,
    [int]$Step = 200,
    [string]$TestUrl = "https://mail.ru",
    [int]$ServerStartDelay = 3,
    [int]$TestTimeout = 10
)

Write-Host "🔍 Поиск порогового значения задержки между раундами"
Write-Host "Диапазон: $StartDelay - $EndDelay мс, шаг: $Step мс"
Write-Host ""

$lastWorking = -1
$firstBroken = -1

for ($delay = $StartDelay; $delay -le $EndDelay; $delay += $Step) {
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    Write-Host "🧪 Тестирование с задержкой: $delay мс"
    
    # Запускаем сервер
    $env:USE_DELAYED_HANDLER = "true"
    $env:SECOND_ROUND_METADATA_DELAY_MS = "0"
    $env:SECOND_ROUND_UPLOAD_DELAY_MS = "0"
    $env:ROUND_DELAY_MS = "$delay"
    
    # Переходим в директорию callers/deno
    Push-Location "$PSScriptRoot\.."
    
    $serverProcess = Start-Process -FilePath "deno" `
        -ArgumentList "run", "--allow-net", "--allow-read", "--allow-write", "--allow-env", "src/main.ts" `
        -PassThru -WindowStyle Hidden -NoNewWindow
    
    # Ждем запуска сервера
    Start-Sleep -Seconds $ServerStartDelay
    
    # Проверяем, что сервер запустился
    $serverRunning = $false
    for ($i = 0; $i -lt 5; $i++) {
        try {
            $testConn = Test-NetConnection -ComputerName 127.0.0.1 -Port 1080 -InformationLevel Quiet -WarningAction SilentlyContinue
            if ($testConn) {
                $serverRunning = $true
                break
            }
        } catch {
            # Игнорируем ошибки
        }
        Start-Sleep -Seconds 1
    }
    
    if (-not $serverRunning) {
        Write-Host "⚠️  Сервер не запустился, пропускаем тест" -ForegroundColor Yellow
        Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
        Pop-Location
        continue
    }
    
    try {
        # Тестовый запрос с таймаутом
        $job = Start-Job -ScriptBlock {
            param($url)
            $result = curl.exe --proxy socks5://127.0.0.1:1080 $url 2>&1
            return @{
                ExitCode = $LASTEXITCODE
                Output = $result
            }
        } -ArgumentList $TestUrl
        
        $result = Wait-Job -Job $job -Timeout $TestTimeout | Receive-Job
        Remove-Job -Job $job -Force
        
        if ($result) {
            $success = $result.ExitCode -eq 0 -and `
                      $result.Output -notmatch "failed to receive handshake" -and `
                      $result.Output -notmatch "SSL/TLS connection failed" -and `
                      $result.Output -notmatch "schannel"
            
            if ($success) {
                Write-Host "✅ Работает" -ForegroundColor Green
                $lastWorking = $delay
            } else {
                Write-Host "❌ Не работает" -ForegroundColor Red
                if ($firstBroken -eq -1) {
                    $firstBroken = $delay
                    Write-Host ""
                    Write-Host "🎯 ПОРОГ НАЙДЕН!" -ForegroundColor Yellow
                    Write-Host "Последнее рабочее значение: $lastWorking мс" -ForegroundColor Green
                    Write-Host "Первое нерабочее значение: $firstBroken мс" -ForegroundColor Red
                    Write-Host ""
                    Write-Host "Пороговое значение: между $lastWorking и $firstBroken мс"
                    break
                }
            }
        } else {
            Write-Host "⏰ Таймаут теста" -ForegroundColor Yellow
            if ($firstBroken -eq -1) {
                $firstBroken = $delay
            }
        }
    } finally {
        Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
        Pop-Location
    }
    
    Write-Host ""
}

if ($firstBroken -eq -1) {
    Write-Host "⚠️  Порог не найден в диапазоне $StartDelay - $EndDelay мс"
    Write-Host "Попробуйте увеличить EndDelay или уменьшить Step"
}

