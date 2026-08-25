@echo off
REM ====================================================================
REM  fr-anz photobooth - IMPORT PRINTED VOUCHER CODES
REM  Reads data\import-codes.txt and adds those codes to the store.
REM
REM  Never overwrites: a code already used stays used, so re-running this
REM  cannot bring a spent voucher back to life.
REM ====================================================================
title fr-anz photobooth - import codes
cd /d "%~dp0"
mode con: cols=76 lines=28

echo.
echo   ============================================================
echo             fr-anz photobooth - import voucher codes
echo   ============================================================
echo.

if not exist "data\import-codes.txt" (
  echo   PROBLEM: data\import-codes.txt not found.
  echo.
  echo   Put the code list there first - one six-digit code per line.
  echo   The file stays on this PC and is never committed.
  echo.
  pause
  exit /b 1
)

echo   Checking first, without changing anything...
echo.
node "scripts\import-codes.js" "data\import-codes.txt" --dry-run
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
set "GO="
set /p GO=  Import these codes now? (y/n):
if /i not "%GO%"=="y" (
  echo.
  echo   Cancelled - nothing was changed.
  echo.
  pause
  exit /b 0
)

echo.
node "scripts\import-codes.js" "data\import-codes.txt"
if errorlevel 1 (
  echo.
  echo   Import failed - see above.
  echo.
  pause
  exit /b 1
)

echo.
echo   ------------------------------------------------------------
echo    Done. The cards work immediately - no restart needed.
echo    Try one at the booth to confirm.
echo   ------------------------------------------------------------
echo.
pause
exit /b 0
