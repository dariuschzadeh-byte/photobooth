@echo off
REM  Delayed expansion: without it cmd.exe substitutes %GO% while it parses
REM  the if-block below, i.e. BEFORE set /p has run, so the prompt is read
REM  and then ignored. Classic, silent, and it cost this file its restart.
setlocal enabledelayedexpansion
REM ====================================================================
REM  fr-anz photobooth - CONNECT TO THE DASHBOARD
REM  Writes the cloud settings, then tests the connection and names
REM  whichever setup step is still missing.
REM  Safe to run again any time. The booth works with or without this.
REM ====================================================================
title fr-anz photobooth - connect dashboard
cd /d "%~dp0"
mode con: cols=72 lines=32

echo.
echo   ============================================================
echo            fr-anz photobooth - connect to dashboard
echo   ============================================================
echo.

node "scripts\connect-dashboard.js"
set RESULT=%errorlevel%

if "%RESULT%"=="0" (
  echo.
  set /p GO=  Restart the booth now so it starts reporting? (y/n):
  if /i "!GO!"=="y" (
    call "%~dp0STOP-BOOTH.bat" >nul 2>&1
    call "%~dp0START-BOOTH.bat"
  )
)

echo.
pause
exit /b 0
