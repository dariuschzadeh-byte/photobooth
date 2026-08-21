@echo off
REM ====================================================================
REM  fr-anz photobooth - SET THE BOOTH CODES BY HAND
REM  Type the two codes once; they are stored on this PC only.
REM  Nothing here is committed, so no code can ever leak through GitHub.
REM ====================================================================
setlocal enabledelayedexpansion
title fr-anz photobooth - set codes
cd /d "%~dp0"
mode con: cols=68 lines=26

echo.
echo   ============================================================
echo                  fr-anz photobooth - set codes
echo   ============================================================
echo.
echo   Currently:
node "scripts\set-codes.js"
echo.
echo   ------------------------------------------------------------
echo    Six digits each. Leave a line empty to keep the code it has.
echo   ------------------------------------------------------------
echo.

set "STAFF="
set /p STAFF=  new STAFF code  (2x a day, for the team):
set "MASTER="
set /p MASTER=  new MASTER code (unlimited, yours only) :

set "ARGS="
if not "%STAFF%"=="" set "ARGS=!ARGS! --staff %STAFF%"
if not "%MASTER%"=="" set "ARGS=!ARGS! --master %MASTER%"

if "%ARGS%"=="" (
  echo.
  echo   Nothing entered - nothing changed.
  echo.
  pause
  exit /b 0
)

echo.
node "scripts\set-codes.js"!ARGS!
if errorlevel 1 (
  echo.
  echo   ================================================
  echo    Refused - nothing was changed. A code must be
  echo    exactly six digits and must not already be a
  echo    printed voucher.
  echo   ================================================
  echo.
  pause
  exit /b 1
)

echo.
echo   The booth still runs the OLD codes until it restarts.
echo.
set "GO="
set /p GO=  Restart the booth now? (y/n):
if /i "%GO%"=="y" (
  call "%~dp0STOP-BOOTH.bat" >nul 2>&1
  call "%~dp0START-BOOTH.bat"
  echo.
  echo   Done - the new codes are live.
) else (
  echo.
  echo   Not restarted. Use icon 2 then icon 1 when you are ready.
)
echo.
pause
exit /b 0
