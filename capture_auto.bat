@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -NoLogo -File "%~dp0capture_auto.ps1"
set "ERR=%ERRORLEVEL%"
if %ERR% neq 0 (
    echo.
    echo ============================================================
    echo   Script exited with code %ERR%
    echo   See last_capture_auto_error.txt for details
    echo   Press any key to close...
    echo ============================================================
    pause
)
exit /b %ERR%
