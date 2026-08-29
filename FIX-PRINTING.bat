@echo off
REM ====================================================================
REM  fr-anz photobooth - FIX PRINTING (the big hammer)
REM
REM  For when Windows shows the printer as ready but Hot Folder Print
REM  hangs on its splash screen or never finds the printer.
REM
REM  Hot Folder Print asks Windows for the printer list while it starts.
REM  If the Windows print spooler is wedged -- which it does, on machines
REM  that run for weeks -- that request never returns, so HFP sits on its
REM  splash screen forever while the printer itself is perfectly fine.
REM  Restarting the spooler needs administrator rights, so this asks.
REM
REM  Clears queued print jobs. Nobody is waiting on those anyway.
REM ====================================================================
setlocal enabledelayedexpansion
title fr-anz photobooth - fix printing
cd /d "%~dp0"
mode con: cols=74 lines=30

REM ---- need administrator rights for the spooler ----------------------
net session >nul 2>&1
if not "%errorlevel%"=="0" (
  echo.
  echo   This needs administrator rights. Windows will ask - click Yes.
  echo.
  powershell -NoProfile -Command "Start-Process -Verb RunAs -FilePath '%~f0'"
  exit /b 0
)

set "HFP=C:\DNP\HotFolderPrint\HotFolderPrint.exe"
set "HFDIR=C:\DNP\HotFolderPrint\Prints\s6x2_2"

echo.
echo   ============================================================
echo              fr-anz photobooth - fix printing
echo   ============================================================
echo.
echo   Make sure the printer is ON and its cover is closed.
echo.
pause

echo.
echo   [1/6] closing Hot Folder Print (every instance)...
taskkill /f /im HotFolderPrint.exe >nul 2>&1
ping -n 3 127.0.0.1 >nul

echo   [2/6] stopping the Windows print spooler...
net stop spooler >nul 2>&1

echo   [3/6] clearing stuck print jobs...
del /q /f "%SystemRoot%\System32\spool\PRINTERS\*" >nul 2>&1

echo   [4/6] starting the print spooler again...
net start spooler >nul 2>&1
ping -n 4 127.0.0.1 >nul

echo   [5/6] parking anything left in the drop folder...
if exist "%HFDIR%" (
  set "PARKED=%~dp0output\unprinted"
  if not exist "!PARKED!" mkdir "!PARKED!" >nul 2>&1
  move /y "%HFDIR%\*.png" "!PARKED!" >nul 2>&1
  move /y "%HFDIR%\*.jpg" "!PARKED!" >nul 2>&1
)

echo   [6/6] starting Hot Folder Print...
if not exist "%HFP%" (
  echo.
  echo   PROBLEM: Hot Folder Print is not installed at %HFP%
  echo.
  pause
  exit /b 1
)
start "" "%HFP%"

echo.
echo   Waiting for it to find the printer. Its splash screen can take
echo   several minutes - leave that window alone.
echo.
set TRIES=0
:wait
ping -n 6 127.0.0.1 >nul
set /a TRIES+=1
if exist "%HFDIR%" goto found
set /a SECS=!TRIES!*5
echo         still waiting... !SECS!s
if !TRIES! GEQ 60 goto notfound
goto wait

:found
echo.
echo   ------------------------------------------------------------
echo    WORKING. The drop folder is back.
echo    Now start the booth (icon 1) and run a test print.
echo   ------------------------------------------------------------
echo.
pause
exit /b 0

:notfound
echo.
echo   ------------------------------------------------------------
echo    Still not found after five minutes.
echo   ------------------------------------------------------------
echo.
echo    Next step: restart the whole PC with the printer switched ON
echo    and connected. That clears anything this could not.
echo.
echo    If it still fails after that, open Hot Folder Print and check
echo    which printer and which paper size it is set to - it must be
echo    DS-RX1 and the 2x6 (two strips per sheet) size.
echo.
pause
exit /b 1
