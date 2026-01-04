# Автоматическое тестирование HTTPS соединений
# Запускает LISTENER и CALLER, выполняет HTTPS запрос и анализирует результаты

param(
    [string]$Token = $env:YANDEX_DISK_TOKEN,
    [int]$CallerPort = 1080,
    [int]$WaitTime = 30,
    [switch]$UseDirectHandler = $false
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Automated HTTPS Testing" -ForegroundColor Cyan
if ($UseDirectHandler) {
    Write-Host "  Mode: Direct TCP (no file system)" -ForegroundColor Yellow
} else {
    Write-Host "  Mode: File system (Yandex Disk)" -ForegroundColor Yellow
}
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

if ([string]::IsNullOrEmpty($Token)) {
    Write-Host "[ERROR] YANDEX_DISK_TOKEN is not set!" -ForegroundColor Red
    exit 1
}

# Создаем директорию для логов
$logDir = Join-Path $PSScriptRoot "..\logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

$handlerMode = if ($UseDirectHandler) { "direct" } else { "filesystem" }
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$callerLog = Join-Path $logDir "caller-https-test-$handlerMode-$timestamp.log"
$listenerLog = Join-Path $logDir "listener-https-test-$handlerMode-$timestamp.log"
$testLog = Join-Path $logDir "https-test-result-$handlerMode-$timestamp.log"

Write-Host "Logs will be saved to:" -ForegroundColor Cyan
Write-Host "  CALLER:   $callerLog" -ForegroundColor White
Write-Host "  LISTENER: $listenerLog" -ForegroundColor White
Write-Host "  TEST:     $testLog" -ForegroundColor White
Write-Host ""

# Находим deno - используем полный путь к exe
$denoPath = "$env:USERPROFILE\.deno\bin\deno.exe"
if (-not (Test-Path $denoPath)) {
    # Пробуем найти через where
    $whereResult = where.exe deno 2>$null | Select-Object -First 1
    if ($whereResult -and (Test-Path $whereResult)) {
        $denoPath = $whereResult
    } else {
        $denoPath = "deno.exe"
    }
}

Write-Host "Using deno: $denoPath" -ForegroundColor Gray

$projectRoot = Split-Path -Parent $PSScriptRoot

# Устанавливаем переменные окружения
$env:YANDEX_DISK_TOKEN = $Token
$env:SOCKS5_PORT = $CallerPort.ToString()
$env:REQUESTS_FOLDER = ".mysogatone/requests"
$env:RESPONSES_FOLDER = ".mysogatone/responses"
$env:POLL_INTERVAL_MS = "2000"
$env:CONNECTION_TIMEOUT_MS = "60000"

if ($UseDirectHandler) {
    $env:USE_DIRECT_HANDLER = "true"
    Write-Host "Using DirectConnectionHandler (direct TCP, no file system)" -ForegroundColor Cyan
} else {
    $env:USE_DIRECT_HANDLER = "false"
    Write-Host "Using YandexDiskConnectionHandler (via file system)" -ForegroundColor Cyan
}

if (-not $UseDirectHandler) {
    Write-Host "Starting LISTENER..." -ForegroundColor Cyan
    $listenerWorkingDir = Join-Path $projectRoot "listeners\yandex-disk"
    $listenerArgs = "run --allow-net --allow-read --allow-write --allow-env src/main.ts"
    $listenerProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "cd /d `"$listenerWorkingDir`" && $denoPath $listenerArgs > `"$listenerLog`" 2> `"$listenerLog.err`"" -PassThru -NoNewWindow

    Write-Host "Waiting for LISTENER to start (5 seconds)..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5
} else {
    Write-Host "Skipping LISTENER (DirectConnectionHandler doesn't need it)" -ForegroundColor Gray
    $listenerProcess = $null
}

Write-Host "Starting CALLER..." -ForegroundColor Cyan
$callerWorkingDir = Join-Path $projectRoot "callers\deno"
$callerArgs = "run --allow-net --allow-read --allow-write --allow-env src/main.ts"
$callerProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "cd /d `"$callerWorkingDir`" && $denoPath $callerArgs > `"$callerLog`" 2> `"$callerLog.err`"" -PassThru -NoNewWindow

Write-Host "Waiting for CALLER to start (5 seconds)..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

Write-Host ""
if ($UseDirectHandler) {
    Write-Host "[OK] CALLER started with DirectConnectionHandler!" -ForegroundColor Green
} else {
    Write-Host "[OK] System started!" -ForegroundColor Green
}
Write-Host ""

# Выполняем HTTPS запрос
Write-Host "Executing HTTPS request: curl.exe --proxy socks5://127.0.0.1:$CallerPort https://ya.ru" -ForegroundColor Cyan
Write-Host ""

$testStartTime = Get-Date
$curlOutput = ""
$curlError = ""

try {
    $curlProcess = Start-Process -FilePath "curl.exe" -ArgumentList "--proxy", "socks5://127.0.0.1:$CallerPort", "https://ya.ru", "--max-time", "30" -NoNewWindow -Wait -PassThru -RedirectStandardOutput "$testLog.curl" -RedirectStandardError "$testLog.curl.err"
    $curlExitCode = $curlProcess.ExitCode
    
    if (Test-Path "$testLog.curl") {
        $curlOutput = Get-Content "$testLog.curl" -Raw
    }
    if (Test-Path "$testLog.curl.err") {
        $curlError = Get-Content "$testLog.curl.err" -Raw
    }
    
    Write-Host "Curl exit code: $curlExitCode" -ForegroundColor $(if ($curlExitCode -eq 0) { "Green" } else { "Red" })
    if ($curlOutput) {
        Write-Host "Response length: $($curlOutput.Length) bytes" -ForegroundColor White
    }
    if ($curlError) {
        Write-Host "Curl error: $curlError" -ForegroundColor Red
    }
} catch {
    Write-Host "Error executing curl: $_" -ForegroundColor Red
    $curlExitCode = -1
}

Write-Host ""
Write-Host "Waiting for processing ($WaitTime seconds)..." -ForegroundColor Yellow
Start-Sleep -Seconds $WaitTime

Write-Host ""
Write-Host "Stopping processes..." -ForegroundColor Yellow

# Останавливаем процессы
if ($callerProcess -and -not $callerProcess.HasExited) {
    Stop-Process -Id $callerProcess.Id -Force -ErrorAction SilentlyContinue
}
if ($listenerProcess -and -not $listenerProcess.HasExited) {
    Stop-Process -Id $listenerProcess.Id -Force -ErrorAction SilentlyContinue
}

# Файлы закрываются автоматически при завершении процесса

# Объединяем логи ошибок
if (Test-Path "$callerLog.err") {
    Add-Content -Path $callerLog -Value "`n=== STDERR ===" -ErrorAction SilentlyContinue
    Get-Content "$callerLog.err" | Add-Content -Path $callerLog -ErrorAction SilentlyContinue
    Remove-Item "$callerLog.err" -ErrorAction SilentlyContinue
}
if (Test-Path "$listenerLog.err") {
    Add-Content -Path $listenerLog -Value "`n=== STDERR ===" -ErrorAction SilentlyContinue
    Get-Content "$listenerLog.err" | Add-Content -Path $listenerLog -ErrorAction SilentlyContinue
    Remove-Item "$listenerLog.err" -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Test Results" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Анализируем логи
Write-Host "Analyzing logs..." -ForegroundColor Cyan
Write-Host ""

# Проверяем CALLER логи
$callerContent = Get-Content $callerLog -ErrorAction SilentlyContinue
$listenerContent = if (-not $UseDirectHandler) {
    Get-Content $listenerLog -ErrorAction SilentlyContinue
} else {
    @() # Пустой массив для DirectConnectionHandler
}

# Ищем ключевые моменты
$sessionCreated = $callerContent | Select-String -Pattern "Создана сессия.*443|Создание нового TCP соединения для сессии.*443" | Measure-Object
$sessionReused = $callerContent | Select-String -Pattern "первый в сессии: false|Переиспользовано TCP соединение" | Measure-Object
$tcpReused = if (-not $UseDirectHandler) {
    $listenerContent | Select-String -Pattern "переиспользовано: true" | Measure-Object
} else {
    $callerContent | Select-String -Pattern "Переиспользовано TCP соединение" | Measure-Object
}
$connectionKept = if (-not $UseDirectHandler) {
    $listenerContent | Select-String -Pattern "Соединение сохранено для сессии" | Measure-Object
} else {
    # Для DirectConnectionHandler соединения всегда сохраняются в памяти
    $callerContent | Select-String -Pattern "Переиспользовано TCP соединение" | Measure-Object
}
$connectionClosed = if (-not $UseDirectHandler) {
    $listenerContent | Select-String -Pattern "Соединение закрыто" | Measure-Object
} else {
    $callerContent | Select-String -Pattern "Закрыто соединение" | Measure-Object
}
$tlsHandshake = if (-not $UseDirectHandler) {
    $listenerContent | Select-String -Pattern "TLS|ClientHello|ServerHello" | Measure-Object
} else {
    @() # Для DirectConnectionHandler TLS обрабатывается напрямую
}
$multipleRequests = if (-not $UseDirectHandler) {
    $listenerContent | Select-String -Pattern "request-.*443" | Measure-Object
} else {
    @() # Для DirectConnectionHandler нет отдельных запросов
}
$sessionManagerLogs = $callerContent | Select-String -Pattern "SessionManager|DirectConnectionHandler.*сессия" | Measure-Object

Write-Host "=== Key Metrics ===" -ForegroundColor Yellow
Write-Host "  Sessions created for HTTPS (443): $($sessionCreated.Count)" -ForegroundColor White
Write-Host "  Sessions reused: $($sessionReused.Count)" -ForegroundColor White
Write-Host "  TCP connections reused: $($tcpReused.Count)" -ForegroundColor White
Write-Host "  Connections kept alive: $($connectionKept.Count)" -ForegroundColor White
Write-Host "  Connections closed: $($connectionClosed.Count)" -ForegroundColor $(if ($connectionClosed.Count -gt 0) { "Yellow" } else { "Green" })
Write-Host "  Multiple requests to 443: $($multipleRequests.Count)" -ForegroundColor White
Write-Host "  TLS handshake mentions: $($tlsHandshake.Count)" -ForegroundColor White
Write-Host "  SessionManager logs: $($sessionManagerLogs.Count)" -ForegroundColor White
Write-Host ""

# Показываем детали о переиспользовании соединений
Write-Host "=== Connection Reuse Details ===" -ForegroundColor Yellow
$reuseDetails = $listenerContent | Select-String -Pattern "переиспользовано: (true|false)" | Select-Object -First 5
if ($reuseDetails) {
    $reuseDetails | ForEach-Object {
        Write-Host "  $_" -ForegroundColor White
    }
} else {
    Write-Host "  No reuse details found" -ForegroundColor Gray
}
Write-Host ""

# Показываем детали о сохранении соединений
Write-Host "=== Keep-Alive Details ===" -ForegroundColor Yellow
$keepAliveDetails = $listenerContent | Select-String -Pattern "Соединение сохранено|keep-alive: true" | Select-Object -First 5
if ($keepAliveDetails) {
    $keepAliveDetails | ForEach-Object {
        Write-Host "  $_" -ForegroundColor White
    }
} else {
    Write-Host "  No keep-alive details found" -ForegroundColor Gray
}
Write-Host ""

# Проверяем ошибки
$errors = $callerContent + $listenerContent | Select-String -Pattern "ERROR|Error|❌|error" | Measure-Object
Write-Host "=== Errors ===" -ForegroundColor $(if ($errors.Count -gt 0) { "Red" } else { "Green" })
Write-Host "  Total errors: $($errors.Count)" -ForegroundColor White
if ($errors.Count -gt 0) {
    $callerContent + $listenerContent | Select-String -Pattern "ERROR|Error|❌|error" | Select-Object -First 10 | ForEach-Object {
        Write-Host "    $_" -ForegroundColor Red
    }
}
Write-Host ""

# Результат теста
Write-Host "=== Test Result ===" -ForegroundColor Yellow
$testPassed = $true
$issues = @()

if ($curlExitCode -ne 0) {
    $testPassed = $false
    $issues += "Curl failed with exit code $curlExitCode"
}

if ($sessionCreated.Count -eq 0) {
    $testPassed = $false
    $issues += "No HTTPS sessions created"
}

if ($connectionKept.Count -eq 0 -and $sessionCreated.Count -gt 0) {
    $testPassed = $false
    $issues += "Connections not kept alive (expected for HTTPS sessions)"
}

# Проверяем, что соединения не закрываются преждевременно для HTTPS
if ($connectionClosed.Count -gt 0 -and $sessionCreated.Count -gt 0) {
    $closedAfterKeepAlive = $listenerContent | Select-String -Pattern "Соединение закрыто" -Context 2,2 | Where-Object { $_.Context.PreContext -match "keep-alive: true" -or $_.Context.PostContext -match "keep-alive: true" }
    if ($closedAfterKeepAlive) {
        $testPassed = $false
        $issues += "Connections closed even with keep-alive=true (this is a bug!)"
    }
}

# Проверяем множественные раунды TLS handshake
if ($multipleRequests.Count -lt 2 -and $sessionCreated.Count -gt 0) {
    Write-Host "  ⚠️  Warning: Only $($multipleRequests.Count) request(s) to 443 - TLS handshake may require multiple rounds" -ForegroundColor Yellow
}

if ($testPassed) {
    Write-Host "  ✅ HTTPS test PASSED" -ForegroundColor Green
} else {
    Write-Host "  ❌ HTTPS test FAILED" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Issues found:" -ForegroundColor Yellow
    $issues | ForEach-Object {
        Write-Host "    - $_" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "Logs saved to:" -ForegroundColor Cyan
Write-Host "  $callerLog" -ForegroundColor White
Write-Host "  $listenerLog" -ForegroundColor White
Write-Host "  $testLog" -ForegroundColor White
Write-Host ""

# Сохраняем сводку
$summary = @"
HTTPS Test Summary - $(Get-Date)
========================================
Curl Exit Code: $curlExitCode
Sessions Created: $($sessionCreated.Count)
Sessions Reused: $($sessionReused.Count)
TCP Reused: $($tcpReused.Count)
Connections Kept Alive: $($connectionKept.Count)
TLS Handshake Mentions: $($tlsHandshake.Count)
Errors: $($errors.Count)
Test Result: $(if ($testPassed) { "PASSED" } else { "FAILED" })

Issues:
$($issues -join "`n")

"@

$summary | Out-File -FilePath $testLog -Encoding UTF8

Write-Host "Summary saved to: $testLog" -ForegroundColor Cyan
Write-Host ""
