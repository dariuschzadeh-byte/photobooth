@echo off
REM ====================================================================
REM  fr-anz photobooth - TRY THE BACKDROP COLOUR
REM  Nine versions of the same photo: the wall's hue across, how vivid
REM  it is down. Hold the reference strip next to the screen and match it.
REM  No paper, no printer, no camera.
REM ====================================================================
title fr-anz photobooth - colour
cd /d "%~dp0"

echo.
echo   fr-anz photobooth - try the backdrop colour
echo.

node "scripts\try-color.js"
if errorlevel 1 (
  echo.
  echo   Something went wrong. Nothing was changed - this script only reads.
  echo.
  pause
  exit /b 1
)

echo.
start "" "%~dp0output\analysis"
pause
exit /b 0
