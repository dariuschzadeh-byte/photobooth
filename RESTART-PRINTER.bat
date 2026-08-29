@echo off
REM ====================================================================
REM  fr-anz photobooth - RESTART THE PRINTER SOFTWARE
REM
REM  Hot Folder Print looks for the printer only when it starts. Once it
REM  loses it, it keeps running, keeps reporting STATUS_OFFLINE, and never
REM  looks again -- and START-BOOTH deliberately leaves a running instance
REM  alone, so restarting the booth does not help either. This closes it
REM  properly and starts it fresh.
REM
REM  Use when Windows shows the printer as Idle but nothing prints.
REM ====================================================================
setlocal enabledelayedexpansion
title fr-anz photobooth - restart printer software
cd /d "%~dp0"
mode con: cols=74 lines=28

set "HFP=C:\DNP\HotFolderPrint\HotFolderPrint.exe"
set "HFDIR=C:\DNP\HotFolderPrint\Prints\s6x2_2"

echo.
echo   ============================================================
echo        fr-anz photobooth - restart the printer software
echo   ============================================================
echo.

if not exist "%HFP%" (
  echo   PROBLEM: Hot Folder Print is not installed at
  echo   %HFP%
  echo.
  pause
  exit /b 1
)

echo   Make sure the printer is ON and its cover is closed before
echo   continuing - Hot Folder Print only finds it at startup.
echo.
pause

echo.
echo   [1/4] closing Hot Folder Print...
taskkill /f /im HotFolderPrint.exe >nul 2>&1
ping -n 4 127.0.0.1 >nul

echo   [2/4] parking anything left in the drop folder...
if exist "%HFDIR%" (
  set "PARKED=%~dp0output\unprinted"
  if not exist "!PARKED!" mkdir "!PARKED!" >nul 2>&1
  move /y "%HFDIR%\*.png" "!PARKED!" >nul 2>&1
  move /y "%HFDIR%\*.jpg" "!PARKED!" >nul 2>&1
)

echo   [3/4] starting it again...
start "" "%HFP%"

REM  Give it real time. Hot Folder Print shows a splash screen while it
REM  scans for printers, and that alone can take a couple of minutes on
REM  this machine -- the first version of this script waited 30 seconds
REM  and declared failure while HFP was still starting up, which is worse
REM  than not checking at all.
echo   [4/4] waiting for it to find the printer - this takes a while.
echo         Leave the Hot Folder Print window alone while it starts.
echo.
set TRIES=0
:wait
ping -n 6 127.0.0.1 >nul
set /a TRIES+=1
if exist "%HFDIR%" goto found
set /a SECS=!TRIES!*5
echo         still waiting... !SECS!s
if !TRIES! GEQ 48 goto notfound
goto wait

:found
echo.
echo   ------------------------------------------------------------
echo    WORKING. The drop folder is back:
echo    %HFDIR%
echo   ------------------------------------------------------------
echo.
echo    Now run a test print at the booth with the staff code.
echo.
pause
exit /b 0

:notfound
echo.
echo   ------------------------------------------------------------
echo    Hot Folder Print started but still has not found the printer.
echo   ------------------------------------------------------------
echo.
echo    Next: switch the printer off, wait 10 seconds, switch it on,
echo    wait until it feeds and cuts a blank strip, then run this again.
echo.
echo    If it still fails, open Hot Folder Print itself and check which
echo    printer and paper size it is set to.
echo.
pause
exit /b 1
