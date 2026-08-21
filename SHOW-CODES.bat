@echo off
REM ====================================================================
REM  fr-anz photobooth - SHOW THE BOOTH CODES
REM  Prints the master code and the staff code in a readable size,
REM  so nobody has to squint at /admin on the 7 inch screen.
REM  Reads only - changes nothing.
REM ====================================================================
title fr-anz photobooth - codes
cd /d "%~dp0"
mode con: cols=64 lines=22

echo.
echo   ============================================================
echo                     fr-anz photobooth codes
echo   ============================================================
echo.

node "scripts\set-codes.js"
if errorlevel 1 (
  echo.
  echo   Could not read the codes. Send this window to Dariusch.
  echo.
  pause
  exit /b 1
)

echo.
echo   ------------------------------------------------------------
echo    STAFF  - for the morning sample strip. Works twice a day,
echo             resets at midnight. Give this one to the team.
echo    MASTER - yours. Unlimited. Do not put it on a card, in a
echo             chat, or anywhere near the staff guide.
echo   ------------------------------------------------------------
echo.
echo   Neither code is stored in the project files, so neither can
echo   leak through GitHub. They live only on this PC.
echo.
pause
exit /b 0
