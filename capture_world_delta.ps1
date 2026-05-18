# capture_world_delta.ps1 - clipboard -> world_delta.yaml -> apply_delta.bat
$ClaudeProjectUrl = "https://claude.ai"

$VAULT = Split-Path -Parent $MyInvocation.MyCommand.Path
$ErrorLog = Join-Path $VAULT "last_capture_world_delta_error.txt"

function WriteErrLog {
    param([string]$Text)
    $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "[$stamp]`r`n$Text" | Out-File -LiteralPath $ErrorLog -Encoding utf8 -Force
}

function WaitDone {
    param([string]$Message = "Press Enter to close this window (then you can open last_capture_world_delta_error.txt if needed)")
    Write-Host ""
    Write-Host $Message
    try {
        Read-Host | Out-Null
    } catch {
        Start-Sleep -Seconds 90
    }
}

try {
    Set-Location -LiteralPath $VAULT

    Write-Host ""
    Write-Host "============================================================"
    Write-Host "  Dark Descent TRPG | Capture World Delta"
    Write-Host "============================================================"
    Write-Host ""

    $outPath = Join-Path $VAULT "world_delta.yaml"
    Write-Host "[1/4] Reading clipboard..."
    $text = Get-Clipboard -Raw
    if ($null -eq $text -or $text.Trim().Length -eq 0) {
        $msg = "[ERROR] Clipboard empty. Copy Gemini YAML first (Ctrl+A, Ctrl+C)."
        Write-Host $msg
        WriteErrLog $msg
        WaitDone
        exit 1
    }

    $enc = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($outPath, $text, $enc)
    Write-Host "  world_delta.yaml saved."

    Write-Host "[2/4] Validate world_delta: ..."
    $ok = Select-String -LiteralPath $outPath -Pattern "world_delta:" -SimpleMatch -Quiet
    if (-not $ok) {
        $msg = @"
[ERROR] Missing world_delta: in file.
Path: $outPath
Tip: Copy the full YAML block from Gemini (must contain the key world_delta:).
"@
        Write-Host $msg
        WriteErrLog $msg
        WaitDone
        exit 1
    }

    Write-Host "  OK."
    Write-Host ""
    Write-Host "[3/4] apply_delta.bat ..."
    $apply = Join-Path $VAULT "apply_delta.bat"
    cmd.exe /c "`"$apply`""
    $code = $LASTEXITCODE
    if ($code -ne 0) {
        $msg = "[ERROR] apply_delta.bat failed with exit code $code. Check messages above."
        Write-Host $msg
        WriteErrLog $msg
        WaitDone
        exit $code
    }

    Write-Host ""
    Write-Host "[4/4] 壓縮 session_log.md ..."
    $sessionLog = Join-Path $VAULT "system" "_live" "session_log.md"
    if (Test-Path $sessionLog) {
        $compressScript = Join-Path $VAULT "tools" "compress-session-log.ts"
        & npx ts-node $compressScript $sessionLog 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  [WARNING] session_log 壓縮失敗，繼續執行。"
        }
    } else {
        Write-Host "  [SKIP] session_log.md 不存在，跳過壓縮。"
    }

    Write-Host ""
    Write-Host "Opening Claude in browser..."
    Start-Process $ClaudeProjectUrl

    WaitDone "Press Enter to close"
    exit 0
} catch {
    $full = @"
[FATAL] $($_.Exception.Message)
$($_.InvocationInfo.PositionMessage)
$($_.ScriptStackTrace)
"@
    Write-Host $full -ForegroundColor Red
    WriteErrLog $full
    Write-Host ""
    Write-Host "Details saved to: $ErrorLog"
    WaitDone
    exit 1
}
