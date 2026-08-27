@echo off
REM ====================================================================
REM  fr-anz photobooth - WHY IS NOTHING PRINTING?
REM  Walks the print path in order and names the first thing that is
REM  wrong. Reads only - nothing gets printed by running this.
REM ====================================================================
title fr-anz photobooth - printer check
cd /d "%~dp0"
mode con: cols=78 lines=40

node "scripts\check-printer.js"

echo.
echo   ------------------------------------------------------------
echo    Photograph this window and send it to Dariusch.
echo   ------------------------------------------------------------
echo.
pause
exit /b 0
