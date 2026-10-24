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
- **Übersicht**: Filament gesamt, Spulen im AMS, knappe Spulen (weniger als 1/6 des Kaufgewichts übrig, einstellbar), ungeöffnete
  Reserve, Menge je Material.
- **Plätze**: zeigt jedes Paket und jeden AMS-Slot mit den Spulen darin. Spulen antippen und beim
  Ziel auf „Hierher“ tippen, am Rechner auch per Ziehen und Ablegen. Mehrere Spulen gehen auf einmal.
  Ist ein AMS-Slot belegt, tauschen die Spulen den Platz. Pakete lassen sich anlegen, umbenennen
  und entfernen; eine reine Zahl wird als „Paket 3“ angezeigt.
- In der Lagerliste öffnet der Platz-Knopf jeder Spule eine Schnellauswahl (AMS-Slot, AMS ohne
  Slot, Paket, neues Paket).
- Suchen, filtern (im AMS, geöffnet, ungeöffnet, knapp) und sortieren.
- Spulen anlegen (auch mehrere gleiche auf einmal), bearbeiten, duplizieren, löschen.
- **Import/Export**: CSV im Excel-Format (Semikolon, deutsche Spaltennamen) und JSON-Sicherung.
- **Bambu Filament Manager (Cloud)**: wird automatisch abgeglichen, alle 10 Minuten und beim
  Öffnen der Seite. Neue Spulen aus Bambu Studio/Handy kommen ins Lager, gleiche Spulen werden
  über RFID, Cloud-ID oder gleiche Merkmale (Hersteller, Material, ähnliche Farbe, Kaufgewicht)
  zugeordnet, Restgewichte nach dem Drucken übernommen. Gewogene Werte gehen dabei nicht
  verloren. Spulen lassen sich außerdem nach Bambu senden.
- **AMS live** über das Bambu-Konto (ohne IP-Adresse, auch auf einem Webserver) oder direkt im
  Heimnetz: Farbe, Material und Füllstand jedes Slots, Luftfeuchte, laufender Druck. „Im AMS“
  und der Slot werden automatisch gesetzt. Einmal zugeordnete Spulen merken sich ihre RFID und
  werden danach in jedem Slot erkannt.

Der Startbestand sind die 18 Spulen aus der Excel-Tabelle.

## Starten auf dem Mac

1. [Node.js](https://nodejs.org) in Version 20 oder neuer installieren (LTS-Version, einmalig).
2. Dieses Repository herunterladen (grüner Button „Code“ → „Download ZIP“) und entpacken,
   z. B. in den Ordner „Dokumente“.
3. Im entpackten Ordner **`Filament-Lager starten.command`** doppelklicken.
   - Beim allerersten Mal meldet macOS, dass die Datei aus dem Internet stammt. Dann einmal
     mit Rechtsklick (oder ctrl+Klick) auf die Datei → „Öffnen“ → „Öffnen“ bestätigen. Bei
     neueren macOS-Versionen stattdessen unter Systemeinstellungen → Datenschutz & Sicherheit
     „Dennoch öffnen“ wählen.
   - Meldet macOS „keine Zugriffsrechte“, einmal im Terminal ausführen:
     `chmod +x ~/Documents/filament-lager-main/"Filament-Lager starten.command"`
     (Pfad an den Ordner anpassen).
4. Ein Terminal-Fenster öffnet sich. Beim ersten Start werden die Bausteine installiert, danach
   öffnet sich das Lager im Browser. Das Fenster offen lassen, solange das Lager laufen soll.
   Schließen beendet es.
5. Am Handy im selben WLAN die Adresse verwenden, die im Terminal unter „Im Heimnetz“ steht
   (z. B. `http://192.168.178.23:3000`). Das geht nur, solange der Mac wach ist.

Läuft das Lager schon, öffnet ein weiterer Doppelklick nur den Browser.

Damit das Lager nach jedem Anmelden automatisch startet: Systemeinstellungen → Allgemein →
Anmeldeobjekte → „+“ → `Filament-Lager starten.command` auswählen.

Unter Windows heißt die Startdatei `Filament-Lager starten.bat`. Ohne Startdatei geht es im
Terminal mit `npm install` und danach `npm start`.

Die Daten liegen in `data/lager.json`. Diese Datei sichern, dann ist alles gesichert.

Einstellungen über Umgebungsvariablen:

| Variable          | Bedeutung                                   | Standard           |
|-------------------|---------------------------------------------|--------------------|
| `PORT`            | Port der Weboberfläche                      | `3000`             |
| `LAGER_DATEI`     | Pfad der Datendatei                         | `data/lager.json`  |
| `LAGER_PASSWORT`  | Passwort für die Anmeldung (unter Plesk Pflicht) | kein Passwort  |

## Dauerhaft laufen lassen (Raspberry Pi, NAS, Heimserver)

Mit Docker:

```sh
docker compose up -d --build
```

Die Daten landen im Ordner `data/` neben der `docker-compose.yml`.

## Auf einem Webserver mit Plesk

Voraussetzung: Plesk mit der Erweiterung „Node.js“ (Node.js 20 oder neuer) und eine Domain oder
Subdomain, z. B. `lager.deine-domain.de`, mit SSL-Zertifikat (Let's Encrypt).

1. **Dateien hochladen:** Das Repository als ZIP herunterladen. Im Plesk-Dateimanager einen
   neuen Ordner **neben** `httpdocs` anlegen, z. B. `/filament-lager`, die ZIP dort hochladen
   und entpacken. Die Dateien (`package.json`, `start.cjs`, `public/`, `src/` …) müssen direkt
   in `/filament-lager` liegen, nicht in einem Unterordner.
2. **Node.js einrichten:** In Plesk bei der Domain auf „Node.js“ gehen und eintragen:

   | Feld                                  | Wert                                   |
   |---------------------------------------|----------------------------------------|
   | Node.js-Version                       | 20 oder neuer                          |
   | Anwendungsstamm                       | `/filament-lager`                      |
   | Dokumentstamm                         | `/filament-lager/public`               |
   | Anwendungsmodus                       | `production`                           |
   | Anwendungsstartdatei                  | `start.cjs`                            |
   | Benutzerdefinierte Umgebungsvariablen | `LAGER_PASSWORT` = ein langes Passwort |

3. **„NPM install“** klicken, danach **„Node.js aktivieren“** (oder „App neu starten“).
4. Die Domain im Browser öffnen und mit dem Passwort anmelden. Am Handy bleibt man angemeldet.

Wichtig:

- **Startdatei ist `start.cjs`**, nicht `src/server.js`. Plesk lädt die Startdatei auf eine Art,
  die mit modernen JavaScript-Modulen nicht funktioniert; `start.cjs` lädt den Server richtig.
- **Ohne `LAGER_PASSWORT` bleibt das Lager unter Plesk gesperrt**, damit niemand aus dem
  Internet den Bestand ändern oder die Bambu-Anmeldung nutzen kann. Nach 10
  Fehlversuchen sperrt die Anmeldung eine Adresse für 15 Minuten.
- Die Daten liegen in `/filament-lager/data/lager.json`, außerhalb des Dokumentstamms und damit
  nicht direkt abrufbar. Plesk-Backups sichern sie mit.
- **Bambu Filament Manager** (Cloud) funktioniert auch vom Webserver aus, sofern der Hoster
  ausgehende Verbindungen erlaubt.
- **AMS live** läuft auf dem Webserver über das Bambu-Konto. Eine IP-Adresse des Druckers wird
  nicht gebraucht, „Drucker im Heimnetz“ bleibt leer.
- Plesk hält die App an, wenn sie eine Weile nicht benutzt wird. Beim nächsten Öffnen startet
  sie neu, verbindet sich mit dem Drucker und gleicht sofort mit Bambu ab.
- **Update:** neue Dateien hochladen (den Ordner `data/` dabei nicht überschreiben),
  „NPM install“ und „App neu starten“.

## Bambu Filament Manager verbinden

1. In der App auf **Bambu** gehen.
2. Unter „Bambu Filament Manager“ die E-Mail-Adresse des Bambu-Kontos eingeben.
   - Mit Passwort: Passwort dazu eingeben. Bambu schickt meist zusätzlich einen Code per E-Mail.
   - **Konto mit Google oder Apple angelegt:** Passwort leer lassen. Bambu schickt dann einen
     Anmeldecode an die E-Mail-Adresse (bei Google die Gmail-Adresse).
3. Den Code eingeben. Ab jetzt läuft alles automatisch:
   - Die Spulen aus dem Filament Manager werden geholt und den Lagerspulen zugeordnet; was es im
     Lager noch nicht gibt, kommt neu dazu (unter „Plätze“ bei „Ohne Platz“).
   - Die Drucker des Kontos erscheinen unter „AMS live“, und die Slots werden zugeordnet.
   - Danach wird alle 10 Minuten und beim Öffnen der Seite erneut abgeglichen.

Restgewichte: Hat sich nur bei Bambu etwas geändert (z. B. nach einem Druck), gilt Bambus Wert.
Hast du die Spule gewogen und bei Bambu hat sich nichts geändert, bleibt dein Wert. Haben sich
beide geändert, gilt der kleinere.

Von Hand gibt es außerdem **„Jetzt holen (mit Vorschau)“** und **„Nach Bambu senden“**. Senden
legt Lagerspulen im Filament Manager an oder aktualisiert sie; danach erscheinen sie in Bambu
Studio und Bambu Handy. Beides lässt sich vorher in einer Liste prüfen.

Das Passwort wird nicht gespeichert, nur der Anmelde-Token (in `data/lager.json`, gilt etwa
drei Monate). Gelöscht wird bei der Synchronisierung nichts, weder im Lager noch bei Bambu.

Falls der Code nicht ankommt oder die Anmeldung blockiert wird, geht es auch über den Token:

1. In Chrome `bambulab.com` öffnen und wie gewohnt anmelden, auch mit Google.
2. Entwicklertools öffnen (Mac: <kbd>⌥ ⌘ I</kbd>), Reiter „Application“, links „Cookies“ →
   `https://bambulab.com`.
3. Den Wert der Zeile `token` kopieren und in der App unter „Token von Hand eintragen“ einfügen.

Als letzte Möglichkeit kann man versuchen, auf bambulab.com über „Passwort vergessen“ ein
Passwort für das Google-Konto festzulegen und sich dann mit E-Mail und Passwort anzumelden.

> Bambu Lab bietet für den Filament Manager keine offizielle Schnittstelle an. Die App nutzt
> dieselben Endpunkte wie Bambu Studio, so wie sie von der Community dokumentiert wurden
> (ha-bambulab, OrcaSlicer-Plugin „bambu-filament-manager“). Ändert Bambu diese Schnittstelle,
> funktioniert die Synchronisierung unter Umständen nicht mehr; das Lager selbst ist davon nicht
> betroffen.

## AMS live einrichten

Mit Bambu-Anmeldung ist nichts weiter zu tun: Die Drucker des Kontos werden über die Bambu
Cloud verbunden („AMS live über das Bambu-Konto“). Spulen, die im Lager als „im AMS“ markiert
sind, werden nach Material und Farbe den Bambu-Spulen in den Slots zugeordnet und merken sich
deren RFID.

Ohne Bambu-Konto, oder wenn das Lager im selben Netz wie der Drucker läuft, geht es auch direkt.
Dazu unter **Bambu** → „Drucker im Heimnetz eintragen“:

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
- `start.cjs` – Startdatei für Plesk, `src/server.js` – Start, `src/app.js` – HTTP-Schnittstelle,
  `src/auth.js` – Anmeldung, `src/store.js` – Datendatei
- `src/bambu/cloud.js` – Bambu Cloud (Anmeldung, Filament Manager)
- `src/bambu/sync.js` – Abgleich Lager ↔ Filament Manager
- `src/bambu/printer.js` – MQTT-Verbindung zum Drucker, `src/bambu/ams.js` – AMS-Abgleich
