@echo off
REM ====================================================================
REM  fr-anz photobooth - RESET CODES FOR A NEW CARD BATCH
REM
REM  Takes every code the booth knows out of service and makes
REM  data\import-codes.txt the only live batch. Old cards stop working,
REM  used or not.
REM
REM  Retired, not deleted: the old codes stay known to the booth, so none
REM  of them can ever be issued again and no old card can come back to
REM  life. The store as it was is kept as
REM  data\codes.json.before-reset-<date and time>.
REM ====================================================================
title fr-anz photobooth - reset codes
cd /d "%~dp0"
mode con: cols=80 lines=36

echo.
echo   ============================================================
echo         fr-anz photobooth - reset codes for a new batch
echo   ============================================================
echo.

if not exist "data\import-codes.txt" (
  echo   PROBLEM: data\import-codes.txt not found.
  echo.
  echo   Put the list for the NEW cards there first - one six-digit
  echo   code per line. It stays on this PC and is never committed.
  echo.
  pause
  exit /b 1
)

echo   Checking first, without changing anything...
echo.
node "scripts\import-codes.js" "data\import-codes.txt" --reset --dry-run
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

echo.
echo   After this, every OLD card stops working.
set "GO="
set /p GO=  Type RESET to go ahead: 
if /i not "%GO%"=="RESET" (
  echo.
  echo   Cancelled - nothing was changed.
  echo.
  pause
  exit /b 0
)

echo.
node "scripts\import-codes.js" "data\import-codes.txt" --reset
if errorlevel 1 (
  echo.
  echo   Reset failed - see above.
  echo.
  pause
  exit /b 1
)

echo.
echo   ------------------------------------------------------------
echo    Done. Check it at the booth with two cards:
echo      a NEW card   - should start a session
echo      an OLD card  - should be refused
echo   ------------------------------------------------------------
echo.
pause
exit /b 0
