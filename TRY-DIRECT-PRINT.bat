@echo off
REM ====================================================================
REM  fr-anz photobooth - PRINT WITHOUT HOT FOLDER PRINT
REM
REM  Hot Folder Print has stopped working, while Windows still reports the
REM  printer as ready. The booth does not actually need HFP -- it needs
REM  the sheet on paper, and Windows can do that itself.
REM
REM  This does two things, in this order:
REM    1. lists the paper sizes the printer offers
REM    2. builds a test strip and prints it straight through Windows
REM
REM  It changes NOTHING about how the booth prints. It only proves whether
REM  this route works before we switch anything over.
REM ====================================================================
setlocal enabledelayedexpansion
title fr-anz photobooth - direct print test
cd /d "%~dp0"
mode con: cols=78 lines=34

echo.
echo   ============================================================
echo        fr-anz photobooth - print without Hot Folder Print
echo   ============================================================
echo.
echo   Make sure the printer is ON with paper and ribbon loaded.
echo.
pause

echo.
echo   [1/2] what paper sizes does the printer offer?
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\print-windows.ps1" -ListSizes
echo.
echo   ------------------------------------------------------------
echo    Look at the list above. If nothing is listed, Windows cannot
echo    reach the printer either and this route will not work.
echo   ------------------------------------------------------------
echo.
set "SIZE="
set /p SIZE=  Paper size to try (Enter = printer default):

echo.
echo   [2/2] building a test strip and printing it...
node "scripts\make-test-strip.js"
if errorlevel 1 (
  echo   Could not build a test strip.
  pause
  exit /b 1
)

if "!SIZE!"=="" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\print-windows.ps1" -Image "output\prints\_directtest.png"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\print-windows.ps1" -Image "output\prints\_directtest.png" -PaperSize "!SIZE!"
)

echo.
echo   ------------------------------------------------------------
echo    Did a strip come out, and is it the right size?
echo    If yes, tell Dariusch which paper size you used and the booth
echo    can be switched to this route permanently.
echo   ------------------------------------------------------------
echo.
pause
exit /b 0
