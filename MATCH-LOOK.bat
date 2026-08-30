@echo off
REM ====================================================================
REM  fr-anz photobooth - MATCH AN OLDER LOOK
REM
REM  Every strip the booth has ever printed is still on disk, so a look
REM  that was right once exists as exact pixels rather than as a photo of
REM  a print under a lamp. This measures one of those strips, measures a
REM  recent photo, and works out the settings that map one to the other.
REM
REM  Reads only. It prints three numbers to send to Dariusch.
REM ====================================================================
setlocal enabledelayedexpansion
title fr-anz photobooth - match look
cd /d "%~dp0"
mode con: cols=78 lines=40

echo.
echo   ============================================================
echo            fr-anz photobooth - match an older look
echo   ============================================================
echo.
echo   First: which days have strips on disk?
echo.

node "scripts\match-look.js"

echo.
set "DAY="
set /p DAY=  Type the date to match (YYYY-MM-DD):
if "!DAY!"=="" (
  echo.
  echo   Nothing entered.
  echo.
  pause
  exit /b 0
)

echo.
node "scripts\match-look.js" "!DAY!"

echo.
echo   ------------------------------------------------------------
echo    Photograph this window and send it to Dariusch.
echo   ------------------------------------------------------------
echo.
pause
exit /b 0
