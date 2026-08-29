@echo off
REM ====================================================================
REM  fr-anz photobooth - CLEAN THE PRINTER SOFTWARE LOGS
REM
REM  Hot Folder Print reads its own log files when it starts. On a PC that
REM  has run for months they grow without limit, and a few gigabytes is
REM  enough to leave the splash screen hanging for minutes with nothing
REM  actually broken.
REM
REM  Nothing is deleted. The logs are MOVED next to the booth, so they can
REM  still be read if anyone ever needs them.
REM ====================================================================
setlocal enabledelayedexpansion
title fr-anz photobooth - clean printer logs
cd /d "%~dp0"
mode con: cols=74 lines=28

set "LOGDIR=C:\DNP\HotFolderPrint\Logs"
set "SAVETO=%~dp0output\hfp-logs-old"

echo.
echo   ============================================================
echo         fr-anz photobooth - clean printer software logs
echo   ============================================================
echo.

if not exist "%LOGDIR%" (
  echo   No log folder at %LOGDIR%
  echo   Nothing to do.
  echo.
  pause
  exit /b 0
)

echo   Current size of %LOGDIR%:
echo.
powershell -NoProfile -Command "$s=(Get-ChildItem -LiteralPath '%LOGDIR%' -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum; if($s -eq $null){$s=0}; '{0:N0} MB in {1} file(s)' -f ($s/1MB), (Get-ChildItem -LiteralPath '%LOGDIR%' -File -ErrorAction SilentlyContinue).Count"
echo.
echo   The three biggest:
powershell -NoProfile -Command "Get-ChildItem -LiteralPath '%LOGDIR%' -File -ErrorAction SilentlyContinue | Sort-Object Length -Descending | Select-Object -First 3 | ForEach-Object { '     {0,8:N0} MB  {1}' -f ($_.Length/1MB), $_.Name }"
echo.
echo   ------------------------------------------------------------
echo    They will be MOVED to output\hfp-logs-old - not deleted.
echo   ------------------------------------------------------------
echo.
set "GO="
set /p GO=  Move them and restart Hot Folder Print? (y/n):
if /i not "!GO!"=="y" (
  echo.
  echo   Nothing changed.
  echo.
  pause
  exit /b 0
)

echo.
echo   [1/3] closing Hot Folder Print...
taskkill /f /im HotFolderPrint.exe >nul 2>&1
ping -n 4 127.0.0.1 >nul

echo   [2/3] moving the logs aside...
if not exist "%SAVETO%" mkdir "%SAVETO%" >nul 2>&1
move /y "%LOGDIR%\*.*" "%SAVETO%" >nul 2>&1

echo   [3/3] starting Hot Folder Print...
start "" "C:\DNP\HotFolderPrint\HotFolderPrint.exe"

echo.
echo   ------------------------------------------------------------
echo    Done. Give it a few minutes to start.
echo    Then run CHECK-PRINTER to see whether the drop folder is back.
echo   ------------------------------------------------------------
echo.
pause
exit /b 0
