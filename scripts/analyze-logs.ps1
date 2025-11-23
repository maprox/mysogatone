# Script for analyzing CALLER and LISTENER logs
# Helps find problems in system operation

param(
    [string]$CallerLog = "",
    [string]$ListenerLog = ""
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Log Analysis" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Find latest logs if not specified
if ([string]::IsNullOrEmpty($CallerLog) -or [string]::IsNullOrEmpty($ListenerLog)) {
    $logDir = "logs"
    if (Test-Path $logDir) {
        $latestCaller = Get-ChildItem "$logDir\caller-*.log" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        $latestListener = Get-ChildItem "$logDir\listener-*.log" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
        
        if ($latestCaller) { $CallerLog = $latestCaller.FullName }
        if ($latestListener) { $ListenerLog = $latestListener.FullName }
    }
}

if ([string]::IsNullOrEmpty($CallerLog) -or -not (Test-Path $CallerLog)) {
    Write-Host "[ERROR] CALLER log file not found: $CallerLog" -ForegroundColor Red
    exit 1
}

if ([string]::IsNullOrEmpty($ListenerLog) -or -not (Test-Path $ListenerLog)) {
    Write-Host "[ERROR] LISTENER log file not found: $ListenerLog" -ForegroundColor Red
    exit 1
}

Write-Host "Analyzing logs:" -ForegroundColor Cyan
Write-Host "  CALLER:   $CallerLog" -ForegroundColor White
Write-Host "  LISTENER: $ListenerLog" -ForegroundColor White
Write-Host ""

# Analyze CALLER
Write-Host "=== CALLER ANALYSIS ===" -ForegroundColor Cyan
$callerContent = Get-Content $CallerLog -ErrorAction SilentlyContinue

if ($callerContent) {
    # Count events
    $connections = ($callerContent | Select-String "New connection").Count
    $handshakes = ($callerContent | Select-String "Handshake успешен").Count
    $connects = ($callerContent | Select-String "CONNECT запрос обработан успешно").Count
    $dataReceived = ($callerContent | Select-String "Получены данные от клиента").Count
    $filesCreated = ($callerContent | Select-String "Файл данных создан").Count
    $pollingStarted = ($callerContent | Select-String "Начало polling").Count
    $responsesReceived = ($callerContent | Select-String "Получен ответ").Count
    
    Write-Host "  Connections: $connections" -ForegroundColor White
    Write-Host "  Successful handshakes: $handshakes" -ForegroundColor White
    Write-Host "  CONNECT requests: $connects" -ForegroundColor White
    Write-Host "  Data received from client: $dataReceived" -ForegroundColor White
    Write-Host "  Data files created: $filesCreated" -ForegroundColor White
    Write-Host "  Polling started: $pollingStarted" -ForegroundColor White
    Write-Host "  Responses received: $responsesReceived" -ForegroundColor White
    
    # Find errors
    $errors = $callerContent | Select-String "ERROR|Error|Ошибка|\[ERROR\]" -CaseSensitive:$false
    if ($errors) {
        Write-Host "`n  [WARNING] Found errors: $($errors.Count)" -ForegroundColor Yellow
        $errors | Select-Object -First 5 | ForEach-Object {
            Write-Host "    $_" -ForegroundColor Red
        }
    }
    
    # Last lines
    Write-Host "`n  Last 10 lines:" -ForegroundColor Gray
    $callerContent | Select-Object -Last 10 | ForEach-Object {
        Write-Host "    $_" -ForegroundColor Gray
    }
} else {
    Write-Host "  [WARNING] CALLER logs are empty" -ForegroundColor Yellow
}

Write-Host ""

# Analyze LISTENER
Write-Host "=== LISTENER ANALYSIS ===" -ForegroundColor Cyan
$listenerContent = Get-Content $ListenerLog -ErrorAction SilentlyContinue

if ($listenerContent) {
    # Count events
    $requestsFound = ($listenerContent | Select-String "Обнаружен новый запрос").Count
    $requestsProcessed = ($listenerContent | Select-String "Начинаем обработку запроса").Count
    $metadataRead = ($listenerContent | Select-String "Метаданные прочитаны").Count
    $dataRead = ($listenerContent | Select-String "Данные прочитаны").Count
    $connectionsEstablished = ($listenerContent | Select-String "Соединение установлено").Count
    $dataSent = ($listenerContent | Select-String "Данные отправлены успешно").Count
    $responsesWritten = ($listenerContent | Select-String "Ответ записан").Count
    
    Write-Host "  Requests found: $requestsFound" -ForegroundColor White
    Write-Host "  Requests processed: $requestsProcessed" -ForegroundColor White
    Write-Host "  Metadata read: $metadataRead" -ForegroundColor White
    Write-Host "  Data read: $dataRead" -ForegroundColor White
    Write-Host "  Connections established: $connectionsEstablished" -ForegroundColor White
    Write-Host "  Data sent: $dataSent" -ForegroundColor White
    Write-Host "  Responses written: $responsesWritten" -ForegroundColor White
    
    # Find data file waiting
    $waitingForData = $listenerContent | Select-String "файл данных.*еще не найден|ожидание"
    if ($waitingForData) {
        Write-Host "`n  [WARNING] Found data file waits: $($waitingForData.Count)" -ForegroundColor Yellow
        $waitingForData | Select-Object -Last 5 | ForEach-Object {
            Write-Host "    $_" -ForegroundColor Yellow
        }
    }
    
    # Find errors
    $errors = $listenerContent | Select-String "ERROR|Error|Ошибка|\[ERROR\]" -CaseSensitive:$false
    if ($errors) {
        Write-Host "`n  [WARNING] Found errors: $($errors.Count)" -ForegroundColor Yellow
        $errors | Select-Object -First 5 | ForEach-Object {
            Write-Host "    $_" -ForegroundColor Red
        }
    }
    
    # Last lines
    Write-Host "`n  Last 10 lines:" -ForegroundColor Gray
    $listenerContent | Select-Object -Last 10 | ForEach-Object {
        Write-Host "    $_" -ForegroundColor Gray
    }
} else {
    Write-Host "  [WARNING] LISTENER logs are empty" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=== RECOMMENDATIONS ===" -ForegroundColor Cyan

# Check synchronization
if ($filesCreated -gt 0 -and $dataRead -eq 0) {
    Write-Host "  [WARNING] CALLER creates data files but LISTENER doesn't read them" -ForegroundColor Yellow
    Write-Host "     Check that LISTENER sees files in storage" -ForegroundColor Yellow
}

if ($dataSent -gt 0 -and $responsesWritten -eq 0) {
    Write-Host "  [WARNING] LISTENER sends data to server but doesn't receive responses" -ForegroundColor Yellow
    Write-Host "     Possibly TLS handshake or timeout issue" -ForegroundColor Yellow
}

if ($responsesWritten -gt 0 -and $responsesReceived -eq 0) {
    Write-Host "  [WARNING] LISTENER creates responses but CALLER doesn't receive them" -ForegroundColor Yellow
    Write-Host "     Check CALLER polling mechanism" -ForegroundColor Yellow
}

Write-Host ""
