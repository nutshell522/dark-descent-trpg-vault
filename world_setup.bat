@echo off
chcp 65001 >nul

:: Dark Descent TRPG - world_setup.bat
:: 請勿複製貼上到 CMD — 請雙擊本檔，或執行: cmd.exe /c world_setup.bat

cd /d "%~dp0"
set VAULT=%~dp0

echo(
echo ============================================================
echo   Dark Descent TRPG ^| 世界初始化
echo ============================================================
echo(

:: 1 world.json
if not exist "world.json" goto MISSING_JSON

:: 2 validate
echo [1/3] 驗證 world.json 格式...
echo(
call npx ts-node tools\validate-world.ts world.json
if errorlevel 1 goto VALIDATE_FAIL

echo(
echo [2/3] 拆分世界資料...
echo(
call npx ts-node tools\splitter.ts world.json
if errorlevel 1 goto SPLIT_FAIL

echo(
echo [3/3] 版本存檔...
git add . >nul 2>&1
git commit -m "世界初始化完成" >nul 2>&1
if not errorlevel 1 goto GIT_OK
goto GIT_SKIP

:GIT_OK
echo   Commit 完成 - 世界初始化完成
goto AFTER_GIT

:GIT_SKIP
echo   Git commit 跳過 - 無變更或 git 未初始化
echo   若尚未初始化. 請先執行 git init

:AFTER_GIT
echo(
echo 開啟 system 資料夾...
start "" explorer "%VAULT%system"

echo(
echo ============================================================
echo   初始化完成 - 接下來做什麼 - 精簡版
echo ============================================================
if not exist "%~dp0WORLD_SETUP_TAIL_zh.txt" goto TAIL_MISSING
type "%~dp0WORLD_SETUP_TAIL_zh.txt"
goto TAIL_DONE

:TAIL_MISSING
echo [警示] 找不到檔 WORLD_SETUP_TAIL_zh.txt 請從 Vault 備份復原完整專案

:TAIL_DONE
echo ============================================================
echo(
goto END_OK

:MISSING_JSON
echo(
echo ============================================================
echo   [錯誤] 找不到 world.json
echo ============================================================
echo(
echo world.json must be placed in this folder:
echo %VAULT%world.json
echo(
goto PAUSE_EXIT1

:VALIDATE_FAIL
echo(
echo ============================================================
echo   [錯誤] 驗證失敗 - 請看上方 tools\validate-world.ts 錯誤列並修正檔案
echo ============================================================
echo(
echo   常見. npc_probability_weights 總合須約 1.0 . 或欄位拼錯 . 或多出 npcs .
echo         JSON 格式錯誤或頂層缺少 world 區塊
goto PAUSE_EXIT1

:SPLIT_FAIL
echo(
echo ============================================================
echo   [錯誤] 拆分失敗 - 請看上方 tools\splitter.ts 輸出
echo ============================================================
echo(
goto PAUSE_EXIT1

:PAUSE_EXIT1
echo(
echo [提示] 任意鍵關閉. 修好檔案後再雙擊 world_setup.bat
pause
exit /b 1

:END_OK
pause >nul
