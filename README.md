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
- **Rollennummern**: Jede Rolle hat eine feste Nummer (#1, #2, …), die sich nie ändert und nach
  dem Löschen nicht neu vergeben wird. Gut zum Aufschreiben auf die Spule; die Suche findet `#12`.
- **Rechner**: STL oder 3MF hochladen, Rolle wählen, Preis mit Filament, Strom, Drucker,
  Fehldrucken, Arbeit und Gewinn ablesen (siehe unten).
- **Drucke**: Belege mit der Aufteilung des Preises pro Teil, Umsatz und Gewinn, Stromabrechnung
  für den, der den Strom bezahlt, und der Druckverlauf von Bambu mit Kosten je Druck.
- **API** zum Abrufen: Bestand je Farbe, Material und Platz, einzelne Rollen über ihre Nummer,
  AMS-Belegung (siehe unten).
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

## Rechner

Unter **Rechner** eine STL- oder 3MF-Datei hochladen (die Datei bleibt auf dem Gerät), eine Rolle
aus dem Lager wählen und den Preis ablesen:

| Posten | Rechnung | Standard |
|---|---|---|
| Filament | Gramm × Kaufpreis der Rolle ÷ Kaufgewicht | ohne Kaufpreis 20 € pro kg |
| Strom | Druckzeit × Leistung des Druckers × Strompreis | 120 W, 0,30 € pro kWh |
| Drucker | Druckzeit × Stundensatz für Abnutzung, Düsen, Platten, Ersatzteile | 0,30 € pro Stunde |
| Fehldrucke | Zuschlag auf Filament + Strom, weil nicht jeder Druck klappt | 10 % |
| Arbeit | Arbeitszeit pro Auftrag × Stundenlohn, geteilt durch die Stückzahl | 5 Min. × 15 € pro Stunde |
| Selbstkosten | Summe der Posten oben | |
| Gewinn | Aufschlag auf die Selbstkosten | 30 % |
| **Preis pro Stück** | Selbstkosten + Gewinn | |
| Mindestpreis | gilt für den ganzen Beleg, darunter kommt ein Aufschlag dazu | 3 € |

Beispiel Kabelhalter, 31,2 g zu 2 ct, 1:24 Std.: Filament 0,62 € + Strom 0,05 € + Drucker 0,42 € +
Fehldrucke 0,07 € + Arbeit 1,25 € = 2,41 € Selbstkosten, dazu 0,72 € Gewinn, also **3,13 €**. Bei
drei Stück verteilt sich die Arbeit, dann kostet eines 2,05 €.

Alle Werte stehen unter **Einstellungen → Preisrechnung**. Arbeitszeit und Gewinn lassen sich im
Rechner für die einzelne Rechnung ändern. Jeder Posten wird auf Cent gerundet, damit die Beträge
auf dem Beleg genau aufgehen.

- **Gramm:** Bei einer in Bambu Studio geslicten 3MF (nach dem Slicen über Datei → Exportieren die
  geslicte Platte als `.gcode.3mf` speichern) nimmt der Rechner die genauen Gramm und zeigt die Druckzeit. Bei einer STL oder
  ungeslicten 3MF schätzt er aus Volumen und Oberfläche (Außenhaut voll, Inneres mit 15 % Infill,
  einstellbar). Stützen sind in der Schätzung nicht enthalten. Gramm lassen sich auch von Hand eintragen.
- **Kaufpreis:** Für jede Rolle eintragen, was sie gekostet hat: im Bearbeiten-Dialog unter
  „Kaufpreis der Rolle in €“ oder direkt im Rechner, der danach fragt, wenn er fehlt. Bis dahin
  rechnet er mit dem Standardpreis pro kg aus den Einstellungen.
- **Druckzeit:** kommt aus einer geslicten 3MF oder dem Druckverlauf; sonst von Hand eintragen
  (z. B. `1:30`). Ohne Druckzeit fehlen Strom und Drucker im Preis. Die Leistung hängt vom Modell
  und Material ab, 120 W ist ein Richtwert für PLA.
- Der Rechner zeigt, ob die gewählte Rolle reicht, und schlägt sonst Rollen in derselben Farbe vor.
  „… g von #5 abziehen“ verbucht den Druck direkt im Lager. „Angebot kopieren“ legt einen kurzen
  Text mit Modell, Farbe und Preis in die Zwischenablage. „Zum Beleg hinzufügen“ legt das Teil in
  den offenen Beleg.

## Belege, Strom und Druckverlauf

Unter **Drucke**:

- **Offener Beleg**: sammelt Teile aus dem Rechner und dem Druckverlauf („Zum Beleg“). Anzahl und
  Preis pro Stück lassen sich ändern (ein eigener Preis ändert nur den Gewinn), „Position von
  Hand“ fügt z. B. Versand hinzu. Mit Datum, Kunde und Notiz wird daraus mit „Beleg erstellen“ ein
  Beleg mit fester Nummer (2026-001, 2026-002, …). Der offene Beleg bleibt im Browser, bis er
  erstellt wird.
- **Beleg**: öffnet sich in einem neuen Fenster zum Drucken oder „Als PDF sichern“. Unter jeder
  Position steht die Aufteilung pro Teil und für alle Stück: Filament, Strom, Drucker, Fehldrucke,
  Arbeit, Selbstkosten, Gewinn. Name und Adresse für den Beleg und den Hinweis für
  Kleinunternehmer (§ 19 UStG) gibt es unter Einstellungen → Beleg und Strom. Alte Belege öffnen
  sich durch Antippen in der Liste; Umsatz und Gewinn stehen darüber.
- **Strom für Papa**: Wer den Strom bezahlt (Name unter Einstellungen), bekommt den Strom aller
  Drucke seit der letzten Abrechnung, auch für abgebrochene und eigene Drucke. Gerechnet wird aus
  dem Bambu-Druckverlauf (Druckzeit × Watt × Strompreis); ohne Bambu-Anmeldung aus den Belegen.
  „Abrechnung ansehen“ zeigt eine druckbare Aufstellung mit Unterschriftszeilen, „… an Papa
  gegeben“ speichert die Abrechnung, danach beginnt die nächste. Gezählt wird nur die Zeit beim
  Drucken, nicht der Standby.
- **Druckverlauf** aus dem Bambu-Konto (wird mit dem automatischen Abgleich geholt,
  „Aktualisieren“ holt ihn sofort): Titelbild, Datum, Drucker, Gramm, Druckzeit, die verwendeten
  Farben mit der passenden Lagerrolle und der Preis, bei mehrfarbigen Drucken je Farbe mit dem
  Kaufpreis der passenden Rolle. **Im Rechner** übernimmt Gramm, Druckzeit und Farbe in den
  Rechner. **Erneut drucken**: Einen Druck starten erlaubt Bambu nur in den eigenen Apps. Die App
  zeigt den Weg über Bambu Handy und verlinkt das Modell auf MakerWorld, wenn es von dort stammt.

Den Druckverlauf liefert die inoffizielle Bambu-Schnittstelle (`/v1/user-service/my/tasks`); bekannt
sind die Status „fertig“ und „abgebrochen“.

## API

Andere Programme (Home Assistant, Skripte, Waagen, Dashboards) können den Bestand lesen und das
Gewicht einer Rolle ändern. Unter **Einstellungen → API** einen Schlüssel erzeugen; dort stehen
auch fertige Links zum Kopieren. Mehr als Lesen und Gramm ändern erlaubt der Schlüssel nicht.
Mitschicken als Header `X-API-Key: <schlüssel>`, als `Authorization: Bearer <schlüssel>` oder in
der Adresse als `?key=<schlüssel>`.

| Adresse | Inhalt |
|---|---|
| `GET /api/v1/bestand` | Gesamtmenge, Summen nach Farbe (mit Materialien), Material und Platz, Nummern der knappen und leeren Rollen |
| `GET /api/v1/spulen` | Alle Rollen. Filter: `farbe`, `material`, `hersteller` (Teiltreffer), `paket`, `status` (`neu`, `ok`, `knapp`, `leer`), `im_ams` (`true`/`false`) |
| `GET /api/v1/spulen/12` | Rolle Nummer 12 |
| `GET /api/v1/ams` | Welche Rolle in welchem AMS-Slot liegt |
| `POST /api/v1/spulen/12/gewicht` | Gewicht von Rolle 12 ändern, mit genau einem Feld: `rest_g` (Restgewicht), `mit_spule_g` (von der Waage, Tara wird abgezogen) oder `verbraucht_g` (wird abgezogen). `PATCH /api/v1/spulen/12` geht ebenso. |

Beispiel:

```sh
curl -H "X-API-Key: DEIN_SCHLUESSEL" "https://lager.deine-domain.de/api/v1/spulen?farbe=schwarz"
```

```json
{
  "anzahl": 2,
  "rest_g": 1580,
  "spulen": [
    { "nr": 6, "material": "PLA Basic", "hersteller": "Bambu Lab", "farbe": "Schwarz", "farbcode": "#000000",
      "rest_g": 1000, "kauf_g": 1000, "mit_spule_g": 1274, "prozent": 100, "status": "neu",
      "im_ams": false, "ams_slot": null, "paket": "6", "platz": "Paket 6", "...": "..." }
  ]
}
```

Gramm ändern:

```sh
curl -X POST -H "X-API-Key: DEIN_SCHLUESSEL" -H "Content-Type: application/json" \
  -d '{"mit_spule_g": 924}' "https://lager.deine-domain.de/api/v1/spulen/3/gewicht"
```

Die Antwort enthält die Rolle mit dem neuen Stand und `vorher_g`.

Home Assistant (`configuration.yaml`), Sensor mit der Gesamtmenge und allen Farben als Attribut:

```yaml
rest:
  - resource: https://lager.deine-domain.de/api/v1/bestand
    headers:
      X-API-Key: !secret filament_lager_key
    scan_interval: 600
    sensor:
      - name: Filament gesamt
        unit_of_measurement: g
        value_template: "{{ value_json.gesamt_g }}"
        json_attributes:
          - nach_farbe
          - knapp

rest_command:
  filament_verbrauch:
    url: "https://lager.deine-domain.de/api/v1/spulen/{{ nr }}/gewicht"
    method: POST
    headers:
      X-API-Key: !secret filament_lager_key
    content_type: application/json
    payload: '{"verbraucht_g": {{ gramm }}}'
```

Aufruf in einer Automation: Aktion `rest_command.filament_verbrauch` mit `nr: 3` und `gramm: 25`.

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
- `public/js/calculator.js` – Rechner, `public/js/model.js` – STL/3MF lesen
- `src/api-v1.js` – API mit Schlüssel (lesen, Gramm ändern)
- `src/bambu/cloud.js` – Bambu Cloud (Anmeldung, Filament Manager)
- `src/bambu/sync.js` – Abgleich Lager ↔ Filament Manager
- `src/bambu/printer.js` – MQTT-Verbindung zum Drucker, `src/bambu/ams.js` – AMS-Abgleich
