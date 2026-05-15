@echo off
chcp 65001 > nul
setlocal EnableDelayedExpansion

:: capture_session_end -> session_summary.yaml

set GEMINI_STEP3_URL=https://gemini.google.com/app

set VAULT=%~dp0
set "SESSION_SUMMARY_YAML=%VAULT%session_summary.yaml"
cd /d "%VAULT%"

echo.
echo ============================================================
echo   Dark Descent TRPG ^| Capture Session End
echo ============================================================
echo.

echo [1/3] 讀取剪貼板...

powershell -NoProfile -Command "$text = Get-Clipboard -Raw; if (-not $text) { Write-Error '剪貼板是空的'; exit 1 }; $p = '%SESSION_SUMMARY_YAML%'; $enc = New-Object System.Text.UTF8Encoding $false; [System.IO.File]::WriteAllText($p, $text, $enc)"

rem PowerShell 失敗判斷：請用 if errorlevel 1
if errorlevel 1 (
    echo.
    echo [錯誤] 剪貼板是空的，或 PowerShell 寫檔失敗。
    echo 請確認：先在其他視窗 Ctrl+C 複製 YAML，再雙擊此 bat。
    echo.
    timeout /t 30
    exit /b 1
)

echo   session_summary.yaml 已寫入。

echo [2/3] 驗證 YAML 格式...

findstr "session_summary:" session_summary.yaml > nul 2>&1
if errorlevel 1 (
    echo.
    echo [錯誤] 檔案內找不到 session_summary:
    echo 路徑：%SESSION_SUMMARY_YAML%
    echo.
    timeout /t 30
    exit /b 1
)

echo   格式驗證通過。

echo [3/3] 開啟 Gemini STEP 3 Gem...
start "" "%GEMINI_STEP3_URL%"

echo.
echo ============================================================
echo   完整路徑（與此 bat 同資料夾）
echo   %SESSION_SUMMARY_YAML%
echo ============================================================

if exist "%SESSION_SUMMARY_YAML%" (
    echo   狀態：已寫入檔案。
) else (
    echo   狀態：[警告] 找不到 yaml。
)

explorer /select,"%SESSION_SUMMARY_YAML%"

echo.
echo 接下來倒數 35 秒後關閉（可按鍵跳過）...
timeout /t 35