# Скрипт для поиска порогового значения задержки между раундами TLS handshake

param(
    [int]$StartDelay = 0,
    [int]$EndDelay = 10000,
    [int]$Step = 200,
    [string]$TestUrl = "https://mail.ru"
)

$ErrorActionPreference = "Continue"

Write-Host "Поиск порогового значения задержки между раундами TLS handshake"
Write-Host "Диапазон: $StartDelay - $EndDelay мс, шаг: $Step мс"
Write-Host "Тестовый URL: $TestUrl"
Write-Host ""

# Переходим в директорию callers/deno
$originalLocation = Get-Location
$denoDir = Join-Path $PSScriptRoot ".."
Set-Location $denoDir

$lastWorking = -1
$firstBroken = -1

try {
    for ($delay = $StartDelay; $delay -le $EndDelay; $delay += $Step) {
        Write-Host "========================================"
        Write-Host "Тестирование с задержкой: $delay мс"
        
        # Устанавливаем переменные окружения
        $env:USE_DELAYED_HANDLER = "true"
        $env:SECOND_ROUND_METADATA_DELAY_MS = "0"
        $env:SECOND_ROUND_UPLOAD_DELAY_MS = "0"
        $env:ROUND_DELAY_MS = "$delay"
        
        # Запускаем сервер
        $denoPath = "deno"
        if (Test-Path "C:\Users\sunsa\.deno\bin\deno.exe") {
            $denoPath = "C:\Users\sunsa\.deno\bin\deno.exe"
        }
        
        $serverProcess = Start-Process -FilePath $denoPath `
            -ArgumentList "run", "--allow-net", "--allow-read", "--allow-write", "--allow-env", "src/main.ts" `
            -PassThru -WindowStyle Hidden -WorkingDirectory $denoDir
        
        # Ждем запуска сервера
        Start-Sleep -Seconds 3
        
        try {
            # Тестовый запрос
            $curlOutput = curl.exe --proxy socks5://127.0.0.1:1080 $TestUrl 2>&1
            $curlExitCode = $LASTEXITCODE
            
            $success = $curlExitCode -eq 0 -and `
                      $curlOutput -notmatch "failed to receive handshake" -and `
                      $curlOutput -notmatch "SSL/TLS connection failed" -and `
                      $curlOutput -notmatch "schannel"
            
            if ($success) {
                Write-Host "[OK] Работает" -ForegroundColor Green
                $lastWorking = $delay
            } else {
                Write-Host "[FAIL] Не работает (exit code: $curlExitCode)" -ForegroundColor Red
                if ($firstBroken -eq -1) {
                    $firstBroken = $delay
                    Write-Host ""
                    Write-Host "ПОРОГ НАЙДЕН!" -ForegroundColor Yellow
                    Write-Host "Последнее рабочее значение: $lastWorking мс" -ForegroundColor Green
                    Write-Host "Первое нерабочее значение: $firstBroken мс" -ForegroundColor Red
                    Write-Host ""
                    Write-Host "Пороговое значение: между $lastWorking и $firstBroken мс"
                    
                    # Уточняем порог с меньшим шагом
                    if ($lastWorking -ge 0) {
                        Write-Host ""
                        Write-Host "Уточнение порога с шагом 50мс..."
                        $refinedStep = 50
                        for ($refinedDelay = $lastWorking; $refinedDelay -lt $firstBroken; $refinedDelay += $refinedStep) {
                            Write-Host "  Тест: $refinedDelay мс" -NoNewline
                            
                            $env:ROUND_DELAY_MS = "$refinedDelay"
                            $refinedServer = Start-Process -FilePath $denoPath `
                                -ArgumentList "run", "--allow-net", "--allow-read", "--allow-write", "--allow-env", "src/main.ts" `
                                -PassThru -WindowStyle Hidden -WorkingDirectory $denoDir
                            
                            Start-Sleep -Seconds 3
                            
                            $refinedOutput = curl.exe --proxy socks5://127.0.0.1:1080 $TestUrl 2>&1
                            $refinedSuccess = $LASTEXITCODE -eq 0 -and `
                                            $refinedOutput -notmatch "failed to receive handshake" -and `
                                            $refinedOutput -notmatch "SSL/TLS connection failed"
                            
                            Stop-Process -Id $refinedServer.Id -Force -ErrorAction SilentlyContinue
                            Get-Process -Name "deno" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
                            Start-Sleep -Seconds 1
                            
                            if ($refinedSuccess) {
                                Write-Host " [OK]" -ForegroundColor Green
                                $lastWorking = $refinedDelay
                            } else {
                                Write-Host " [FAIL]" -ForegroundColor Red
                                $firstBroken = $refinedDelay
                                break
                            }
                        }
                    }
                    
                    Write-Host ""
                    Write-Host "========================================"
                    Write-Host "ФИНАЛЬНЫЙ РЕЗУЛЬТАТ:" -ForegroundColor Cyan
                    Write-Host "Максимальная задержка, при которой работает: $lastWorking мс" -ForegroundColor Green
                    Write-Host "Минимальная задержка, при которой ломается: $firstBroken мс" -ForegroundColor Red
                    if ($lastWorking -ge 0) {
                        $threshold = [math]::Round(($lastWorking + $firstBroken) / 2)
                        Write-Host "Пороговое значение: ~$threshold мс" -ForegroundColor Yellow
                    }
                    break
                }
            }
        } finally {
            if ($serverProcess) {
                Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
            }
            # Убиваем все процессы deno на случай, если что-то осталось
            Get-Process -Name "deno" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 1
        }
        
        Write-Host ""
    }
} finally {
    Set-Location $originalLocation
}

if ($firstBroken -eq -1) {
    Write-Host "Порог не найден в диапазоне $StartDelay - $EndDelay мс"
    Write-Host "Попробуйте увеличить EndDelay"
}
