@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -NoLogo -File "%~dp0capture_world_delta.ps1"
set "ERR=%ERRORLEVEL%"
if %ERR% neq 0 (
    echo.
    echo ============================================================
    echo   Script exited with code %ERR%
    echo   Full message: last_capture_world_delta_error.txt
    echo   Press any key to close...
    echo ============================================================
    pause
)
exit /b %ERR%
