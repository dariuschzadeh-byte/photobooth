@echo off
REM ====================================================================
REM  fr-anz photobooth - STOP THE PRINTER GOING TO SLEEP
REM
REM  A booth stands idle for hours between guests. Windows takes that as
REM  permission to power down the USB port the printer is on, and the
REM  device does not always come back -- the printer's own light stays on,
REM  Windows still lists it, the job is accepted, and nothing prints.
REM
REM  Turns off USB selective suspend for every power plan, and revokes
REM  Windows' permission to power down each USB hub and the printer
REM  itself. Needs administrator rights, so it asks for them.
REM ====================================================================
setlocal enabledelayedexpansion
title fr-anz photobooth - keep the printer awake
cd /d "%~dp0"
mode con: cols=76 lines=32

net session >nul 2>&1
if not "%errorlevel%"=="0" (
  echo.
  echo   This needs administrator rights. Windows will ask - click Yes.
  echo.
  powershell -NoProfile -Command "Start-Process -Verb RunAs -FilePath '%~f0'"
  exit /b 0
)

echo.
echo   ============================================================
echo         fr-anz photobooth - keep the printer awake
echo   ============================================================
echo.

echo   [1/3] switching off USB selective suspend...
for /f "tokens=4" %%g in ('powercfg /list ^| findstr /i /c:"GUID"') do (
  powercfg /setacvalueindex %%g 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0 >nul 2>&1
  powercfg /setdcvalueindex %%g 2a737441-1930-4402-8d77-b2bebba308a3 48e6b7a6-50f5-4782-a5d4-53bb8f07e226 0 >nul 2>&1
)
powercfg /setactive scheme_current >nul 2>&1
echo         done

echo   [2/3] telling Windows it may not power down the USB ports...
powershell -NoProfile -Command "Get-CimInstance -ClassName MSPower_DeviceEnable -Namespace root\wmi -ErrorAction SilentlyContinue | ForEach-Object { try { $_.Enable = $false; Set-CimInstance -InputObject $_ -ErrorAction SilentlyContinue } catch {} }"
echo         done

echo   [3/3] the same for the printer's own device entry...
powershell -NoProfile -Command "$d = Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -match 'DS-RX|DP-|DNP|CITIZEN' }; if ($d) { $d | ForEach-Object { Write-Host ('         ' + $_.FriendlyName + '  ' + $_.Status) } } else { Write-Host '         printer not currently attached' }"

echo.
echo   ------------------------------------------------------------
echo    Done. Restart the PC once so all of it takes effect.
echo   ------------------------------------------------------------
echo.
echo    The printer may also have its own sleep timer, set in the DNP
echo    utility rather than in Windows. If it still drops out after a
echo    quiet spell, that is where to look next.
echo.
pause
exit /b 0
