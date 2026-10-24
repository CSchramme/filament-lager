# Filament-Lager

Web-App für den Filamentbestand, entstanden aus der Excel-Tabelle „Filament Tabelle“.
Läuft im Browser am Rechner und am Handy und kann sich mit dem **Bambu Lab Filament
Manager** (Bambu Studio / Bambu Handy) und dem **AMS** verbinden.

## Was die App kann

- **Lagerliste** mit Farbe, Material, Hersteller, Restgewicht, Gewicht mit Spule, Kaufgewicht,
  Lagerort/Paket, geöffnet, im AMS und Spulenart, wie in der Excel-Tabelle.
- **Wiegen**: Gewicht mit Spule von der Waage eintippen, die Tara der Spulenart wird
  abgezogen (Bambu-Plastikspule 274 g, Pappe 0 g, beides änderbar). Die App zeigt auch an,
  wie viel seit dem letzten Wiegen verbraucht wurde.
- **Übersicht**: Filament gesamt, Spulen im AMS, knappe Spulen (Grenze einstellbar), ungeöffnete
  Reserve, Menge je Material.
- Suchen, filtern (im AMS, geöffnet, ungeöffnet, knapp) und sortieren.
- Spulen anlegen (auch mehrere gleiche auf einmal), bearbeiten, duplizieren, löschen.
- **Import/Export**: CSV im Excel-Format (Semikolon, deutsche Spaltennamen) und JSON-Sicherung.
- **Bambu Filament Manager (Cloud)**: Spulen von Bambu holen und Spulen nach Bambu senden,
  jeweils mit Vorschau. Spulen werden über RFID, Cloud-ID oder gleiche Merkmale (Hersteller,
  Material, Farbe, Kaufgewicht) einander zugeordnet. Optional werden die Restgewichte alle
  15 Minuten von Bambu übernommen.
- **AMS live** über das Heimnetz: Farbe, Material und Füllstand jedes Slots, Luftfeuchte,
  laufender Druck. „Im AMS“ wird automatisch gesetzt (RFID-Spulen oder von Hand zugeordnete
  Slots), Slots lassen sich Lagerspulen zuordnen oder als neue Spule anlegen.

Der Startbestand sind die 18 Spulen aus der Excel-Tabelle.

## Starten auf dem Mac (oder Windows/Linux)

1. [Node.js](https://nodejs.org) in Version 20 oder neuer installieren (LTS-Version).
2. Dieses Repository herunterladen (grüner Button „Code“ → „Download ZIP“) und entpacken.
3. Im Terminal in den Ordner wechseln und einmalig die Abhängigkeiten installieren:
   ```sh
   npm install
   ```
4. Starten:
   ```sh
   npm start
   ```
5. Im Browser `http://localhost:3000` öffnen. Am Handy im selben WLAN die Adresse verwenden,
   die beim Start angezeigt wird (z. B. `http://192.168.178.23:3000`).

Die Daten liegen in `data/lager.json`. Diese Datei sichern, dann ist alles gesichert.

Einstellungen über Umgebungsvariablen:

| Variable          | Bedeutung                                   | Standard           |
|-------------------|---------------------------------------------|--------------------|
| `PORT`            | Port der Weboberfläche                      | `3000`             |
| `LAGER_DATEI`     | Pfad der Datendatei                         | `data/lager.json`  |
| `LAGER_PASSWORT`  | Passwort für die Oberfläche (Benutzername egal) | kein Passwort  |

## Dauerhaft laufen lassen (Raspberry Pi, NAS, Heimserver)

Mit Docker:

```sh
docker compose up -d --build
```

Die Daten landen im Ordner `data/` neben der `docker-compose.yml`.

## Bambu Filament Manager verbinden

1. In der App auf **AMS & Bambu** gehen.
2. Unter „Bambu Filament Manager“ E-Mail und Passwort des Bambu-Kontos eingeben.
3. Bambu schickt meist einen Bestätigungscode per E-Mail. Den Code eingeben.
4. **Von Bambu holen**: zeigt, welche Spulen aus dem Filament Manager neu ins Lager kommen,
   welche zugeordnet werden und wo sich Restgewichte geändert haben. Auswählen, übernehmen.
5. **Nach Bambu senden**: legt Lagerspulen im Filament Manager an oder aktualisiert sie
   (Restgewicht, Kaufgewicht, Farbe, Notiz). Danach erscheinen sie in Bambu Studio und Bambu Handy.

Das Passwort wird nicht gespeichert, nur der Anmelde-Token (in `data/lager.json`, gilt etwa
drei Monate). Gelöscht wird bei der Synchronisierung nichts, weder im Lager noch bei Bambu.

Falls die Anmeldung blockiert wird, kann der Token auch von Hand eingetragen werden: auf
bambulab.com einloggen und in den Entwicklertools des Browsers unter Cookies den Wert `token`
kopieren.

> Bambu Lab bietet für den Filament Manager keine offizielle Schnittstelle an. Die App nutzt
> dieselben Endpunkte wie Bambu Studio, so wie sie von der Community dokumentiert wurden
> (ha-bambulab, OrcaSlicer-Plugin „bambu-filament-manager“). Ändert Bambu diese Schnittstelle,
> funktioniert die Synchronisierung unter Umständen nicht mehr; das Lager selbst ist davon nicht
> betroffen.

## AMS live einrichten

Unter **AMS & Bambu** → „Drucker im Heimnetz“ eintragen:

- **IP-Adresse** und **Zugangscode**: am Drucker unter Einstellungen bei WLAN/Netzwerk.
- **Seriennummer**: in Bambu Studio unter Gerät oder auf dem Aufkleber am Drucker.

Der Rechner mit dem Filament-Lager muss im selben Netz sein wie der Drucker. Die App liest
nur (MQTT über TLS, Port 8883) und schickt keine Befehle an den Drucker außer der Bitte um den
aktuellen Status. Je nach Firmware muss am Drucker der LAN-Modus bzw. Entwicklermodus aktiv
sein, damit andere Programme den Status lesen dürfen.

Den Füllstand in Prozent meldet das AMS nur für Bambu-Spulen mit RFID-Chip. Für andere Spulen
bleibt Wiegen der genaue Weg.

## Ohne Server

Die Oberfläche funktioniert auch als reine Webseite (z. B. den Ordner `public/` auf GitHub Pages
oder einem beliebigen Webspace). Dann liegen die Daten nur im jeweiligen Browser und die
Bambu-Anbindung ist nicht verfügbar. Mit „Sicherung (JSON)“ lassen sich die Daten später in die
Server-Version übernehmen.

## Entwicklung

```sh
npm test      # Tests (Node-Testrunner)
npm run dev   # Server mit automatischem Neustart
```

Aufbau:

- `public/` – Oberfläche (HTML, CSS, JavaScript-Module ohne Build-Schritt)
  - `js/domain.js` – Fachlogik (Gewichte, Farben, CSV), auch vom Server genutzt
  - `js/seed.js` – Startbestand aus der Excel-Tabelle
- `src/server.js` – Start, `src/app.js` – HTTP-Schnittstelle, `src/store.js` – Datendatei
- `src/bambu/cloud.js` – Bambu Cloud (Anmeldung, Filament Manager)
- `src/bambu/sync.js` – Abgleich Lager ↔ Filament Manager
- `src/bambu/printer.js` – MQTT-Verbindung zum Drucker, `src/bambu/ams.js` – AMS-Abgleich
