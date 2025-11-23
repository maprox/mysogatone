# Script to collect logs in convenient format for analysis
# Creates summary file with CALLER and LISTENER logs

param(
    [string]$CallerLog = "",
    [string]$ListenerLog = "",
    [string]$OutputFile = "logs\analysis-$(Get-Date -Format 'yyyyMMdd-HHmmss').txt"
)

Write-Host "Collecting logs for analysis..." -ForegroundColor Cyan

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
    Write-Host "[ERROR] CALLER log file not found" -ForegroundColor Red
    exit 1
}

if ([string]::IsNullOrEmpty($ListenerLog) -or -not (Test-Path $ListenerLog)) {
    Write-Host "[ERROR] LISTENER log file not found" -ForegroundColor Red
    exit 1
}

# Create summary file
$output = @"
========================================
MYSOGATONE SYSTEM LOG ANALYSIS
========================================
Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')

LOG FILES:
  CALLER:   $CallerLog
  LISTENER: $ListenerLog

========================================
CALLER LOGS
========================================

"@

if (Test-Path $CallerLog) {
    $callerContent = Get-Content $CallerLog -ErrorAction SilentlyContinue
    if ($callerContent) {
        $output += $callerContent -join "`n"
    } else {
        $output += "(file is empty)"
    }
} else {
    $output += "(file not found)"
}

$output += @"

========================================
LISTENER LOGS
========================================

"@

if (Test-Path $ListenerLog) {
    $listenerContent = Get-Content $ListenerLog -ErrorAction SilentlyContinue
    if ($listenerContent) {
        $output += $listenerContent -join "`n"
    } else {
        $output += "(file is empty)"
    }
} else {
    $output += "(file not found)"
}

$output += @"

========================================
END OF LOGS
========================================
"@

# Save to file
$outputDir = Split-Path -Parent $OutputFile
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
}

$output | Out-File -FilePath $OutputFile -Encoding UTF8

Write-Host "[OK] Logs collected to file:" -ForegroundColor Green
Write-Host "  $OutputFile" -ForegroundColor White
Write-Host ""
Write-Host "Open this file and copy its contents for analysis" -ForegroundColor Cyan
