@echo off
REM ====================================================================
REM  fr-anz photobooth - WHERE THE PHOTOS ARE
REM  Opens the folders and says which one holds what. Reads only --
REM  nothing is changed, nothing is printed, nothing is deleted.
REM ====================================================================
title fr-anz photobooth - where the photos are
cd /d "%~dp0"

echo.
echo   fr-anz photobooth - where the photos are
echo.
echo   There are THREE places and they hold different things.
echo.
echo   1  output\prints      The finished strips, exactly as printed.
echo                         This is what a guest walks away with.
echo                         One file per session.
echo.
echo   2  output\sessions    The camera's own photos, straight off the
echo                         Canon, before the software touches them.
echo                         One folder per session, three photos each.
echo.
echo   3  output\analysis    Comparison sheets. These only appear after
echo                         you run CHECK PHOTOS, TRY COLOUR or
echo                         MATCH OLD LOOK.
echo.
echo   EXAMPLE-STRIP.png in the photobooth folder shows what the
echo   settings look like right now - built without the camera and
echo   without paper.
echo.
echo   You can also see every strip in the browser, as thumbnails:
echo   open  http://localhost:3000/admin  and scroll to "Photos".
echo   That page also has PREVIEW MODE - run a real session that
echo   builds the strip but uses no paper.
echo.
echo   ------------------------------------------------------------
echo.

if not exist "output\prints" (
  echo   No output\prints folder yet - the booth has not built a strip
  echo   on this PC so far. Start the booth and run one session.
  echo.
  goto example
)

set COUNT=0
for %%f in ("output\prints\*.png") do set /a COUNT+=1
echo   %COUNT% finished strip^(s^) in output\prints
echo.
echo   Opening the folder...
start "" "%~dp0output\prints"

:example
echo   Rebuilding EXAMPLE-STRIP.png from the settings in config.js...
node "scripts\example-strip.js"
if exist "EXAMPLE-STRIP.png" (
  start "" "%~dp0EXAMPLE-STRIP.png"
)

echo.
pause
exit /b 0
