@echo off
chcp 65001 > nul
setlocal EnableDelayedExpansion

set VAULT=%~dp0
cd /d "%VAULT%"

echo.
echo ============================================================
echo   Dark Descent TRPG ^| Apply delta
echo ============================================================
echo.

if not exist "world_delta.yaml" (
    echo [ERROR] world_delta.yaml not found
    echo Path: %VAULT%world_delta.yaml
    timeout /t 25
    exit /b 1
)

set SUMMARY_ARG=
if exist "session_summary.yaml" (
    echo [INFO] session_summary.yaml found
    set SUMMARY_ARG=session_summary.yaml
) else (
    echo [INFO] session_summary.yaml not found, skip player state
)
echo.

echo [1/3] apply-delta.ts...
call npx ts-node tools\apply-delta.ts world_delta.yaml %SUMMARY_ARG%

if errorlevel 1 (
    echo.
    echo [ERROR] apply-delta failed
    timeout /t 25
    exit /b 1
)

echo.
echo [2/3] git commit...

set SESSION_ID=session_unknown
for /f "tokens=2 delims=: " %%A in ('findstr /r "  session_id:" world_delta.yaml 2^>nul') do (
    if "!SESSION_ID!"=="session_unknown" set SESSION_ID=%%A
)
set SESSION_ID=%SESSION_ID:"=%
set SESSION_ID=%SESSION_ID: =%

git add . >nul 2>&1
git commit -m "Session %SESSION_ID% delta applied" >nul 2>&1
if errorlevel 1 (
    echo   Git commit skipped
) else (
    echo   Commit OK: %SESSION_ID%
)

echo.
echo [3/3] Open system folder...
start "" explorer "%VAULT%system\_live"

echo.
echo Done. SESSION_START.md will be auto-generated next (includes inline state).
echo.

set /p CLEANUP=Delete temp yaml? (Y/other=keep):
if /i "!CLEANUP!"=="Y" (
    del "world_delta.yaml" >nul 2>&1
    if exist "session_summary.yaml" del "session_summary.yaml" >nul 2>&1
)

echo.
pause
