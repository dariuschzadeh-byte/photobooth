@echo off
REM ====================================================================
REM  fr-anz photobooth - STOP everything (end of the day)
REM  Closes the guest screen and the booth server.
REM  Only closes the booth's own kiosk window - any other browser
REM  window the staff has open stays untouched.
REM ====================================================================
title fr-anz photobooth - stopping

echo.
echo   stopping the photobooth...
echo.

REM 0) tell the cloud dashboard this is a deliberate stop, not a crash.
REM    Must happen BEFORE the kills: Stop-Process gives node no chance
REM    to say anything, so without this every closing time looks like
REM    the PC dying and sets off the offline alarm.
REM    Does nothing if the dashboard is not configured. Gives up after 6s.
node "%~dp0scripts\booth-offline.js" stop-booth >nul 2>&1

REM 1) close the watchdog window first, so the server is not restarted
taskkill /f /fi "WINDOWTITLE eq fr-anz server*" >nul 2>&1

REM 2) stop the booth server itself
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*franz-photobooth*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1

REM 3) close ONLY the kiosk window (own profile folder).
REM    The Name filter matters: without it the helper process matches its
REM    OWN command line and kills itself before doing the work.
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='chrome.exe' OR Name='msedge.exe'\" | Where-Object { $_.CommandLine -like '*kiosk-profile*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1

REM 4) bring back Wispr Flow, which START-BOOTH closed so its widget
REM    would not sit on top of the guest screen
set WISPR=%LOCALAPPDATA%\WisprFlow\Wispr Flow.exe
if exist "%WISPR%" (
  tasklist /fi "IMAGENAME eq Wispr Flow.exe" 2>nul | find /i "Wispr Flow.exe" >nul
  if errorlevel 1 start "" "%WISPR%"
)

echo   done - the photobooth is off.
ping -n 4 127.0.0.1 >nul
exit /b 0
