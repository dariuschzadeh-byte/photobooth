@echo off
REM ====================================================================
REM  fr-anz photobooth - SHOW THE LOG
REM  Shows the last 50 lines of data\server.log in a readable window,
REM  errors first. Reads only - changes nothing.
REM ====================================================================
title fr-anz photobooth - log
cd /d "%~dp0"
mode con: cols=110 lines=42

if not exist "data\server.log" (
  echo.
  echo   No data\server.log yet - the booth has not been started on this PC.
  echo.
  pause
  exit /b 1
)

echo.
echo   ============================================================
echo    LAST ERRORS AND WARNINGS ANYWHERE IN THE LOG
echo   ============================================================
powershell -NoProfile -Command "Get-Content 'data\server.log' | Select-String -Pattern 'FAILED|WARNING|Error|refused|failed' | Select-Object -Last 12 | ForEach-Object { $_.Line }"

echo.
echo   ============================================================
echo    LAST 50 LINES (newest at the bottom)
echo   ============================================================
powershell -NoProfile -Command "Get-Content 'data\server.log' -Tail 50"

echo.
echo   ------------------------------------------------------------
echo    Photograph this window and send it to Dariusch.
echo   ------------------------------------------------------------
echo.
pause
exit /b 0
