@echo off
setlocal EnableExtensions
title ShipCrew Payroll - Local Server
cd /d "%~dp0"

echo.
echo  ================================================
echo   ShipCrew Payroll - starting on this computer
echo  ================================================
echo.

set "PORT=8080"

rem ---- If the app is already running on this computer, just open the browser ----
netstat -ano | findstr /C:":%PORT% " | findstr /I "LISTENING" >nul 2>nul
if not errorlevel 1 goto :alreadyrunning

rem ---- Find real Python. Note: on Windows 10/11 the command "python" can be a
rem ---- fake Microsoft Store shortcut, so we test that each one really works. ----
set "PYCMD="
py -3 --version >nul 2>nul
if not errorlevel 1 set "PYCMD=py -3"
if defined PYCMD goto :runpython

python --version >nul 2>nul
if not errorlevel 1 set "PYCMD=python"
if defined PYCMD goto :runpython

python3 --version >nul 2>nul
if not errorlevel 1 set "PYCMD=python3"
if defined PYCMD goto :runpython

rem ---- No working Python? Try Node.js as a fallback. ----
node --version >nul 2>nul
if not errorlevel 1 goto :runnode

echo  Neither Python nor Node.js was found on this computer.
echo  The app needs one of them to run on your own computer.
echo.
echo  Easiest: install Python (free, takes 2 minutes):
echo.
echo    1. Open:  https://www.python.org/downloads/
echo    2. Click "Download Python"
echo    3. Run the installer. IMPORTANT: on the first screen,
echo       tick the box that says "Add Python to PATH"
echo    4. Click "Install Now", wait for it to finish
echo    5. Double-click start-windows.bat again
echo.
start "" "https://www.python.org/downloads/"
echo  (I opened the Python download page in your browser.)
echo.
echo  If you DID install Python already and still see this message,
echo  the "Add Python to PATH" box was probably not ticked during
echo  installation. Easiest fix: run the installer again and tick it.
echo.
echo  More help: see the Troubleshooting section in README.md.
echo.
pause
exit /b 1

:runpython
echo  Starting the app server with Python...
start "" "http://localhost:%PORT%"
echo.
echo  Your browser should open at http://localhost:%PORT%
echo  Keep this black window OPEN while using the app.
echo  To stop the app: close this window.
echo.
%PYCMD% -m http.server %PORT%
echo.
echo  The server stopped. If you did not stop it yourself, read any
echo  message above - it usually says exactly what went wrong.
echo  (For example "Port 8080 is in use" means another copy of this
echo  app is already running - open http://localhost:8080 instead.)
echo.
pause
exit /b 0

:runnode
echo  Starting the app server with Node.js...
start "" "http://localhost:%PORT%"
echo.
echo  Your browser should open at http://localhost:%PORT%
echo  Keep this black window OPEN while using the app.
echo  To stop the app: close this window.
echo.
node "%~dp0server.js" %PORT%
echo.
echo  The server stopped. If you did not stop it yourself, read any
echo  message above - it usually says exactly what went wrong.
echo.
pause
exit /b 0

:alreadyrunning
echo  Something is already listening on port %PORT% - most likely this
echo  app is already running (perhaps in another window).
echo.
echo  Opening your browser now...
start "" "http://localhost:%PORT%"
echo.
echo  If the page does not open: this window stays open, so you can
echo  read any error. To stop an old copy, close its black window,
echo  then double-click start-windows.bat again.
echo.
pause
exit /b 0
