@echo off
REM ====================================================================
REM  fr-anz photobooth - RESET CODES FOR A REPRINT
REM
REM  Makes every voucher code valid again, so the same cards can be
REM  printed and handed out once more. Used cards are thrown away, so a
REM  spent code is not in anybody's hands.
REM
REM  Nothing to copy onto this PC first: the reprinted cards carry the
REM  codes this booth already has. The store as it was is kept as
REM  data\codes.json.before-reset-<date and time>.
REM ====================================================================
title fr-anz photobooth - reset codes
cd /d "%~dp0"
mode con: cols=80 lines=32

echo.
echo   ============================================================
echo            fr-anz photobooth - reset codes for a reprint
echo   ============================================================
echo.
echo   Checking first, without changing anything...
echo.
node "scripts\reset-codes.js" --dry-run
if errorlevel 1 (
  echo.
  echo   ================================================
  echo    Refused - nothing was changed. See the reason
  echo    above and send it to Dariusch.
  echo   ================================================
  echo.
  pause
  exit /b 1
)

set "GO="
set /p GO=  Type RESET to make every code valid again: 
if /i not "%GO%"=="RESET" (
  echo.
  echo   Cancelled - nothing was changed.
  echo.
  pause
  exit /b 0
)

echo.
node "scripts\reset-codes.js"
if errorlevel 1 (
  echo.
  echo   Reset failed - see above.
  echo.
  pause
  exit /b 1
)

echo.
echo   ------------------------------------------------------------
echo    Done. Try one of the reprinted cards at the booth - it
echo    should start a session.
echo   ------------------------------------------------------------
echo.
pause
exit /b 0
