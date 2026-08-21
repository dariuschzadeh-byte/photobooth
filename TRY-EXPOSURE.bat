@echo off
REM ====================================================================
REM  fr-anz photobooth - TRY DIFFERENT BRIGHTNESS
REM  Renders the newest session at five brightness settings side by side
REM  so the right one can be picked by looking at it.
REM  Uses no paper and does not touch the printer or the camera.
REM ====================================================================
title fr-anz photobooth - brightness
cd /d "%~dp0"

echo.
echo   fr-anz photobooth - brightness
echo.

node "scripts\try-exposure.js"
if errorlevel 1 (
  echo.
  echo   Something went wrong. Nothing was changed - this script only reads.
  echo.
  pause
  exit /b 1
)

echo.
echo   Opening the pictures.
start "" "%~dp0output\analysis"
pause
exit /b 0
