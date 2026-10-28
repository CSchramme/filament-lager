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
- **Verkauf**: Belege mit der Aufteilung des Preises pro Teil, Angebote, die mit einem Klick zum
  Beleg werden, Kundenliste, Versand als feste Position und **DHL-Sendungsverfolgung** mit der
  Sendungsnummer.
- **Verschenkt**: wem du Gratis-Proben oder Geschenke gegeben hast, was es war, was es gekostet
  hat und ob die Person danach bestellt hat.
- **Bestellverfolgung für Kunden** wie bei Versandhändlern: Bestellung eingegangen, in
  Bearbeitung, wird gedruckt (mit Fortschritt live vom Drucker), verpackt, versendet (mit DHL),
  zugestellt, über einen Link ohne Passwort.
- **Schöne Preise**: Preis pro Teil aufrunden (z. B. auf 0,50 €) und **Mengenrabatt** ab einer
  Stückzahl.
- **Drucke**: Stromabrechnung für den, der den Strom bezahlt, mit einem **Link nur zum Ansehen**
  (z. B. für Papa), und der Druckverlauf von Bambu mit Kosten je Druck. Fertige Drucke werden auf
  Wunsch **automatisch von der Rolle abgebucht**.
- **Preisliste**: Einkaufspreis je Filamentart (PLA Basic 19,99 €), gilt für neue Rollen und Rollen
  ohne eigenen Preis; Filamentart im Spulen-Dialog als Auswahl mit Suche.
- **Vorrat**: mehrere gleiche Teile auf einmal drucken (z. B. 25 Kürbisse) und einzeln verkaufen;
  die Arbeit verteilt sich auf alle Teile, der Vorrat zählt mit.
- **Etiketten mit QR-Code** zum Aufkleben auf die Spulen. Scannen mit der Handykamera öffnet die
  Rolle direkt zum Wiegen.
- **Einkaufsliste**: was knapp ist und keinen Ersatz im Lager hat, mit dem zuletzt bezahlten Preis.
- **Filament unterwegs**: bestellte Pakete mit DHL-Sendungsnummer, Stand von DHL, Meldung bei
  Zustellung und „Ins Lager“, das die Rollen mit Kaufpreis und Kaufdatum anlegt.
- **Benachrichtigungen aufs Handy** (App ntfy): Druck fertig, abgebrochen oder pausiert, Rolle
  wird knapp, Paket zugestellt.
- **Auswertung**: Umsatz und Gewinn pro Monat, Filamentverbrauch pro Monat und nach Farbe,
  Bestseller, Strom und Lagerwert, dazu die **Jahresübersicht für die Steuer** (Einnahmen,
  Ausgaben, Ergebnis, § 19 UStG, CSV und PDF).
- **Automatische Sicherung** jeden Tag auf dem Server, zum Herunterladen und Zurückholen.
- **API** zum Abrufen: Bestand je Farbe, Material und Platz, einzelne Rollen über ihre Nummer,
  AMS-Belegung (siehe unten).
- **Katalog**: deine Teile mit Foto, Preis, Gramm, Druckzeit und Druckdatei; ein Antippen legt sie
  mit der gewünschten Farbe in den Beleg, dazu wie oft jedes Teil verkauft wurde.
- **Reste verwerten**: Für Rollen mit wenig Rest schlägt das Lager Teile vor, die noch reinpassen.
- **Termine** für Abholung und Lieferung, mit Erinnerung am Vortag und Kalender-Datei.
- **Farbkarte für Kunden**: ein Link ohne Passwort, der zeigt, welche Filamentfarben gerade da sind.
- **Als App** auf iPad, iPhone und Android: eigenes Symbol, ohne Browserleiste.
- Suchen, filtern (im AMS, geöffnet, ungeöffnet, knapp) und sortieren.
- Spulen anlegen (auch mehrere gleiche auf einmal), bearbeiten, duplizieren, löschen. Filamentart
  und **Farbe aus dem Bambu-Lab-Sortiment** wählen wie im Bambu-Shop (46 Filamentarten, über 300
  Farben mit deutschen Namen).
- **Import/Export**: CSV im Excel-Format (Semikolon, deutsche Spaltennamen) und JSON-Sicherung des
  ganzen Lagers.
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
  nicht direkt abrufbar. Die App sichert sie jeden Tag nach `data/backups/` (siehe
  „Sicherungen“); Plesk-Backups sichern beides mit.
- **Bambu Filament Manager** (Cloud) funktioniert auch vom Webserver aus, sofern der Hoster
  ausgehende Verbindungen erlaubt.
- **AMS live** läuft auf dem Webserver über das Bambu-Konto. Eine IP-Adresse des Druckers wird
  nicht gebraucht, „Drucker im Heimnetz“ bleibt leer.
- Plesk hält die App an, wenn sie eine Weile nicht benutzt wird. Beim nächsten Öffnen startet
  sie neu, verbindet sich mit dem Drucker und gleicht sofort mit Bambu ab.
- **Update:** neue Dateien hochladen (den Ordner `data/` dabei nicht überschreiben),
  „NPM install“ und „App neu starten“, oder über Git (siehe unten). Browser und Handys laden
  danach von selbst die neuen Dateien: Die Seite fragt die App nach einer Versionskennung
  (`/version.json`) und lädt CSS und Programm damit, statt alte Dateien aus dem Cache zu nehmen.
  Nur beim ersten Update auf diese Version kann es nötig sein, die Seite einmal neu zu laden.

### Update über GitHub (Plesk Git)

Statt ZIP-Dateien kann Plesk das Repository direkt von GitHub holen. Der Ordner `data/` mit dem
Lager steht in `.gitignore` und wird dabei nie überschrieben.

1. In Plesk bei der Domain **Git** öffnen und das Repository hinzufügen (bei einem privaten
   Repository den SSH-Schlüssel, den Plesk anzeigt, auf GitHub unter Settings → Deploy keys
   eintragen). Zweig: der, auf dem die Änderungen landen. Bereitstellungspfad: der
   Anwendungsstamm, z. B. `/filament-lager`.
2. **Automatisch bereitstellen** (optional): Bereitstellungsmodus „Automatisch“ wählen. Plesk
   zeigt eine Webhook-Adresse; die auf GitHub unter Settings → Webhooks → Add webhook als
   Payload URL eintragen (Content type `application/json`, nur „push“). Dann holt Plesk jede
   Änderung sofort.
3. **Neustart automatisch** (optional): unter „Zusätzliche Bereitstellungsaktionen aktivieren“
   eintragen:

   ```sh
   mkdir -p tmp && touch tmp/restart.txt
   ```

   Das startet die App bei der nächsten Anfrage neu, wie der Knopf „App neu starten“.

„NPM install“ ist nur nötig, wenn sich `package.json` geändert hat (neue Pakete); sonst reicht
der Neustart. Ohne Webhook: in Plesk unter Git „Pull“ bzw. „Bereitstellen“, dann „App neu
starten“.

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
| Filament | Gramm × Kaufpreis der Rolle ÷ Kaufgewicht | sonst Preisliste (PLA Basic 19,99 € pro kg), sonst 20 € pro kg |
| Strom | Druckzeit × Leistung des Druckers × Strompreis | 120 W, 0,30 € pro kWh |
| Drucker | Druckzeit × Stundensatz für Abnutzung, Düsen, Platten, Ersatzteile | 0,30 € pro Stunde |
| Fehldrucke | Zuschlag auf Filament + Strom, weil nicht jeder Druck klappt | 10 % |
| Arbeit | Arbeitszeit pro Auftrag × Stundenlohn, geteilt durch die Stückzahl | 5 Min. × 15 € pro Stunde |
| Selbstkosten | Summe der Posten oben | |
| Gewinn | Aufschlag auf die Selbstkosten | 30 % |
| Mengenrabatt | ab so vielen gleichen Teilen in einer Position, nie unter die Selbstkosten | 10 % ab 10 Stück |
| Aufrunden | Preis pro Stück auf einen schönen Betrag | auf 0,50 € |
| **Preis pro Stück** | Selbstkosten + Gewinn − Rabatt, aufgerundet | |
| Mindestpreis | gilt für den ganzen Beleg (ohne Versand), darunter kommt ein Aufschlag dazu | 3 € |

Beispiel Kabelhalter, 31,2 g zu 2 ct, 1:24 Std.: Filament 0,62 € + Strom 0,05 € + Drucker 0,42 € +
Fehldrucke 0,07 € + Arbeit 1,25 € = 2,41 € Selbstkosten, dazu 0,72 € Gewinn, also 3,13 €,
aufgerundet **3,50 €**. Bei drei Stück verteilt sich die Arbeit, dann kostet eines 2,05 €,
aufgerundet 2,50 €. Rabatt und Aufrunden stehen im Rechner als eigene Zeilen, darunter der Gewinn
pro Stück nach allem; das Aufrunden erhöht nur den Gewinn.

Alle Werte stehen unter **Einstellungen → Preisrechnung** („Preis pro Teil aufrunden auf“: nicht,
0,10 €, 0,50 € oder 1,00 €; „Mengenrabatt ab“ und „Mengenrabatt (%)“, 0 % schaltet ihn ab). Arbeitszeit und Gewinn lassen sich im
Rechner für die einzelne Rechnung ändern. Jeder Posten wird auf Cent gerundet, damit die Beträge
auf dem Beleg genau aufgehen.

- **Gramm:** Bei einer in Bambu Studio geslicten 3MF (nach dem Slicen über Datei → Exportieren die
  geslicte Platte als `.gcode.3mf` speichern) nimmt der Rechner die genauen Gramm und zeigt die Druckzeit. Bei einer STL oder
  ungeslicten 3MF schätzt er aus Volumen und Oberfläche (Außenhaut voll, Inneres mit Infill).
  Stützen sind in der Schätzung nicht enthalten. Gramm lassen sich auch von Hand eintragen.
- **Infill:** steht direkt im Rechner, Standard 15 % (unter Einstellungen änderbar). Für eine
  Rechnung einfach überschreiben, „zurücksetzen“ holt den Standard. Gebraucht wird er nur für die
  Schätzung aus einer STL; bei Gramm aus Bambu Studio steckt der Infill schon drin.
- **Gleiche Teile pro Druck:** Druckst du z. B. 5 gleiche Teile auf einer Platte, hier 5 eintragen.
  Gramm und Druckzeit gelten dann für den ganzen Druck und werden auf die Teile verteilt, die
  Anzahl wird mindestens 5. Bei einer geslicten 3MF erkennt der Rechner gleiche Teile auf der
  Platte selbst. Auch „Zum Beleg“ im Druckverlauf fragt, wie viele gleiche Teile auf der Platte waren.
- **Kaufpreis:** kommt von der Rolle (Bearbeiten-Dialog „Kaufpreis der Rolle in €“), sonst aus der
  **Preisliste** der Filamentart, sonst vom Standardpreis pro kg. Fehlt beides, fragt der Rechner nach.
- **Druckzeit:** kommt aus einer geslicten 3MF oder dem Druckverlauf, oder von Hand (z. B. `1:30`).
  Fehlt sie, **schätzt der Rechner sie aus dem Gewicht**: Vorlauf (Aufheizen, Kalibrieren) plus
  Minuten pro Gramm, gelernt aus deinen fertigen Drucken im Bambu-Verlauf (ab 3 Drucken; Ausreißer
  wie über Nacht pausierte Drucke zählen nicht). Ohne Verlauf gelten Richtwerte für einen
  Bambu-Drucker mit 0,2-mm-Profil (5 Min. + 2,4 Min. pro Gramm). Geschätzte Zeiten stehen mit „ca.“
  da. Genau wird es nur mit Bambu Studio: Ein echter Slicer steckt nicht in der Website, weil die
  Zeit von Bambus Druckerprofilen abhängt; dafür die geslicte `.gcode.3mf` hochladen. Die Leistung
  hängt vom Modell und Material ab, 120 W ist ein Richtwert für PLA.
- Der Rechner zeigt, ob die gewählte Rolle reicht, und schlägt sonst Rollen in derselben Farbe vor.
  „… g von #5 abziehen“ verbucht den Druck direkt im Lager. „Angebot kopieren“ legt einen kurzen
  Text mit Modell, Farbe und Preis in die Zwischenablage. „Zum Beleg hinzufügen“ legt das Teil in
  den offenen Beleg.

## Verkauf: Belege, Angebote, Kunden, Versand

Unter **Verkauf**:

- **Offener Beleg**: sammelt Teile aus dem Rechner, dem Druckverlauf („Zum Beleg“) und dem Vorrat.
  Anzahl und Preis pro Stück lassen sich ändern (ein eigener Preis ändert nur den Gewinn),
  „Position von Hand“ fügt z. B. eine Reparatur hinzu. Mit Datum, Kunde und Notiz wird daraus mit
  „Beleg erstellen“ ein Beleg mit fester Nummer (2026-001, 2026-002, …). Der offene Beleg bleibt im
  Browser, bis er erstellt wird.
- **Versand, Lieferung oder Abholung**: Der Knopf im offenen Beleg legt fest, wie die Bestellung
  zum Kunden kommt:
  - **Versand mit DHL** (DHL Päckchen 4,50 €, DHL Paket 6,50 € oder ein anderer Betrag) als feste
    Position. Zu jeder Versandart gehört das Porto, das du selbst zahlst; es zählt als Kosten des
    Belegs und in der Jahresübersicht als Ausgabe.
  - **Lieferung ohne Post**: du bringst es selbst vorbei. Der Preis kommt aus der **Entfernung**
    von deiner Adresse zum Kunden: gefahrene km (hin und zurück) × Preis pro km (Standard 0,30 €)
    plus ein Grundpreis (Standard 0 €), aufgerundet wie die Teilepreise. Die Strecke berechnet das
    Lager über OpenStreetMap, sobald der Kunde eine Adresse hat (aus der Kundenliste oder im Dialog
    eingetragen); die km lassen sich auch von Hand eintragen. Die Fahrt zählt mit deinen Kosten pro
    km (Standard 0,30 €, die steuerliche Pauschale) als Kosten des Belegs.
  - **Abholung**: der Kunde holt es ab, kostenlos.

  Versand und Lieferung zählen nicht zum Mindestpreis. Die Auswahl steht auch als „Übergabe an den
  Kunden“ im offenen Beleg. Versandarten, Porto, **deine Adresse**, Preis und Kosten pro km,
  Grundpreis und „Hin- und Rückfahrt“ stehen unter **Einstellungen → Versandarten**. Für die
  Entfernung gehen nur die beiden Adressen an OpenStreetMap (Nominatim und OSRM, kostenlos, ohne
  Anmeldung); das Lager merkt sich gefundene Orte und Strecken.
- **Angebot**: „Als Angebot speichern“ macht aus dem offenen Beleg ein Angebot mit eigener Nummer
  (A-2026-001, …) und „gültig bis“ (14 Tage, unter Einstellungen änderbar), zum Drucken oder als
  PDF. Sagt der Kunde zu, macht „Beleg“ in der Angebotsliste daraus mit einem Klick einen Beleg mit
  denselben Preisen; der Beleg nennt das Angebot.
- **Beleg**: öffnet sich in einem neuen Fenster zum Drucken oder „Als PDF sichern“. Unter jeder
  Position steht die Aufteilung pro Teil und für alle Stück: Filament, Strom, Drucker, Fehldrucke,
  Arbeit, Selbstkosten, Gewinn (mit Hinweis auf den Mengenrabatt). Name und Adresse für den Beleg
  und den Hinweis für Kleinunternehmer (§ 19 UStG) gibt es unter Einstellungen → Beleg, Angebot und Strom.
  Alte Belege öffnen sich durch Antippen in der Liste; Umsatz und Gewinn stehen darüber.
- **Kunden**: Wer im offenen Beleg als Kunde eingetragen wird, landet beim Erstellen in der
  Kundenliste; beim nächsten Mal reicht es, den Namen anzutippen. Adresse, E-Mail und Telefon
  lassen sich ergänzen, die Liste zeigt die Belege jedes Kunden. „Neuer Beleg“ setzt den Kunden in
  den offenen Beleg.

### Termine für Abholung und Lieferung

Im Bestelldialog eines Belegs (Lkw-Knopf) gibt es **Termin** (Datum und Uhrzeit) und eine **Notiz
zum Termin**, z. B. „Hoftor benutzen“. Dann:

- steht der Termin oben im Verkauf unter **Termine** (die nächsten zehn, nach Zeit);
- kommt am Vortag eine **Erinnerung aufs Handy** (ntfy, „Termin morgen“), sobald der Termin weniger
  als 24 Stunden entfernt ist. Ein gerade erst eingetragener Termin meldet sich nicht sofort.
  Plesk hält die App im Leerlauf an; dann kommt die Erinnerung beim nächsten Öffnen;
- legt **In den Kalender** bzw. „Kalender“ eine Kalender-Datei (.ics) an, mit Erinnerung eine
  Stunde vorher; am iPad öffnet sie den Kalender;
- sieht der Kunde den Termin auf seiner Bestellseite („Abholung am Samstag, 31. Oktober um
  16:00 Uhr“), bei Abholung mit deiner Adresse vom Beleg, und kann ihn ebenfalls in seinen Kalender
  übernehmen.

### Verschenkt: Proben und Geschenke

Für Gratis-Proben, Geschenke und Werbung: im **offenen Beleg** auf „Verschenken“ oder im **Vorrat**
bei einem Teil auf „Verkaufen“ → „Verschenken“. Dann eintragen, **wem** (aus der Kundenliste oder
neu), was es ist (Probe, Geschenk, Werbung, Sonstiges), Datum und eine Notiz. Hat die Person schon
etwas bekommen, steht das im Dialog.

Das gibt **keinen Beleg und keinen Umsatz**; Teile aus dem Vorrat werden abgezogen (der Vorrat zählt
sie als „verschenkt“). Unter **Verkauf → Verschenkt** stehen alle Einträge mit Selbstkosten und
dem Hinweis, ob die Person **danach bestellt** hat (mit Belegnummer), oben die Summe: wie viele
Teile an wie viele Personen, die Selbstkosten und wie viele danach gekauft haben. In der
Kundenliste steht bei jedem Kunden, wie viele Proben er bekommen hat. Löschen bringt die Teile
zurück in den Vorrat. Die Selbstkosten zählen nicht extra in der Jahresübersicht, weil das
Filament dort schon mit dem Kauf der Rollen drin ist.

### DHL-Sendungsverfolgung

Die **Sendungsnummer** trägst du im Versand-Dialog ein, im offenen Beleg oder später über den
Lkw-Knopf am Beleg. Sie steht auf dem Beleg mit Link zu dhl.de; im Dialog gibt es „Auf dhl.de
verfolgen“ und „Link für den Kunden kopieren“.

Mit einem **kostenlosen DHL-API-Schlüssel** zeigt das Lager den Stand selbst an (angekündigt,
unterwegs, zugestellt, mit Ort und Verlauf) und meldet die Zustellung aufs Handy:

1. Auf [developer.dhl.com](https://developer.dhl.com) registrieren.
2. Unter „My Apps“ eine App anlegen und die API **„Shipment Tracking - Unified“** wählen.
3. Den **API Key** der App unter **Einstellungen → Sendungsverfolgung (DHL)** eintragen (das API
   Secret wird nicht gebraucht). Der Schlüssel bleibt auf dem Server.

Der Server fragt jede offene Sendung höchstens alle 3 Stunden ab (kostenlos sind 250 Abfragen am
Tag), solange die App läuft, und beim Öffnen von „Verkauf“; zugestellte Sendungen und solche, die
älter als 45 Tage sind, nicht mehr. „Jetzt bei DHL nachsehen“ fragt sofort. Ohne Schlüssel gibt es
den Link zu dhl.de.

### Bestellverfolgung für Kunden

Der Lkw-Knopf an einem Beleg (oder der Status-Knopf daneben) öffnet **Bestellung**:

- **Status für den Kunden**: Bestellung eingegangen → In Bearbeitung → Wird gedruckt → Verpackt →
  Versendet → Zugestellt. Bei **Lieferung ohne Post** heißt es „Bereit zur Lieferung“, „Wird
  gebracht“ und „Geliefert“, bei **Abholung** „Bereit zur Abholung“ und „Abgeholt“ („Versendet“
  entfällt). Die Übergabe lässt sich im Dialog ändern. Antippen setzt den Schritt mit Datum und Uhrzeit; auch zurück
  geht es, z. B. nach einem Fehldruck.
- **Voraussichtlich da bzw. abholbereit** (Datum) und eine **Nachricht an den Kunden**.
- **Link für den Kunden**: „Link erstellen“ macht einen geheimen Link mit QR-Code zur Seite
  `bestellung.html`. „Text mit Link kopieren“ (oder „Teilen …“ am iPhone/iPad) gibt einen fertigen
  Text für WhatsApp oder eine Mail. Der Kunde sieht ohne Passwort den Stand mit allen Schritten,
  das voraussichtliche Datum, die Nachricht, die Teile mit Farbe und die Summe, aber keine Kosten,
  keine Adresse und keine anderen Bestellungen. Die Seite aktualisiert sich von selbst.
  „Zurückziehen“ sperrt den Link.
- **Von selbst** geht es weiter:
  - „Wird gedruckt“ merkt sich den Druck, der gerade läuft. Der Kunde sieht dann den Fortschritt
    live (Prozent, Schicht, Restzeit), und wenn dieser Druck fertig ist, springt der Status auf
    „Verpackt“ bzw. „Bereit zur Abholung“.
  - Eine **Sendungsnummer** setzt „Versendet“; der Kunde sieht den DHL-Stand und den Link zu dhl.de.
  - Meldet DHL die Zustellung (mit DHL-API-Schlüssel), steht „Zugestellt“ da.

Über den Belegen stehen die **offenen Bestellungen** (noch nicht zugestellt), sortiert nach dem
voraussichtlichen Datum, mit einem Knopf für den nächsten Schritt. Belege ohne Bestellverfolgung
(z. B. direkt verkauft) bleiben, wie sie sind.

## Strom und Druckverlauf

Unter **Drucke**:

- **Strom für Papa**: Wer den Strom bezahlt (Name unter Einstellungen), bekommt den Strom aller
  Drucke seit der letzten Abrechnung, auch für abgebrochene und eigene Drucke. Gerechnet wird aus
  dem Bambu-Druckverlauf (Druckzeit × Watt × Strompreis); ohne Bambu-Anmeldung aus den Belegen.
  „Abrechnung ansehen“ zeigt eine druckbare Aufstellung mit Unterschriftszeilen, „… an Papa
  gegeben“ speichert die Abrechnung, danach beginnt die nächste. Gezählt wird nur die Zeit beim
  Drucken, nicht der Standby.
- **Link für Papa**: erstellt einen geheimen Link (mit QR-Code) zur Seite `strom.html`. Damit sieht
  Papa ohne Passwort den offenen Betrag, die Drucke seit der letzten Abrechnung, alle bisherigen
  Abrechnungen und ob der Drucker gerade druckt. Ändern kann er nichts, Kunden, Belege und das
  Lager bleiben verborgen. „Neuer Link“ macht den alten ungültig, „Link zurückziehen“ sperrt ihn.
- **Druckverlauf** aus dem Bambu-Konto (wird mit dem automatischen Abgleich geholt,
  „Aktualisieren“ holt ihn sofort): Titelbild, Datum, Drucker, Gramm, Druckzeit, die verwendeten
  Farben mit der passenden Lagerrolle und der Preis, bei mehrfarbigen Drucken je Farbe mit dem
  Kaufpreis der passenden Rolle. **Im Rechner** übernimmt Gramm, Druckzeit und Farbe in den
  Rechner. **Erneut drucken**: Einen Druck starten erlaubt Bambu nur in den eigenen Apps. Die App
  zeigt den Weg über Bambu Handy und verlinkt das Modell auf MakerWorld, wenn es von dort stammt.

### Filament bei Druckende abbuchen

Unter **Bambu → AMS live** „Filament bei Druckende abbuchen“ einschalten. Nach jedem fertigen Druck
zieht das Lager die Gramm je AMS-Slot von der Rolle ab, die in diesem Slot steckt (passt die Farbe
dort nicht mehr, von der Rolle im AMS mit derselben Farbe). Das gilt für Drucke, die nach dem
Einschalten beginnen. Das Lager holt den Druckverlauf kurz nach dem Druckende von Bambu; läuft die
App gerade nicht (Plesk hält sie im Leerlauf an), passiert es beim nächsten Öffnen.

Nicht abgezogen wird, was schon anders gezählt wird: Rollen, die mit dem **Bambu Filament Manager**
verknüpft sind, solange der automatische Abgleich an ist (dort zieht Bambu selbst ab), und
RFID-Rollen, wenn „Restgewicht aus dem AMS übernehmen“ an ist. Abgebrochene Drucke bucht das Lager
nicht, weil Bambu dafür das geplante statt des verbrauchten Gewichts meldet.

Jede Druckkarte zeigt, was abgebucht wurde (z. B. „#6 −31 g“), mit **Rückgängig**. „Filament
abbuchen“ bucht einen Druck von Hand, auch ohne den Schalter. Kein Druck wird doppelt gebucht.

Den Druckverlauf liefert die inoffizielle Bambu-Schnittstelle (`/v1/user-service/my/tasks`); bekannt
sind die Status „fertig“ und „abgebrochen“.

## Preisliste

Im Reiter **Preisliste** steht jede Filamentart mit ihrem Einkaufspreis pro Rolle, die im Lager zuerst,
darunter die bekannten Bambu-Sorten; die Suche oben filtert. **PLA Basic** ist mit **19,99 € pro
1-kg-Rolle** voreingestellt. Ein Preis gilt:

- für **neue Rollen**: Beim Anlegen wird er als Kaufpreis eingetragen, wenn das Feld leer bleibt;
- für **Rollen ohne eigenen Kaufpreis** (z. B. aus dem Bambu-Abgleich): Rechner, Lagerwert und
  Einkaufsliste rechnen damit;
- **anteilig** nach Gewicht: Bei 19,99 € pro 1.000 g kostet eine 250-g-Rolle 5,00 €.

„Auf Rollen übertragen“ trägt den Preis bei allen Rollen dieser Art ein, die noch keinen haben, auf
Wunsch auch bei Rollen mit anderem Preis. Beim ersten Start nach dem Update bekommen alle PLA-Basic-
Rollen ohne Preis automatisch den Listenpreis; Rollen mit eigenem Preis bleiben, wie sie sind.
Änderungen in der Liste werden sofort gespeichert. Ohne Eintrag gilt der Standardpreis pro kg.

Darunter steht, welche **Rollengrößen nicht nachgekauft** werden: Standard sind die 250-g-Rollen.
Sie kommen nicht unter „Nachkaufen“ auf die Einkaufsliste, sondern zusammengeklappt unter „Nicht
nachkaufen“. Ist dieselbe Farbe auch als 1-kg-Rolle knapp, schlägt die Liste 1 kg vor.

Im Bearbeiten-Dialog einer Spule ist die **Filamentart** eine Auswahl mit Suche: tippen (z. B.
„matte“), mit den Pfeiltasten wählen und Enter, oder antippen. Neben jeder Art steht ihr Preis aus
der Liste. Eine neue Art lässt sich direkt eintippen.

## Vorrat: viele gleiche Teile, einzeln verkauft

Für Teile, die du auf einmal druckst und nach und nach verkaufst, z. B. 25 Kürbisse auf einer
Platte:

1. **Auf Vorrat legen**: im **Rechner** die Anzahl eintragen (25) und „Auf Vorrat legen“ tippen,
   oder im **Druckverlauf** bei dem Druck „Auf Vorrat“ und angeben, wie viele Teile auf der Platte
   waren. Gramm und Druckzeit werden dann auf die Teile verteilt. Im Dialog den festen
   **Verkaufspreis pro Stück** eintragen; Selbstkosten und Gewinn pro Stück stehen darunter.
2. **Verkaufen**: unter **Verkauf → Vorrat** bei dem Teil auf „Verkaufen“. Anzahl, Preis, Datum und
   Kunde, dann „Verkauft“: Das speichert gleich einen Beleg (auf Wunsch zum Drucken) und zieht die
   Teile vom Vorrat ab. „In den offenen Beleg“ legt sie stattdessen zu anderen Positionen.
3. Der Vorrat zeigt, wie viele noch da sind. Ein gelöschter Beleg bringt die Teile zurück. Über
   den Stift lassen sich Name, Preis und Bestand ändern (z. B. wenn einer kaputt gegangen ist).

Warum das wichtig ist: Die Arbeit (5 Min. pro Auftrag) zählt nur einmal für alle 25 Teile.
Beispiel Kürbis, 12 g und 6 Std. für die ganze Platte:

| | auf Vorrat (25 Stück) | einzeln als Auftrag |
|---|---|---|
| Filament | 0,24 € | 0,24 € |
| Strom | 0,01 € | 0,01 € |
| Drucker | 0,07 € | 0,07 € |
| Fehldrucke | 0,03 € | 0,03 € |
| Arbeit | 0,05 € | 1,25 € |
| **Selbstkosten** | **0,40 €** | **1,60 €** |

Teile aus dem Vorrat haben einen festen Preis, deshalb gilt für sie kein Mindestpreis. Druckst
du dasselbe Teil noch einmal (gleicher Name), kommt die neue Menge dazu und die Kosten werden
gemittelt. Das Filament zieht der Bambu-Abgleich oder das automatische Abbuchen ab; im Rechner
lässt es sich beim Anlegen auch von Hand abziehen.

## Etiketten mit QR-Code

Unter **Lager → Etiketten** die Spulen auswählen (vorausgewählt sind die, die gerade in der Liste
stehen; mit der Suche z. B. nur `#12`), oder im Bearbeiten-Dialog einer Spule auf „Etikett“. Es
öffnet sich ein Fenster mit den Etiketten: QR-Code, Rollennummer, Farbe, Material und Leergewicht
der Spule (hilft beim Wiegen). Formate:

- Etikettendrucker 50 × 30 mm, 40 × 30 mm oder 62 × 29 mm (Brother), ein Etikett pro Seite
- A4-Bogen mit 3 × 8 Etiketten à 70 × 37 mm (z. B. Avery Zweckform 3474)

Im Druckdialog „Ränder: keine“ und 100 % Größe wählen. Der QR-Code enthält die Adresse des Lagers
mit `#rolle/12`; mit der Handykamera scannen öffnet die Rolle direkt im Dialog „Gramm ändern“
(einmal am Handy angemeldet sein). Die Etiketten deshalb über die Adresse drucken, unter der das
Lager auch am Handy erreichbar ist.

## Einkaufsliste

**Lager → Einkaufsliste** (oder der Link in der Kachel „Knapp“) fasst knappe und leere Rollen nach
Sorte zusammen (Material, Hersteller, Farbe). Liegt von einer Sorte noch eine volle Rolle im Lager,
steht sie unter „Ersatz im Lager“ statt unter „Nachkaufen“. Der Preis ist der zuletzt bezahlte für
diese Sorte, sonst für das Material derselben Marke; dazu eine Summe. „Liste kopieren“ legt sie als
Text in die Zwischenablage (für eine Notiz oder eine Nachricht), „Drucken“ als Liste zum Abhaken.

## Katalog

Der Reiter **Katalog** sammelt die Teile, die du immer wieder druckst und verkaufst:

- **Teil anlegen** mit „Teil“, oder im **Rechner** bzw. bei einem Druck im **Druckverlauf** auf
  „In den Katalog“ (Gramm und Druckzeit kommen mit; bei mehreren Teilen auf einer Platte „Stück pro
  Druck“ eintragen, dann teilt das Lager Gramm und Zeit auf).
- **Foto**: antippen, dann fotografieren oder ein Bild wählen; es wird verkleinert gespeichert.
- **Preis**: fest (z. B. 2,50 €) oder leer, dann berechnet wie im Rechner mit dem Preis der
  Filamentart aus der Preisliste und der Arbeit verteilt auf die Stück pro Druck.
- **Druckdatei oder Link**, z. B. `kuerbis.3mf` oder der MakerWorld-Link (bei Drucken aus MakerWorld
  automatisch).
- **In den Beleg**: Anzahl und Farbe wählen (Rollen aus dem Lager mit passender Filamentart und genug
  Filament), das Teil kommt in den offenen Beleg. Die Karte zeigt, **wie oft es verkauft** wurde,
  den Umsatz und das letzte Datum; die Liste steht nach Verkäufen sortiert.

### Reste verwerten

Im **Lager** zeigt „Reste“ alle Rollen mit höchstens 150 g oder „knapp“ und dazu Teile, die noch
reinpassen: aus dem Katalog und einfarbige Drucke aus dem Druckverlauf, zuerst die, bei denen am
wenigsten übrig bleibt (z. B. „#15 Blau, 25 g: 3 × Kürbis klein, bleiben 1 g“).

## Farbkarte für Kunden

Im **Lager** erstellt „Farbkarte“ einen Link mit QR-Code zur Seite `farben.html`. Kunden sehen dort
ohne Passwort, welche Filamentfarben gerade da sind, nach Material (z. B. PLA Basic, PETG HF), mit
Farbfläche und Namen; „nur noch wenig“ unter 300 g, unter 50 g fehlt eine Farbe. Darunter „Kommt
bald“ mit Farben aus bestellten Filament-Paketen. Gramm, Preise und Lagerorte sehen Kunden nicht.
Die Seite ist immer aktuell. „Neuer Link“ macht den alten ungültig, „Link zurückziehen“ sperrt ihn.

## Als App auf iPad, iPhone und Android

Das Lager lässt sich wie eine App auf den Home-Bildschirm legen, mit eigenem Symbol und ohne
Browserleiste:

- **iPad/iPhone (Safari):** Teilen-Knopf → „Zum Home-Bildschirm“.
- **Android (Chrome):** Menü → „App installieren“ bzw. „Zum Startbildschirm hinzufügen“.

Belege, Abrechnungen und Etiketten erscheinen in der App über dem Lager („Schließen“ oben führt
zurück). Die App braucht wie die Website eine Verbindung zum Server; beim ersten Start einmal mit
dem Passwort anmelden, weil die App ihre eigene Anmeldung hat.

## Filament unterwegs

Für Filament, das du bestellt hast, z. B. im Bambu Lab Store (liefert mit DHL):

1. **Paket eintragen**: im Reiter **Lager** auf „Paket“ tippen, oder in der **Einkaufsliste** auf
   „Bestellt: Paket eintragen“ (übernimmt die Rollen von der Liste). Shop, Bestelldatum,
   **DHL-Sendungsnummer** aus der Versandmail, voraussichtliches Datum und die Rollen im Paket
   (Filamentart, Farbe, Gewicht, Preis pro Rolle, Anzahl; der Preis kommt aus der Preisliste). Die
   Farbe tippst du aus den Bambu-Farben der gewählten Filamentart an, mit Namen und Suche.
   „Aus der Einkaufsliste“ fügt die Rollen von der Liste hinzu.
2. Oben im Lager steht dann **Filament unterwegs** mit dem Stand von DHL (z. B. „unterwegs · Bonn“),
   die Kachel „Filament auf Lager“ zählt die Rollen als „unterwegs“. Mit dem DHL-API-Schlüssel
   fragt das Lager den Stand selbst ab und meldet „Filament ist da“ aufs Handy.
3. **Ins Lager**: legt die Rollen voll und ungeöffnet an, mit Kaufpreis und Bestelldatum als
   Kaufdatum (zählt so in der Jahresübersicht), auf Wunsch mit Lagerort. Danach lassen sich gleich
   die Etiketten drucken.

Ein Paket antippen öffnet es zum Ändern; dort gibt es auch den Link zu dhl.de, „Jetzt bei DHL
nachsehen“ und „Löschen“.

## Benachrichtigungen aufs Handy

Die App schickt Nachrichten über [ntfy](https://ntfy.sh), eine kostenlose App für iPhone und
Android:

1. Die App **ntfy** aus dem App Store oder Google Play installieren.
2. Unter **Einstellungen → Benachrichtigungen aufs Handy** steht ein zufälliges Thema (z. B.
   `filament-lager-3f9a…`). In der ntfy-App auf „+“ tippen und dieses Thema abonnieren, oder den
   QR-Code daneben mit dem Handy scannen.
3. „Benachrichtigungen einschalten“, speichern und „Testnachricht senden“.

Gemeldet werden: **Druck fertig**, **Druck abgebrochen**, **Druck pausiert** (z. B. Filament leer
oder ein Fehler am Drucker), **Rolle wird knapp oder leer** und **Paket zugestellt** (Pakete an Kunden und
Filament-Pakete an dich, mit DHL-API-Schlüssel), **Umsatz nähert sich der Kleinunternehmer-Grenze**
und **Termin morgen**, jedes einzeln abschaltbar. Die
Druckmeldungen brauchen eine Verbindung zum Drucker (Bambu-Konto oder Heimnetz unter „Bambu“).
Eine knappe Rolle meldet sich nur einmal, erst nach dem Auffüllen wieder; was beim Einschalten schon
knapp ist, wird nicht nachgemeldet. Tippen auf die Nachricht öffnet das Lager.

Wer das Thema kennt, kann mitlesen, deshalb ist es zufällig. Wer einen eigenen ntfy-Server
betreibt, trägt ihn unter „Eigener ntfy-Server“ ein, bei Bedarf mit Zugangstoken. Der Webserver muss
dafür ins Internet dürfen (bei Plesk üblich).

## Auswertung

Der Reiter **Auswertung** zeigt für einen Zeitraum (letzte 6 oder 12 Monate, dieses Jahr, alles):

- Kennzahlen: Umsatz, Gewinn (mit Anteil am Umsatz), Filament verdruckt, Strom und der heutige
  Lagerwert (Restgewicht × Kaufpreis der Rolle)
- **Umsatz und Gewinn pro Monat** aus den Belegen
- **Filament verdruckt pro Monat** aus den fertigen Drucken im Bambu-Verlauf (ohne Verlauf aus den
  Belegen)
- **Verbrauch nach Farbe**, mit dem Namen der passenden Lagerrolle
- **Bestseller** nach Umsatz, mit Stück und Gewinn (Positionen von Hand wie Versand zählen nicht)

Überfahren oder Antippen zeigt die Werte, „Als Tabelle“ zeigt alle Zahlen zum Nachlesen.

### Jahresübersicht für die Steuer

Darunter steht die **Jahresübersicht** für ein Kalenderjahr (Auswahl oben links), unabhängig vom
Zeitraum der Diagramme:

- **Einnahmen**: alle Belege des Jahres.
- **Ausgaben**: **Filament** mit Kaufpreis und Kaufdatum jeder Rolle (auch gelöschter Rollen mit
  Kaufpreis; ohne eigenen Preis mit dem Preis aus der Preisliste, so gekennzeichnet), **Strom**
  aus den gespeicherten Stromabrechnungen, **Porto** aus den Versandpositionen der Belege und
  **eigene Ausgaben** wie Düsen, Druckplatten, Werkzeug oder Verpackung („Ausgabe“).
- **Ergebnis** (Einnahmen minus Ausgaben), alles auch **pro Monat** und **nach Art**.
- **Kleinunternehmer (§ 19 UStG)**: Umsatz des Jahres und des Vorjahres neben den Grenzen von
  25.000 € (Vorjahr) und 100.000 € (laufendes Jahr), Stand 2025.
- **CSV für Excel** (eine Zeile pro Einnahme oder Ausgabe) und **Drucken oder PDF** für die
  Steuererklärung oder den Steuerberater.

Das **Kaufdatum** einer Rolle steht im Bearbeiten-Dialog; neue Rollen bekommen den heutigen Tag.
Ohne Eintrag gilt der Tag, an dem die Rolle angelegt wurde. Bei den Rollen aus der Excel-Übernahme
deshalb das Kaufdatum prüfen. Filament aus dem Lager nicht zusätzlich als Ausgabe eintragen, sonst
zählt es doppelt. Die Übersicht ist eine geordnete Aufstellung, keine Steuerberatung; Kaufbelege
aufheben.

**Warnung vor der Kleinunternehmer-Grenze:** Ist unter Einstellungen „Kleinunternehmer“ an, kommt
einmal je Stufe eine Nachricht aufs Handy, wenn der Umsatz im Jahr **20.000 €** erreicht (noch
5.000 € bis 25.000 €; darüber gilt die Regelung ab dem nächsten Jahr nicht mehr), **25.000 €**,
**80.000 €** und **100.000 €** (ab dann sofort Umsatzsteuer). Derselbe Hinweis steht im Verkauf über
den Belegen.

## Sicherungen

Auf dem Server sichert die App **jeden Tag automatisch** das ganze Lager (Rollen, Belege, Angebote,
Kunden, Vorrat, Ausgaben, Druckverlauf, Einstellungen) nach `data/backups/lager-JJJJ-MM-TT.json`,
beim Start und danach stündlich geprüft. Die letzten 14 Tage bleiben, ältere werden gelöscht.

Unter **Einstellungen → Daten**:

- **Ganzes Lager sichern (JSON)** lädt den aktuellen Stand herunter.
- **Automatische Sicherungen**: Liste mit Datum, „Herunterladen“ und **Zurückholen**. „Jetzt
  sichern“ legt sofort eine an.
- **Sicherung aus einer Datei zurückholen**: eine heruntergeladene Sicherung wieder einspielen.

Heruntergeladene Sicherungen enthalten keine Passwörter und Schlüssel (Bambu-Anmeldung,
Zugangscodes, ntfy-Token, DHL- und API-Schlüssel, Link für Papa). Beim Zurückholen bleiben diese
Zugänge, wie sie gerade sind, und vorher wird der aktuelle Stand gesichert, falls es doch der
falsche war.

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
| `GET /api/v1/einkaufsliste` | Knappe Sorten ohne Ersatz (`nachkaufen`) und mit Ersatz im Lager, zuletzt bezahlter Preis pro kg und geschätzte Summe |
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
- `public/js/prints.js` – Belege, Angebote, Strom und Druckverlauf, `public/js/sales.js` – offener
  Beleg, `public/js/documents.js` – druckbare Belege, Angebote und Abrechnungen
- `public/js/stock.js` – Vorrat (anlegen, verkaufen, ändern), `public/js/preise.js` – Reiter Preisliste
- `public/js/qr.js` – QR-Codes (ohne Bibliothek), `public/js/labels.js` – Etiketten,
  `public/js/shopping.js` – Einkaufsliste
- `public/js/stats.js` – Zahlen der Auswertung, `public/js/charts.js` – Diagramme,
  `public/js/auswertung.js` – Reiter Auswertung
- `src/notify.js` – Benachrichtigungen über ntfy
- `src/api-v1.js` – API mit Schlüssel (lesen, Gramm ändern)
- `src/bambu/cloud.js` – Bambu Cloud (Anmeldung, Filament Manager)
- `src/bambu/sync.js` – Abgleich Lager ↔ Filament Manager
- `src/bambu/printer.js` – MQTT-Verbindung zum Drucker, `src/bambu/ams.js` – AMS-Abgleich
