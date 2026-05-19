# capture_auto.ps1 - 智能統一入口
# 讀取剪貼板 YAML，自動判斷型別，路由到正確的處理流程。
#
# 支援的 YAML 根鍵：
#   checkpoint_summary: -> /checkpoint 結算（任務後）
#   session_summary:    -> SESSION END 結算（章節後，開啟 Gemini）
#   world_delta:        -> 世界結算套用（從 Gemini 回來後）

$VAULT         = Split-Path -Parent $MyInvocation.MyCommand.Path
$GeminiUrl     = "https://gemini.google.com/app"
$ErrorLog      = Join-Path $VAULT "last_capture_auto_error.txt"

function Write-Header {
    param([string]$Title)
    Write-Host ""
    Write-Host "============================================================"
    Write-Host "  Dark Descent TRPG | $Title"
    Write-Host "============================================================"
    Write-Host ""
}

function Write-Err {
    param([string]$Text)
    $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "[$stamp]`r`n$Text" | Out-File -LiteralPath $ErrorLog -Encoding utf8 -Force
}

function WaitDone {
    param([string]$Msg = "Press Enter to close...")
    Write-Host ""
    Write-Host $Msg
    try { Read-Host | Out-Null } catch { Start-Sleep -Seconds 60 }
}

function Save-Yaml {
    param([string]$Text, [string]$Filename)
    $p   = Join-Path $VAULT $Filename
    $enc = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($p, $Text, $enc)
    return $p
}

function Get-RootKey {
    param([string]$Text)
    foreach ($line in ($Text -split "`n")) {
        $t = $line.TrimStart().TrimEnd("`r")
        if ($t.Length -eq 0)        { continue }
        if ($t.StartsWith("#"))     { continue }
        if ($t -eq "---")           { continue }
        $idx = $t.IndexOf(":")
        if ($idx -gt 0) { return $t.Substring(0, $idx).Trim() }
    }
    return $null
}

# ─── 主流程 ──────────────────────────────────────────────────────────────────

try {
    Set-Location -LiteralPath $VAULT

    Write-Header "Auto Capture"

    # Step 1：讀取剪貼板
    Write-Host "[1/?] 讀取剪貼板..."
    $text = Get-Clipboard -Raw
    if ($null -eq $text -or $text.Trim().Length -eq 0) {
        $msg = "[ERROR] 剪貼板是空的。請先複製 Claude 或 Gemini 的 YAML 輸出（Ctrl+A, Ctrl+C），再雙擊此腳本。"
        Write-Host $msg
        Write-Err $msg
        WaitDone
        exit 1
    }

    # Step 2：識別 YAML 根鍵
    $rootKey = Get-RootKey $text
    Write-Host "  識別到根鍵：$rootKey"
    Write-Host ""

    # Step 3：路由
    switch ($rootKey) {

        # ── /checkpoint 結算 ────────────────────────────────────────────────
        "checkpoint_summary" {
            Write-Header "Capture Checkpoint"

            Write-Host "[2/4] 儲存 checkpoint.yaml..."
            $ckPath = Save-Yaml $text "checkpoint.yaml"
            Write-Host "  已寫入：$ckPath"

            Write-Host "[3/4] 執行 apply_checkpoint.bat..."
            Write-Host ""
            $applyBat = Join-Path $VAULT "apply_checkpoint.bat"
            cmd.exe /c "`"$applyBat`""
            if ($LASTEXITCODE -ne 0) {
                $msg = "[ERROR] apply_checkpoint.bat 失敗（exit $LASTEXITCODE）。"
                Write-Host $msg
                Write-Err $msg
                WaitDone
                exit $LASTEXITCODE
            }

            Write-Host ""
            Write-Host "[4/4] 生成 SESSION_START.md..."
            $genScript = Join-Path $VAULT "tools" "generate-session-start.ts"
            & npx ts-node $genScript 2>&1
            if ($LASTEXITCODE -ne 0) {
                Write-Host "  [WARNING] SESSION_START.md 生成失敗，繼續。"
            }

            WaitDone "完成！SESSION_START.md 已更新並複製到剪貼板。`nPress Enter to close"
        }

        # ── SESSION END → 開 Gemini ─────────────────────────────────────────
        "session_summary" {
            Write-Header "Capture Session End"

            Write-Host "[2/3] 儲存 session_summary.yaml..."
            $ssPath = Save-Yaml $text "session_summary.yaml"
            Write-Host "  已寫入：$ssPath"

            Write-Host "[3/3] 開啟 Gemini [DD] STEP 3 世界結算 Gem..."
            Start-Process $GeminiUrl

            # 在檔案總管中選取 session_summary.yaml
            explorer /select,"$ssPath"

            Write-Host ""
            Write-Host "============================================================"
            Write-Host "  接下來："
            Write-Host "  1. 開 session_summary.yaml，全選複製內容"
            Write-Host "  2. 貼入 Gemini 的 [DD] STEP 3 世界結算 Gem"
            Write-Host "  3. 複製 Gemini 輸出的 world_delta YAML"
            Write-Host "  4. 再次雙擊 capture_auto.bat（自動識別 world_delta:）"
            Write-Host "============================================================"

            WaitDone "Press Enter to close"
        }

        # ── world_delta → 套用並生成 SESSION_START ─────────────────────────
        "world_delta" {
            # 直接委派給 capture_world_delta.ps1（內含 apply + compress + generate-session-start）
            $worldDeltaPs1 = Join-Path $VAULT "capture_world_delta.ps1"
            & powershell.exe -NoProfile -ExecutionPolicy Bypass -NoLogo -File $worldDeltaPs1
            exit $LASTEXITCODE
        }

        # ── 無法識別 ────────────────────────────────────────────────────────
        default {
            $msg = @"
[ERROR] 無法識別 YAML 根鍵：'$rootKey'

有效的根鍵：
  checkpoint_summary:  →  /checkpoint 結果（任務後，來自 Claude）
  session_summary:     →  SESSION END 結果（章節後，來自 Claude）
  world_delta:         →  世界結算結果（來自 Gemini）

請確認已複製完整的 YAML 輸出（Ctrl+A, Ctrl+C）。
"@
            Write-Host $msg
            Write-Err $msg
            WaitDone
            exit 1
        }
    }

    exit 0

} catch {
    $full = @"
[FATAL] $($_.Exception.Message)
$($_.InvocationInfo.PositionMessage)
$($_.ScriptStackTrace)
"@
    Write-Host $full -ForegroundColor Red
    Write-Err $full
    Write-Host ""
    Write-Host "詳細資訊：$ErrorLog"
    WaitDone
    exit 1
}
