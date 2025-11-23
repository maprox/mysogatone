# Script for automatic testing of full system
# Launches CALLER and LISTENER with logging to files

param(
    [string]$Token = "",
    [int]$CallerPort = 1080
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Automatic System Testing" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check token
if ([string]::IsNullOrEmpty($Token)) {
    $Token = $env:YANDEX_DISK_TOKEN
}

if ([string]::IsNullOrEmpty($Token)) {
    Write-Host "[ERROR] YANDEX_DISK_TOKEN is not set!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Set token:" -ForegroundColor Yellow
    Write-Host "  `$env:YANDEX_DISK_TOKEN='your_token'" -ForegroundColor Yellow
    Write-Host "  Or pass via parameter: .\test-full-system.ps1 -Token 'your_token'" -ForegroundColor Yellow
    exit 1
}

# Create logs directory
# Get the directory where the script is located, then go up one level to project root
$scriptPath = $MyInvocation.MyCommand.Path
if ($scriptPath) {
    $scriptDir = Split-Path -Parent $scriptPath
    $projectRoot = Split-Path -Parent $scriptDir
} else {
    $projectRoot = Get-Location
}
$logDir = Join-Path $projectRoot "logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$callerLog = Join-Path $logDir "caller-$timestamp.log"
$listenerLog = Join-Path $logDir "listener-$timestamp.log"

Write-Host "Logs will be saved to:" -ForegroundColor Cyan
Write-Host "  CALLER:   $callerLog" -ForegroundColor White
Write-Host "  LISTENER: $listenerLog" -ForegroundColor White
Write-Host ""

# Set environment variables
$env:YANDEX_DISK_TOKEN = $Token
$env:SOCKS5_PORT = $CallerPort.ToString()

# Find deno executable
try {
    $denoCmd = Get-Command deno -ErrorAction Stop
    $denoPath = $denoCmd.Source
    # If it's a PowerShell script, try to find the actual exe
    if ($denoPath -like "*.ps1") {
        $denoExe = "$env:USERPROFILE\.deno\bin\deno.exe"
        if (Test-Path $denoExe) {
            $denoPath = $denoExe
        } else {
            # Try to get the actual exe from the script location
            $denoPath = "deno.exe"
        }
    }
} catch {
    # Try common locations
    $denoPath = "$env:USERPROFILE\.deno\bin\deno.exe"
    if (-not (Test-Path $denoPath)) {
        $denoPath = "deno.exe"
    }
}

Write-Host "Using deno: $denoPath" -ForegroundColor Gray

Write-Host "Starting LISTENER..." -ForegroundColor Cyan
# Ensure log directory exists
$logDirParent = Split-Path -Parent $listenerLog
if (-not (Test-Path $logDirParent)) {
    New-Item -ItemType Directory -Path $logDirParent -Force | Out-Null
}

$listenerStartInfo = New-Object System.Diagnostics.ProcessStartInfo
$listenerStartInfo.FileName = $denoPath
$listenerStartInfo.Arguments = "task start"
$listenerWorkingDir = Join-Path $projectRoot "listeners\yandex-disk"
$listenerStartInfo.WorkingDirectory = $listenerWorkingDir
$listenerStartInfo.UseShellExecute = $false
$listenerStartInfo.RedirectStandardOutput = $true
$listenerStartInfo.RedirectStandardError = $true
$listenerStartInfo.CreateNoWindow = $true
$listenerProcess = New-Object System.Diagnostics.Process
$listenerProcess.StartInfo = $listenerStartInfo

# Redirect to files
$listenerOutputFile = [System.IO.File]::CreateText($listenerLog)
$listenerErrorFile = [System.IO.File]::CreateText("$listenerLog.err")

$listenerProcess.add_OutputDataReceived({
    param($sender, $e)
    if ($e.Data) {
        $listenerOutputFile.WriteLine($e.Data)
        $listenerOutputFile.Flush()
    }
})

$listenerProcess.add_ErrorDataReceived({
    param($sender, $e)
    if ($e.Data) {
        $listenerErrorFile.WriteLine($e.Data)
        $listenerErrorFile.Flush()
    }
})

$listenerProcess.Start() | Out-Null
$listenerProcess.BeginOutputReadLine()
$listenerProcess.BeginErrorReadLine()

Write-Host "Waiting for LISTENER to start (3 seconds)..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

Write-Host "Starting CALLER..." -ForegroundColor Cyan
# Ensure log directory exists
$logDirParent = Split-Path -Parent $callerLog
if (-not (Test-Path $logDirParent)) {
    New-Item -ItemType Directory -Path $logDirParent -Force | Out-Null
}

$callerStartInfo = New-Object System.Diagnostics.ProcessStartInfo
$callerStartInfo.FileName = $denoPath
$callerStartInfo.Arguments = "task start"
$callerWorkingDir = Join-Path $projectRoot "callers\deno"
$callerStartInfo.WorkingDirectory = $callerWorkingDir
$callerStartInfo.UseShellExecute = $false
$callerStartInfo.RedirectStandardOutput = $true
$callerStartInfo.RedirectStandardError = $true
$callerStartInfo.CreateNoWindow = $true
$callerProcess = New-Object System.Diagnostics.Process
$callerProcess.StartInfo = $callerStartInfo

# Redirect to files
$callerOutputFile = [System.IO.File]::CreateText($callerLog)
$callerErrorFile = [System.IO.File]::CreateText("$callerLog.err")

$callerProcess.add_OutputDataReceived({
    param($sender, $e)
    if ($e.Data) {
        $callerOutputFile.WriteLine($e.Data)
        $callerOutputFile.Flush()
    }
})

$callerProcess.add_ErrorDataReceived({
    param($sender, $e)
    if ($e.Data) {
        $callerErrorFile.WriteLine($e.Data)
        $callerErrorFile.Flush()
    }
})

$callerProcess.Start() | Out-Null
$callerProcess.BeginOutputReadLine()
$callerProcess.BeginErrorReadLine()

Write-Host "Waiting for CALLER to start (3 seconds)..." -ForegroundColor Yellow
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "[OK] System started!" -ForegroundColor Green
Write-Host ""
Write-Host "CALLER listening on port $CallerPort" -ForegroundColor White
Write-Host "LISTENER monitoring Yandex Disk" -ForegroundColor White
Write-Host ""
Write-Host "Configure proxy in browser to 127.0.0.1:$CallerPort (SOCKS5)" -ForegroundColor Yellow
Write-Host "Or use: curl.exe --proxy socks5://127.0.0.1:$CallerPort https://ya.ru" -ForegroundColor Yellow
Write-Host ""
Write-Host "Press Ctrl+C to stop" -ForegroundColor Yellow
Write-Host ""
Write-Host "After testing, run log analysis:" -ForegroundColor Cyan
Write-Host "  .\scripts\analyze-logs.ps1" -ForegroundColor White
Write-Host ""
Write-Host "Or share logs for analysis:" -ForegroundColor Cyan
Write-Host "  $callerLog" -ForegroundColor White
Write-Host "  $listenerLog" -ForegroundColor White
Write-Host ""

# Function to read latest log lines
function Show-LatestLogs {
    param([string]$LogFile, [string]$Name, [int]$Lines = 10)
    
    $allContent = @()
    if (Test-Path $LogFile) {
        $allContent += Get-Content $LogFile -Tail $Lines -ErrorAction SilentlyContinue
    }
    $errFile = "$LogFile.err"
    if (Test-Path $errFile) {
        $allContent += Get-Content $errFile -Tail $Lines -ErrorAction SilentlyContinue
    }
    
    if ($allContent) {
        Write-Host "`n=== Last $Lines lines from $Name ===" -ForegroundColor Cyan
        $allContent | Select-Object -Last $Lines | ForEach-Object { Write-Host $_ }
    }
}

# Wait and periodically show logs
try {
    $iteration = 0
    while ($true) {
        Start-Sleep -Seconds 5
        $iteration++
        
        if ($iteration % 6 -eq 0) { # Every 30 seconds
            Write-Host "`n[Checking logs after $($iteration * 5) seconds...]" -ForegroundColor Gray
            Show-LatestLogs -LogFile $callerLog -Name "CALLER" -Lines 5
            Show-LatestLogs -LogFile $listenerLog -Name "LISTENER" -Lines 5
        }
    }
} finally {
    Write-Host "`nStopping processes..." -ForegroundColor Yellow
    
    # Close file streams
    if ($callerOutputFile) { 
        $callerProcess.CancelOutputRead()
        $callerOutputFile.Close() 
    }
    if ($callerErrorFile) { 
        $callerProcess.CancelErrorRead()
        $callerErrorFile.Close() 
    }
    if ($listenerOutputFile) { 
        $listenerProcess.CancelOutputRead()
        $listenerOutputFile.Close() 
    }
    if ($listenerErrorFile) { 
        $listenerProcess.CancelErrorRead()
        $listenerErrorFile.Close() 
    }
    
    if ($callerProcess -and -not $callerProcess.HasExited) {
        Stop-Process -Id $callerProcess.Id -Force -ErrorAction SilentlyContinue
    }
    
    if ($listenerProcess -and -not $listenerProcess.HasExited) {
        Stop-Process -Id $listenerProcess.Id -Force -ErrorAction SilentlyContinue
    }
    
    Write-Host "[OK] Processes stopped" -ForegroundColor Green
    Write-Host ""
    Write-Host "Logs saved to:" -ForegroundColor Cyan
    Write-Host "  $callerLog" -ForegroundColor White
    Write-Host "  $listenerLog" -ForegroundColor White
    Write-Host ""
    Write-Host "Note: Error logs are in .err files" -ForegroundColor Gray
    
    # Merge error logs into main logs
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
    
    # Note: stderr is already merged into main logs via 2>&1
}
