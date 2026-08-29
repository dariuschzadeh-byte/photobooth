@echo off
REM ====================================================================
REM  fr-anz photobooth - CREATE THE DESKTOP ICONS
REM  Makes shortcuts on the desktop for the everyday tasks.
REM
REM  Shortcuts, never copies. A .bat file finds the project through its
REM  OWN location (%~dp0), so a copy sitting on the desktop looks for the
REM  booth on the desktop and fails. A shortcut keeps pointing at the
REM  real folder, which is why the existing icons work.
REM ====================================================================
title fr-anz photobooth - desktop icons
cd /d "%~dp0"

echo.
echo   creating desktop icons...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$here = '%~dp0'.TrimEnd('\'); $desk = [Environment]::GetFolderPath('Desktop'); $sh = New-Object -ComObject WScript.Shell; $list = @(@('1 - START PHOTOBOOTH','START-BOOTH.bat'), @('2 - STOP PHOTOBOOTH','STOP-BOOTH.bat'), @('3 - UPDATE PHOTOBOOTH','UPDATE-BOOTH.bat'), @('4 - CHECK PHOTOS','CHECK-PHOTOS.bat'), @('5 - SHOW CODES','SHOW-CODES.bat'), @('6 - TRY BRIGHTNESS','TRY-EXPOSURE.bat'), @('7 - SHOW LOG','SHOW-LOG.bat'), @('8 - TRY THE LOOK','TRY-LOOK.bat'), @('9 - CONNECT DASHBOARD','CONNECT-DASHBOARD.bat'), @('10 - CHECK PRINTER','CHECK-PRINTER.bat'), @('11 - SELF TEST','SELF-TEST.bat'), @('12 - RESTART PRINTER','RESTART-PRINTER.bat'), @('13 - FIX PRINTING','FIX-PRINTING.bat'), @('14 - CLEAN PRINTER LOGS','CLEAN-PRINTER-LOGS.bat'), @('9 - IMPORT CODES','IMPORT-CODES.bat')); foreach ($i in $list) { $t = Join-Path $here $i[1]; if (Test-Path $t) { $l = $sh.CreateShortcut((Join-Path $desk ($i[0] + '.lnk'))); $l.TargetPath = $t; $l.WorkingDirectory = $here; $l.Save(); Write-Host ('   ok   ' + $i[0]) } else { Write-Host ('   skip ' + $i[0] + '  (' + $i[1] + ' not found)') } }"

if errorlevel 1 (
  echo.
  echo   Something went wrong. Send this window to Dariusch.
  echo.
  pause
  exit /b 1
)

echo.
echo   ------------------------------------------------------------
echo    Done. Any .bat file you dragged onto the desktop yourself
echo    should be moved back into this folder - a copy out here
echo    cannot find the booth and will refuse to run.
echo   ------------------------------------------------------------
echo.
pause
exit /b 0
