@echo off
REM ====================================================================
REM  fr-anz photobooth - PULL LATEST VERSION
REM  Fetches the newest code from the git remote and restarts the booth.
REM  Safe: refuses to run while there are uncommitted local changes,
REM  so nothing you changed on this PC is silently thrown away.
REM ====================================================================
title fr-anz photobooth - update
cd /d "%~dp0"

echo.
echo   fr-anz photobooth - update
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo   PROBLEM: git is not installed on this PC.
  echo.
  pause
  exit /b 1
)

if not exist ".git" (
  echo   PROBLEM: this folder is not a git repository.
  echo.
  pause
  exit /b 1
)

REM ---- refuse if someone edited files directly on the booth PC --------
git diff --quiet
if errorlevel 1 goto dirty
git diff --cached --quiet
if errorlevel 1 goto dirty
goto pull

:dirty
echo   ================================================
echo    There are local changes on this PC that are
echo    not committed. Updating would overwrite them.
echo.
echo    Nothing was changed. Please contact Dariusch.
echo   ================================================
echo.
git status --short
echo.
pause
exit /b 1

REM ---- fetch and fast-forward ----------------------------------------
:pull
echo   fetching latest version...
git pull --ff-only
if errorlevel 1 (
  echo.
  echo   ================================================
  echo    Update failed. The booth was NOT changed and
  echo    still runs the previous version.
  echo    Please contact Dariusch.
  echo   ================================================
  echo.
  pause
  exit /b 1
)

REM ---- install any new dependencies ----------------------------------
if exist "package-lock.json" (
  echo   checking dependencies...
  call npm install --omit=dev --no-audit --no-fund >nul 2>&1
)

REM ---- syntax check before restarting --------------------------------
echo   checking the new version...
node --check server.js
if errorlevel 1 (
  echo.
  echo   ================================================
  echo    The new version has a syntax error.
  echo    NOT restarting - the booth keeps running the
  echo    version that is already loaded.
  echo    Please contact Dariusch.
  echo   ================================================
  echo.
  pause
  exit /b 1
)

REM ---- restart the booth ---------------------------------------------
echo   restarting the booth...
call "%~dp0STOP-BOOTH.bat" >nul 2>&1
call "%~dp0START-BOOTH.bat"

echo.
echo   done - the booth runs the latest version.
ping -n 4 127.0.0.1 >nul
exit /b 0
