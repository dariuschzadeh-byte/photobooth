@echo off
REM ====================================================================
REM  fr-anz photobooth - SELF TEST
REM  Checks the software side: voucher codes, the daily staff limit, the
REM  statistics, and building a printable strip.
REM  Runs against a temporary data folder, so it cannot spend a voucher.
REM  Says nothing about camera or printer - use CHECK-PRINTER for those.
REM ====================================================================
title fr-anz photobooth - self test
cd /d "%~dp0"
mode con: cols=78 lines=30

node "scripts\self-test.js"

echo.
pause
exit /b 0
