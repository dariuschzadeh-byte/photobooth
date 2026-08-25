@echo off
REM ====================================================================
REM  fr-anz photobooth - TRY THE LOOK
REM  Nine versions of the same photo: warmer across, darker down.
REM  Pick one, send the two numbers. No paper, no printer, no camera.
REM ====================================================================
title fr-anz photobooth - look
cd /d "%~dp0"

echo.
echo   fr-anz photobooth - try the look
echo.

node "scripts\try-look.js"
if errorlevel 1 (
  echo.
  echo   Something went wrong. Nothing was changed - this script only reads.
  echo.
  pause
  exit /b 1
)

echo.
echo   Opening the picture.
start "" "%~dp0output\analysis"
pause
exit /b 0
