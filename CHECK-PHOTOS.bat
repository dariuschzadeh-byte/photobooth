@echo off
REM ====================================================================
REM  fr-anz photobooth - CHECK THE LAST PHOTOS
REM  Takes the most recent session and shows what the software does to
REM  it: the camera's own frame next to the printed result, plus all
REM  three looks side by side.
REM  Uses no paper and does not touch the printer.
REM ====================================================================
title fr-anz photobooth - photo check
cd /d "%~dp0"

echo.
echo   fr-anz photobooth - photo check
echo.

if not exist "output\sessions" (
  echo   PROBLEM: no output\sessions folder - no guest photos on this PC.
  echo.
  pause
  exit /b 1
)

REM ---- newest session folder ------------------------------------------
set "NEWEST="
for /f "delims=" %%d in ('dir /b /ad /o-d "output\sessions" 2^>nul') do (
  if not defined NEWEST set "NEWEST=%%d"
)

if not defined NEWEST (
  echo   PROBLEM: output\sessions is empty - no sessions recorded yet.
  echo.
  pause
  exit /b 1
)

echo   newest session: %NEWEST%
echo.

echo   [1/2] what the pipeline does to the photos...
node "scripts\analyse-photo.js" "output\sessions\%NEWEST%"
if errorlevel 1 goto failed

echo.
echo   [2/2] the three looks side by side...
node "scripts\compare-look.js" "output\sessions\%NEWEST%"
if errorlevel 1 goto failed

echo.
echo   ================================================
echo    Done. Opening the pictures.
echo    Left column = what the camera saw, untouched.
echo   ================================================
echo.
start "" "%~dp0output\analysis"
pause
exit /b 0

:failed
echo.
echo   ================================================
echo    Something went wrong. Nothing was changed and
echo    the booth is unaffected - this script only reads.
echo    Send the text above to Dariusch.
echo   ================================================
echo.
pause
exit /b 1
