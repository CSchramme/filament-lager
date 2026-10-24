#!/bin/bash
# Startet das Filament-Lager und öffnet es im Browser.
# Auf dem Mac per Doppelklick ausführbar (öffnet sich im Terminal).

cd "$(dirname "$0")" || exit 1
PORT="${PORT:-3000}"
URL="http://localhost:$PORT"

# Ein per Doppelklick geöffnetes Terminal kennt die Homebrew-Pfade oft nicht.
export PATH="$PATH:/usr/local/bin:/opt/homebrew/bin"

open_url() {
  if command -v open >/dev/null 2>&1; then
    open "$1"
  elif command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$1" >/dev/null 2>&1
  else
    echo "Im Browser öffnen: $1"
  fi
}

fail() {
  echo
  echo "$1"
  read -r -p "Zum Schließen Enter drücken …"
  exit 1
}

if ! command -v node >/dev/null 2>&1; then
  open_url "https://nodejs.org/de/download"
  fail "Node.js ist nicht installiert. Bitte die LTS-Version von https://nodejs.org installieren und diese Datei erneut öffnen."
fi
if [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  fail "Node.js $(node -v) ist zu alt. Bitte Version 20 oder neuer von https://nodejs.org installieren."
fi

# Läuft das Lager schon, nur den Browser öffnen.
if curl -fs "$URL/api/health" >/dev/null 2>&1; then
  echo "Das Filament-Lager läuft bereits: $URL"
  open_url "$URL"
  exit 0
fi

# Beim ersten Start oder nach einem Update die Abhängigkeiten installieren.
if [ ! -d node_modules ] || [ package.json -nt node_modules ] || [ package-lock.json -nt node_modules ]; then
  echo "Installiere Abhängigkeiten (nur beim ersten Start) …"
  npm install --omit=dev --no-audit --no-fund || fail "Die Installation ist fehlgeschlagen. Besteht eine Internetverbindung?"
  touch node_modules
fi

# Browser öffnen, sobald der Server antwortet.
(
  for _ in $(seq 1 30); do
    sleep 1
    if curl -fs "$URL/api/health" >/dev/null 2>&1; then
      open_url "$URL"
      break
    fi
  done
) &

echo
echo "Zum Beenden dieses Fenster schließen oder ctrl+C drücken."
echo
node src/server.js || fail "Das Filament-Lager wurde mit einem Fehler beendet."
