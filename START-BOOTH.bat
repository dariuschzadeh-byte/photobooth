@echo off
REM ====================================================================
REM  fr-anz photobooth - ONE CLICK START
REM  Starts the booth server (auto-restarting) + the guest screen.
REM  Safe to run twice: if the server is already up, it just opens the
REM  screen again.
REM ====================================================================
title fr-anz photobooth - starting
cd /d "%~dp0"

echo.
echo   fr-anz photobooth
echo   starting, please wait...
echo.

REM ==== SWITCH ========================================================
REM  1 = close Wispr Flow while the booth runs, so its always-on-top
REM      widget does not sit on the guest screen. Use this for live
REM      service. STOP-BOOTH brings Wispr Flow back afterwards.
REM  0 = leave Wispr Flow alone. Use this while working on the booth,
REM      so dictation keeps working.
set HIDE_OVERLAYS=0
REM ====================================================================

REM  Must run BEFORE the "already running" check below - otherwise a
REM  second click on the icon would skip it and the widget stays visible.
if "%HIDE_OVERLAYS%"=="1" taskkill /f /im "Wispr Flow.exe" >nul 2>&1

REM ---- is the server already running? --------------------------------
call :isup
if "%UP%"=="1" (
  echo   server already running - opening the screen
  goto openscreen
)

REM ---- is Node installed? --------------------------------------------
where node >nul 2>&1
if errorlevel 1 (
  echo.
  echo   ================================================
  echo    PROBLEM: Node.js is not installed on this PC.
  echo    The booth cannot start.
  echo    Please contact Dariusch.
  echo   ================================================
  echo.
  pause
  exit /b 1
)

REM ---- make sure the PRINTER SOFTWARE is running ----------------------
REM  DNP Hot Folder Print is what actually prints. Without it the booth
REM  works perfectly but nothing ever comes out of the printer - the
REM  strips just pile up in the hot folder. It does not install itself
REM  into autostart, so we start it here.
call :starthfp

REM ---- start the server in its own minimized window -------------------
start "fr-anz server (do not close)" /min cmd /c ""%~dp0_server-loop.bat""

REM ---- wait for it to answer (up to 40 seconds) ----------------------
set TRIES=0
:wait
call :isup
if "%UP%"=="1" goto openscreen
set /a TRIES+=1
if %TRIES% GEQ 40 goto failed
ping -n 2 127.0.0.1 >nul
goto wait

REM ---- open the guest screen in kiosk mode ---------------------------
:openscreen
set CHROME=
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" set CHROME=C:\Program Files\Google\Chrome\Application\chrome.exe
if not defined CHROME if exist "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe" set CHROME=C:\Program Files (x86)\Google\Chrome\Application\chrome.exe
if not defined CHROME if exist "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" set CHROME=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe

if not defined CHROME (
  echo.
  echo   PROBLEM: no browser found. Please contact Dariusch.
  echo.
  pause
  exit /b 1
)

REM  Own profile folder, wiped on every start. This guarantees:
REM   - a real kiosk window even if a normal browser is already open
REM   - no "restore pages?" bar after a power cut
REM   - STOP-BOOTH can close ONLY this window, not the staff's browser
rmdir /s /q "%~dp0.kiosk-profile" >nul 2>&1

start "" "%CHROME%" --kiosk --user-data-dir="%~dp0.kiosk-profile" --no-first-run --noerrdialogs --disable-pinch --disable-infobars --disable-session-crashed-bubble --overscroll-history-navigation=0 http://localhost:3000

echo   done - the booth is ready.
ping -n 4 127.0.0.1 >nul
exit /b 0

REM ---- server did not come up ----------------------------------------
:failed
echo.
echo   ================================================
echo    PROBLEM: the booth server did not start.
echo.
echo    1. Restart this PC and try again.
echo    2. If it still fails, contact Dariusch.
echo   ================================================
echo.
pause
exit /b 1

REM ---- helper: start DNP Hot Folder Print if it is not running -------
:starthfp
set HFP=C:\DNP\HotFolderPrint\HotFolderPrint.exe
if not exist "%HFP%" (
  echo   note: DNP Hot Folder Print not found - printing will not work
  exit /b 0
)
tasklist /fi "IMAGENAME eq HotFolderPrint.exe" 2>nul | find /i "HotFolderPrint.exe" >nul
if not errorlevel 1 exit /b 0
REM  Anything already sitting in the hot folder was queued while Hot Folder
REM  Print was NOT running, so it never printed. Starting HFP over that
REM  backlog makes it print all of it at once, on top of whatever the next
REM  guest does -- a stack of strips nobody asked for. Park it instead, so
REM  it can be looked at rather than fed to the printer.
set "HFDIR=C:\DNP\HotFolderPrint\Prints\s6x2_2"
set "PARKED=%~dp0output\unprinted"
if exist "%HFDIR%" (
  dir /b "%HFDIR%\*.png" "%HFDIR%\*.jpg" >nul 2>&1
  if not errorlevel 1 (
    if not exist "%PARKED%" mkdir "%PARKED%" >nul 2>&1
    echo   strips were still waiting in the printer folder from earlier.
    echo   moving them to output\unprinted so they do NOT all print at once.
    move /y "%HFDIR%\*.png" "%PARKED%\" >nul 2>&1
    move /y "%HFDIR%\*.jpg" "%PARKED%\" >nul 2>&1
  )
)

echo   starting the printer software...
start "" "%HFP%"
exit /b 0

REM ---- helper: sets UP=1 if the booth server is listening -------------
REM  netstat on purpose, NOT PowerShell's Invoke-WebRequest: on this PC
REM  that cmdlet routes even localhost through the system proxy and just
REM  times out. netstat is instant and has no such problem.
:isup
set UP=0
netstat -an | findstr /C:"127.0.0.1:3000" | findstr /C:"LISTENING" >nul 2>&1
if not errorlevel 1 set UP=1
exit /b 0
