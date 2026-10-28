@echo off
rem Startet das Filament-Lager unter Windows und oeffnet es im Browser.
cd /d "%~dp0"
if "%PORT%"=="" set PORT=3000

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js ist nicht installiert. Bitte die LTS-Version von https://nodejs.org installieren.
  start "" https://nodejs.org/de/download
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installiere Abhaengigkeiten, nur beim ersten Start ...
  call npm install --omit=dev --no-audit --no-fund
  if errorlevel 1 (
    echo Die Installation ist fehlgeschlagen. Besteht eine Internetverbindung?
    pause
    exit /b 1
  )
)

start "" /b cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:%PORT%"
echo Zum Beenden dieses Fenster schliessen oder Strg+C druecken.
node src\server.js
pause
