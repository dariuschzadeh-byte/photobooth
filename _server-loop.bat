@echo off
REM ====================================================================
REM  fr-anz photobooth - server watchdog
REM  Runs the booth server and restarts it automatically if it stops.
REM  Started by START-BOOTH.bat - do not run this directly.
REM  Everything it prints is also written to data\server.log
REM ====================================================================
title fr-anz server (do not close this window)
cd /d "%~dp0"

:loop
echo. >> "data\server.log"
echo ===== server started %DATE% %TIME% ===== >> "data\server.log"
REM  full path on purpose: it lets STOP-BOOTH find exactly this server
node "%~dp0server.js" >> "data\server.log" 2>&1
echo ===== server stopped %DATE% %TIME% - restarting in 5s ===== >> "data\server.log"
ping -n 6 127.0.0.1 >nul
goto loop
