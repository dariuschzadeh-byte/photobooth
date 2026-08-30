@echo off
REM ====================================================================
REM  fr-anz photobooth - STOP HOT FOLDER PRINT STARTING BY ITSELF
REM
REM  Printing goes straight to Windows now, so Hot Folder Print is not
REM  needed -- but it still launches with the PC and puts a splash screen
REM  in front of the guest screen that somebody has to click away.
REM
REM  Closes it and takes it out of Windows' startup, in every place
REM  Windows keeps such a list. It does NOT uninstall it: if the booth is
REM  ever switched back to the hot folder route it is still there, and
REM  START-BOOTH will launch it again on its own.
REM ====================================================================
setlocal enabledelayedexpansion
title fr-anz photobooth - stop Hot Folder Print autostart
cd /d "%~dp0"
mode con: cols=76 lines=30

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
echo       fr-anz photobooth - stop Hot Folder Print popping up
echo   ============================================================
echo.

echo   [1/4] closing it if it is running...
taskkill /f /im HotFolderPrint.exe >nul 2>&1
echo         done

echo   [2/4] removing it from the Startup folders...
powershell -NoProfile -Command ^
  "$n=0; foreach ($d in @([Environment]::GetFolderPath('Startup'), [Environment]::GetFolderPath('CommonStartup'))) { if (Test-Path $d) { Get-ChildItem -LiteralPath $d -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'Hot ?Folder' } | ForEach-Object { Write-Host ('         removing ' + $_.Name); Remove-Item -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue; $n++ } } }; if ($n -eq 0) { Write-Host '         nothing there' }"

echo   [3/4] removing it from the registry run keys...
powershell -NoProfile -Command ^
  "$n=0; foreach ($k in 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run','HKLM:\Software\Microsoft\Windows\CurrentVersion\Run','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run') { if (Test-Path $k) { $p = Get-ItemProperty -Path $k; foreach ($v in $p.PSObject.Properties) { if ($v.Name -notmatch '^PS' -and ($v.Name + ' ' + $v.Value) -match 'HotFolder') { Write-Host ('         removing ' + $v.Name); Remove-ItemProperty -Path $k -Name $v.Name -Force -ErrorAction SilentlyContinue; $n++ } } } }; if ($n -eq 0) { Write-Host '         nothing there' }"

echo   [4/4] checking scheduled tasks...
powershell -NoProfile -Command ^
  "$t = Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -match 'Hot ?Folder' }; if ($t) { $t | ForEach-Object { Write-Host ('         disabling ' + $_.TaskName); Disable-ScheduledTask -TaskName $_.TaskName -TaskPath $_.TaskPath -ErrorAction SilentlyContinue | Out-Null } } else { Write-Host '         nothing there' }"

echo.
echo   ------------------------------------------------------------
echo    Done. It will not start with the PC any more.
echo   ------------------------------------------------------------
echo.
echo    START-BOOTH no longer launches it either while printing goes
echo    straight to Windows. Nothing was uninstalled - switch config.js
echo    back to "hotfolder" and it all comes back.
echo.
pause
exit /b 0
