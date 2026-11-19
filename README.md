# AEM Testautomatisierung

Playwright-/TypeScript-Testautomatisierung für die Fraunhofer AEM 6.5 LTS Migration
(Tickets FHGWCMS-2415 / FHGWCMS-2416). Die Suite prüft über echte Redakteurs-
Gesten, ob die Fraunhofer-Website nach dem Update wie vorher funktioniert. Sie
umfasst 59 AEM-Testfälle in fünf Bereichen (siehe „Gliederung der Tests"),
inklusive Login, dazu 11 Capture-Läufe für die Dialog-Referenzen und 126 Unit-Tests
ohne AEM (Stand 19.11.2026). Die vollständige Liste mit Ablauf und Erwartung steht in
[`docs/TESTFAELLE.md`](docs/TESTFAELLE.md).

## Ablauf eines Laufs

Login (`setup`) → **Smoketest** (`smoke`) → alle übrigen AEM-Tests (`chromium`).
Der Smoketest ist die Vorstufe: Ist die Umgebung kaputt, bricht der Lauf nach
≈ 30 s ab, statt viele Einzelfehler zu liefern. Er prüft:
- Author-Oberflächen (Sites, Assets, Posteingang, Tools, Benutzerverwaltung,
  Page-Editor) laden ohne JS-Fehler.
- Publish liefert die echte Startseite `/content/zv/de` und die
  Fraunhofer-Fehlerseite aus.
- Alle OSGi-Bundles sind aktiv, die Replication-Agents sind nicht blockiert.
- Die Tag-Verwaltung lädt und enthält die Samples-Tags.

Die Vorstufe ist über `SMOKE_GATE` schaltbar (`playwright.config.ts`):
- **CLI und CI** (`npm test`, `npx playwright test`): an. Die Vorstufe läuft
  vollständig, auch beim Start eines einzelnen Tests (Playwright führt
  Abhängigkeiten immer komplett aus). Das kostet je Lauf ≈ 30 s (gemessen auf
  TEST). `SMOKE_GATE=0` schaltet sie ab.
- **Web-UI**: aus. Es laufen nur die ausgewählten Tests. Der Schalter
  „Smoketest vorab ausführen" (Weitere Optionen) schaltet sie zu.

Der Login (`setup`) läuft immer mit. Unit-Tests (`--project=unit`) brauchen
weder Login noch Vorstufe.

## Gliederung der Tests

Die Tests sind in fünf Bereiche gegliedert. Die Web-UI zeigt sie in dieser
Reihenfolge, die Stufe (Level) steht in Klammern:

1. **Smoketest**: Ist die Umgebung betriebsbereit?
2. **AEM-Basisfunktionen (Level 1)**: tägliche Redaktionsarbeit (Seiten,
   Eigenschaften, Komponenten einfügen, Versionen, Veröffentlichen, Assets).
3. **Komponenten (Level 2)**: Fraunhofer-Komponenten im Editor und ihre
   Darstellung auf Publish.
4. **Integrationstest**: ACL-Tool, LDAP-Import.
5. **Regressionstest: Bekannte Migrationsrisiken**: Overlays, Fehlerseite,
   Sprachversionen.

Die gesamte Suite ist der Regressionstest der Migration (Vorher-/Nachher).
Bereich 5 bündelt nur gezielte Prüfungen bekannter Einzelrisiken.

## Scope (AEM-Basisfunktionen)

Alle Flows laufen über echte Redakteurs-Gesten in der AEM-Author-UI (keine
API-/DOM-Umgehungen):

- **Seiten-CRUD**: anlegen (Create-Wizard), öffnen, Titel über die Properties-UI
  bearbeiten, löschen auf zwei Wegen (Action-Menü "..." und Backspace-Shortcut)
- **Komponente**: im Page-Editor einfügen und entfernen (Lebenszyklus)
- **Versionierung**: Version über die Zeitachse der Konsole erstellen und
  "Auf diese Version zurück" wiederherstellen
- **Replication**: Aktivieren (Quick Publish) und Deaktivieren (Veröffentlichung
  verwalten / Wizard)
- **Seiten kopieren, verschieben, umbenennen** über die Konsole und den
  Verschieben-Assistenten
- **Seiteneigenschaften**: Navigationstitel, Untertitel, Beschreibung speichern
  und erneut prüfen; einen Tag über das Tag-Feld setzen
- **Asset-Upload**: Bild in einen eigenen Testordner unter `/content/dam/fhgtest`
  hochladen, Verarbeitung abwarten, Ordner löschen

Komponentenfelder befüllt der Bereich Komponenten (FAQ mit Textblock bis
Publish), die 11 priorisierten Komponenten prüft er über ihre Dialoge. Die
visuelle Prüfung der Testseite (VIS-1) gehört ebenfalls dorthin und nutzt
vorerst die leere Seite (siehe `shortcut:`-Notiz im Spec).

## Weitere Bereiche (JET-Antworten vom 04.11.)

Aufbauend auf den Basisfunktionen sind folgende Bereiche automatisiert (Details
in [`docs/TESTFAELLE.md`](docs/TESTFAELLE.md)):

- **Komponenten-Dialoge (Author)** für die 11 priorisierten Komponenten auf
  Basis von `/content/samples`: Dialog öffnet, alle Reiter, Felder vorhanden und
  gegen eine Referenz (Vorher-Stand) befüllt; leere Felder werden gemeldet.
- **Komponente befüllen (FAQ mit Textblock)**: in einer Testseite einfügen,
  Dialog ausfüllen, im Editor und auf Publish prüfen.
- **Visuelle Regression (Publish)** der gerenderten Komponenten-Seiten und der
  Fehlerseite — nur Publish (JET-Vorgabe).
- **ACL-Tool (Integrationstest)**: Konsole erreichbar + AC-Tool-Bundles aktiv.
- **LDAP-/Visitenkartenimport (Integrationstest, nur TEST)**: Importseite über Tools öffnen,
  Kontakt suchen und den ersten Treffer in die Visitenkarten-Spielwiese
  `/content/businesscards/fhgtest` importieren. Danach Auto-Cleanup.
- **Overlays (Regressionstest)**: Asset-Finder (Visitenkarten, Externe Links).
  Download-Dialog: Asset per Drag & Drop aus dem Asset-Finder setzen und
  ersetzen. Baum wiederherstellen (Timeline): Formular öffnen und abbrechen.
- **Tags im Suchergebnis (Regressionstest, Publish)**: Die Filterseite der
  Samples liefert getaggte Treffer. Fehlende `cq:tags` werden klar benannt.
- **Sprachversionen (Regressionstest, Publish)**: Die Sprachwahl „English"/„Deutsch"
  öffnet die Gegenseite, und `hreflang` verweist gegenseitig. Geprüft am Seitenpaar
  `/content/zv/de/datenschutzerklaerung` und `/content/zv/en/data-protection-policy`.

Die Komponenten-/Overlay-Tests laufen gegen Author (DEV **oder** TEST über
`AEM_BASE_URL`); die Samples müssen in der Zielumgebung vorhanden sein. Die
Selektoren sind gegen DEV und TEST verifiziert, der LDAP-Import nur gegen TEST
(siehe AGENTS.md, „Diag-Specs").

Nicht im Scope: Formulare/Mailversand und Double-Opt-in (FHG-Klärung offen),
Suche/Oak-Indizes, User-Admin-Grundfunktionen und Berechtigungs-/Rollentests.

## Voraussetzungen

- Node.js 20+
- Netzzugriff auf die AEM-Author-Umgebung (DEV oder TEST). Die Samples-basierten
  Tests brauchen die Beispielseiten; die liegen auf DEV und TEST (auf TEST von uns mit Freigabe veröffentlicht, siehe AGENTS.md).
  Für die Publish-Prüfungen (visuelle Regression, Replication, Sprachversionen,
  Komponente befüllen) zusätzlich die Publish-Instanz (`AEM_PUBLISH_URL`).

## Setup

```bash
npm install
npx playwright install chromium
cp .env.example .env   # Werte eintragen (siehe unten)
```

### Umgebungsvariablen (`.env`)

| Variable              | Pflicht | Beschreibung                                                     |
| --------------------- | ------- | --------------------------------------------------------------- |
| `AEM_BASE_URL`        | ja      | Author-Basis-URL, ohne Slash am Ende                            |
| `AEM_ENV`             | ja      | `test` \| `dev` \| `legacy` (trennt die Screenshot-Baselines)   |
| `AEM_USER`            | ja      | Login-Benutzer                                                  |
| `AEM_PASSWORD`        | ja      | Login-Passwort                                                  |
| `AEM_PLAYGROUND_PATH` | nein    | Spielwiese (Default `/content/fhgtest`); nur hier wird geschrieben |
| `AEM_READONLY_PATH`   | nein    | Nur-lesender Pfad (Default `/content/zv`); derzeit von keinem Test genutzt (der Smoketest hat `/content/zv/de` fest) |
| `AEM_TEST_COMPONENT`  | nein    | Komponente für den Insert-Flow (Default `Verweis`)              |
| `AEM_PUBLISH_URL`     | nein    | Publish-Basis-URL für alle Publish-Prüfungen; fehlt sie, Ableitung aus `AEM_BASE_URL` (author→publish1), sonst Skip. Die Web-UI setzt sie aus dem Preset |
| `AEM_SAMPLES_ROOT`    | nein    | Wurzel der Komponenten-Beispielseiten (Default `/content/samples/de/components`) |
| `LDAP_SEARCH_QUERY`   | nein    | Vorname für den LDAP-Kontakttest (Default `Max`)                |
| `AEM_BUSINESSCARD_PLAYGROUND_PATH` | nein | Schreibziel des LDAP-Imports (Default `/content/businesscards/fhgtest`) |
| `AEM_DAM_PLAYGROUND_PATH` | nein | DAM-Spielwiese des Asset-Tests (Default `/content/dam/fhgtest`); der Test schreibt nur in einen eigenen Testordner darin |
| `ERROR_PAGE_PATH`     | nein    | Pfad der Fehlerseite für die Publish-Regression (Default `/content/samples/de/qa-seite-gibt-es-nicht`) |
| `AEM_DOWNLOAD_COMPONENT` | nein | Overlay-Titel der Download-Komponente (Default `Herunterladen`) |
| `AEM_RESTORE_TREE_PAGE` | nein | Seite relativ zur Spielwiese für „Baum wiederherstellen" (Default `/de`) |

Secrets gehören nicht ins Repo. `.env` und `playwright/.auth/` sind in `.gitignore`.

## Ausführen

```bash
npm test                      # komplette Suite (Login, Smoketest als Vorstufe, Tests)
npm run test:basics           # nur AEM-Basisfunktionen (Level 1)
npm run test:components       # Komponenten: Dialoge, FAQ befüllen, visuelle Regression
npm run test:integration      # Integrationstest: ACL-Tool + LDAP-Import
npm run test:regression       # Regressionstest: Overlays, Fehlerseite, Sprachversionen
npx playwright test --project=unit   # Unit-Tests (ohne AEM/Login)
npx playwright test --project=smoke  # nur Smoketest (Login + Vorstufe)
npm run capture-dialogs       # Referenz-Fixtures der Komponenten-Dialoge erzeugen (Vorher-Stand)
npm run baseline:visual       # ALLE visuellen Baselines erzeugen (Publish-URL/Env setzen)
npm run update-snapshots      # visuelle Baselines neu erzeugen (ganze Suite)
npm run report                # HTML-Report öffnen
npm run typecheck && npm run lint
```

## Architektur

```
config/env.ts              Env-Konfig + Validierung + Pfad-Guard
pageobjects/
  SitesConsolePage.ts      Konsole: CRUD, Kopieren, Verschieben/Umbenennen, Eigenschaften,
                           Replication, Versionierung, Baum wiederherstellen
  AssetsConsolePage.ts     Assets: Testordner anlegen, Upload, Verarbeitung, Löschen
  PageEditor.ts            Page-Editor: Komponente einfügen (auch in Container), konfigurieren, entfernen
  SamplesComponentPage.ts  Samples-Seite öffnen, Konfig-Dialog öffnen/auslesen
  PublishPage.ts           Gerenderte Seite auf Publish
  OverlayChecks.ts         Asset-Finder, Asset-Feld per Drag & Drop
  LdapImportPage.ts        LDAP-Visitenkartenimport (Tools)
fixtures/
  test-fixtures.ts         Page Objects, eindeutige Testnamen, Auto-Cleanup
  samples-components.ts    Die 11 Komponenten (Seite, Overlay-Titel)
  dialog-reference.ts      Lesen/Schreiben der Dialog-Referenzen
  component-dialogs/       Referenz je Komponente (Vorher-Stand)
  assets/qa-upload.png     Testbild für den Asset-Upload (32 x 32)
tests/auth.setup.ts        Login -> storageState
tests/smoke.spec.ts        Smoketest (eigenes Projekt `smoke`, Vorstufe)
tests/basics/              CRUD, Kopieren/Verschieben/Umbenennen/Eigenschaften, Komponente,
                           Versionierung, Replication, Asset-Upload, VIS-1 (Bereich Komponenten)
tests/components/          Dialoge, Capture, FAQ befüllen, Publish-Visual
tests/integration/         ACL-Tool, LDAP-Import
tests/regression/          Overlays, Fehlerseite, Sprachversionen
tests/unit/                Pfad-Guard, Publish-URL, Web-UI-Logik (kein AEM nötig)
tests/__snapshots__/<env>/ Visual-Baselines pro Umgebung
```

Der **Pfad-Guard** (`assertWithinPlayground`) erzwingt, dass Schreiboperationen
nur unterhalb von `AEM_PLAYGROUND_PATH` (Seiten),
`AEM_BUSINESSCARD_PLAYGROUND_PATH` (Visitenkarten) und `AEM_DAM_PLAYGROUND_PATH`
(Assets) laufen. `/content/zv` bleibt lesend. In der DAM-Spielwiese liegen
fremde Assets: Der Asset-Test arbeitet nur in einem eigenen Testordner. Vor
jedem Löschen prüfen die Page Objects, dass genau der eigene Eintrag ausgewählt
ist (Vorfall 18.11.2026).

**Testtitel** beginnen immer mit einem Großbuchstaben. Ein Code-Bezeichner am
Anfang bekommt einen deutschen Begriff davor, z.B. `Blocker-Erkennung (detectBlocker): …`.

### AEM-UI-Besonderheiten (hart erarbeitet, nicht leichtfertig ändern)

- **Timing**: Die Granite-Konsole bindet ihre Selektions-Handler erst nach dem
  asynchronen Laden. `open()` wartet daher auf `networkidle`; `selectItem` wartet
  zustandsbasiert, bis die Action-Bar erscheint (sonst bleibt sie 0px breit).
- **Overflow-Buttons**: Löschen/Veröffentlichung verwalten liegen im "..."-Menü
  (`button[icon="more"]:visible`), nicht direkt in der Bar.
- **Editor-Overlays**: Platzhalter/Komponenten sind `div[role=button]`, die
  Playwright als "not enabled" sieht -> `hover({force})` + `click({force})`.
- **Zeitachse**: Versionierung sitzt in der Konsole (Rail-Umschalter "Timeline"),
  nicht im Page-Editor.
- **Verschieben/Umbenennen**: Das Ziel im Assistenten gilt erst, wenn das
  versteckte Feld `destPath` gesetzt ist. Der Auftrag läuft im Hintergrund.
- **Assets-Konsole**: Auswahl nur in der Spaltenansicht, nicht per Hover in der
  Kartenansicht.
- Weitere Details in AGENTS.md („AEM-UI-Patterns").

## Vorher-/Nachher-Vergleich (alt vs. neu)

Baselines liegen pro `AEM_ENV` getrennt. Workflow:

```bash
AEM_ENV=legacy AEM_BASE_URL=<alte-url> npm run update-snapshots   # Baseline alt
AEM_ENV=test   AEM_BASE_URL=<neue-url> npm test                   # Vergleich neu
```

Konsistente Screenshots brauchen dieselbe Ausführungsumgebung. Baselines deshalb
in CI (Playwright-Docker-Image) erzeugen, nicht lokal.

### Vorher-Stand jetzt festhalten (vor der Migration)

Die Migration hat noch nicht begonnen — der aktuelle Stand ist der Vorher-Stand
und sollte dringend festgehalten werden.

**Über die Web-UI (empfohlen):**
1. `npm run webui` starten, Umgebung **DEV** (Standard).
2. Visuelle Tests wählen: in der Gruppe „Komponenten (Level 2)" die Tests
   „Gerenderte Seite "…" entspricht Baseline" (Publish-Komponenten) und
   „Gerenderte Seite entspricht Baseline" (Testseite), in der Gruppe
   „Regressionstest: Bekannte Migrationsrisiken" „Fehlerseite (404) entspricht
   Baseline". Das Suchfeld mit „Baseline" filtert genau diese Tests.
3. „Weitere Optionen" aufklappen → **„Baselines aktualisieren"** anhaken.
4. **Tests starten** → erzeugt die Baselines. Danach denselben Lauf OHNE den
   Haken = Vergleich.
Credentials kommen aus der `.env`, Author- und Publish-URL aus dem gewählten
Preset (`webui/environments.json`).

**Über die CLI (alternativ):**
```bash
# 1) Komponenten-Dialoge als Referenz-Fixtures (Author).
AEM_ENV=<umgebung> AEM_BASE_URL=<author> npm run capture-dialogs
#    -> fixtures/component-dialogs/*.json; leere Felder werden gemeldet.

# 2) Alle visuellen Baselines (basics + Publish-Komponenten + Fehlerseite).
AEM_ENV=<umgebung> AEM_PUBLISH_URL=<publish> npm run baseline:visual
```

Nach der Migration denselben Lauf ohne Capture/Update als Vergleich fahren.

## CI

`.github/workflows/playwright.yml` läuft im Image `mcr.microsoft.com/playwright`,
liest Credentials aus Repository-Secrets und lädt Report/Traces als Artefakt hoch.

## Web-UI (Tests starten und auswerten)

Eine lokale Weboberfläche zum Auswählen, Konfigurieren, Starten und Auswerten der
Tests — als intuitive Alternative zur CLI. Die Tests/Suiten selbst bleiben
unangetastet; die UI ruft nur `playwright` auf.

```bash
npm run webui        # Service startet auf http://localhost:4321, öffnet den Browser
```

**Aufbau (seit 19.11.2026)**: Drei Reiter. **Testlauf** führt in drei Schritten (Tests
auswählen → Umgebung wählen → Ausführung festlegen) und hat eine immer sichtbare
Start-Leiste. Geschlossene Schritte zeigen ihre Auswahl als Zusammenfassung;
Der Umschalter oben rechts wechselt zwischen „Assistent" (ein Schritt nach dem anderen) und „Alle Schritte" (alle zugleich). **Ergebnisse** zeigt die Kernaussage des
Laufs („2 von 6 Tests fehlgeschlagen"), Fehlschläge zuerst, Statusfilter, Details
und Artefakte je Test sowie rechts die früheren Läufe. **Werkzeuge** enthält Aufräumen,
Referenzbilder vergleichen und den Playwright UI-Mode. Die Oberfläche ist hell oder
dunkel (Umschalter oben, Standard = Systemeinstellung). Links davon wechselt der Sprachschalter zwischen Deutsch und Englisch (US); angezeigt wird die aktive Sprache (`DE`/`EN`). Startsprache ist die Systemsprache (Deutsch → DE, sonst EN). Die Wahl gilt bis zum nächsten Start von `npm run webui` (ein Reload behält sie). Testtitel und Playwright-Texte bleiben unübersetzt. Die Farbpalette steht zentral
in `webui/public/tokens.css`. Die bisherige Oberfläche läuft vorerst unverändert unter
`/legacy/` weiter (Link „Alte Oberfläche"), bis die neue abgenommen ist.

Der Standardbrowser öffnet sich automatisch (abschaltbar via `WEBUI_NO_OPEN=1`).
**Beenden**: „Beenden"-Button oben rechts in der UI oder `Strg+C` im Terminal —
beides stoppt einen laufenden Test, schließt die Verbindungen und gibt den Port
frei.

**Erneuter Start bei laufender UI**: Läuft bereits eine Web-UI auf dem Port,
fragt `npm run webui` im Terminal nach („Neu starten? [j/N]"). Bei „j" wird die
laufende Instanz sauber beendet (über `/api/shutdown`) und neu gestartet. Ohne
Terminal (z.B. in einer Pipe) bricht der Start ab, statt ungefragt zu beenden.
`WEBUI_FORCE=1 npm run webui` überspringt die Rückfrage und startet sofort neu
(für Debugging/Skripte). Belegt ein **fremder** Prozess den Port, wird nichts
beendet — Hinweis auf einen anderen `WEBUI_PORT`. Die Oberfläche ist geführt aufgebaut (Was testen → Umgebung → Wie
ausführen → Start); Tests erscheinen mit lesbarem Namen, der Dateipfad steht
dezent daneben. Funktionen:

- **Auswahl**: nach Kategorie gruppiert, jede Kategorie ein **einklappbarer
  Block** (standardmäßig zu; die Kopfzeile zeigt die Trefferzahl). Darunter die
  einzelnen Tests — **ein Haken = ein Test**, mit dezenter Herkunft (Suite).
  Kategorie-Checkbox wählt alle Tests der Kategorie; „Alle/Keine" wirken auf den
  gesamten Katalog (nicht nur das Gefilterte). `chromium`-Tests ziehen das
  `setup`-Projekt (Login) automatisch mit; `setup` ist kein wählbarer Testfall.
  Live-Log und Ergebnistabelle zeigen den Login nur, wenn er fehlschlägt.
  Gestartet werden genau die ausgewählten Tests. Der Smoketest läuft nur, wenn
  er ausgewählt ist oder „Smoketest vorab ausführen" an ist (Gate: schlägt er
  fehl, laufen die übrigen Tests nicht).
  - **Suchfeld**: filtert live nach Testname, Kategorie, Tag oder Datei; passende
    Blöcke klappen automatisch auf. Die Auswahl bleibt über das Filtern erhalten.
  - **Chips**: die aktive Auswahl erscheint als Chips (pro Kategorie mit Anzahl);
    ein Klick auf das × wählt diese Kategorie ab, „Alle abwählen" leert alles.
  - **Ausgeblendete Kategorien**: Einträge mit `"hidden": true` in
    `webui/categories.json` erscheinen NICHT in der Auswahl (laufen weiter über
    CLI/CI). So ausgeblendet: **Unit** (fachlich irrelevant für den Tester) und
    **Werkzeuge** (`@tooling`, z.B. der Dialog-Capture-Lauf).
  - Die Kategorien kommen aus Playwright-Tags (z.B. `@smoke`, `@level1`) und sind
    in `webui/categories.json` auf lesbare Namen gemappt — neue Stufe = neuer
    Eintrag dort plus Tag an den Tests.
- **Umgebung**: DEV/TEST aus `webui/environments.json`. Nach jedem Start von `npm run webui`
  ist **keine Umgebung vorgewählt**: Sie wird bewusst gewählt, bevor ein Lauf startet. Ein Reload
  behält die Wahl, ein Neustart des Dienstes nicht. Die UI setzt daraus `AEM_BASE_URL`, `AEM_PUBLISH_URL` und `AEM_ENV`; **Credentials kommen weiter aus `.env`**
  (werden nie in der UI eingegeben). Die Publish-URL steht je Preset als
  `publishUrl` in `webui/environments.json` und überschreibt `AEM_PUBLISH_URL` aus
  `.env`. Fehlt `publishUrl` im Preset, gilt der Wert aus `.env`.
- **Zuletzt verwendete Optionen**: Umgebung, Ausführungsmodus, Tempo und die
  Zusatzoptionen (grep/repeat/workers/Baselines) werden pro Browser in
  `localStorage` gemerkt und beim nächsten Start (auch nach Service-Neustart)
  wiederhergestellt. Die Testauswahl wird bewusst NICHT gemerkt. Ist eine
  gemerkte Umgebung nicht mehr vorhanden, greift wieder das primäre Preset. LEGACY ist kein UI-Preset mehr (kein
  aktueller Nutzen); der Vorher-/Nachher-Vergleich läuft weiter per CLI mit
  `AEM_ENV=legacy` (siehe unten).
- **Umgebungs-Einschränkung je Test**: Ein Test mit Tag `@env:<id>` (z.B.
  `@env:test`) läuft nur in diesen Umgebungen. In der Auswahl werden solche Tests
  bei einer nicht passenden Umgebung **ausgegraut** (Tooltip „In der ausgewählten
  Umgebung nicht verfügbar") und fallen aus der Auswahl. Ohne `@env:*`-Tag läuft
  ein Test überall. Die harte Absicherung bleibt zusätzlich der `test.skip` im
  Testcode (greift auch bei CLI/CI). Aktuell so eingeschränkt: der LDAP-Import
  (`@env:test`).
- **Ausführung**: headless oder headed (sichtbar). Im sichtbaren Modus wählbares
  Tempo in festen Stufen: Normal (Playwright-Standard) · Etwas langsamer ·
  Langsam · Sehr langsam — die langsameren Stufen pausieren pro Aktion. Sind nur
  Unit-Tests ausgewählt (laufen ohne Browser), werden „Sichtbar" und die
  Tempo-Stufen ausgegraut.
- **Button „Playwright UI-Mode öffnen"** (im Ergebnisbereich): startet Playwrights
  eigene Oberfläche in einem separaten Fenster. Übernimmt Umgebung, Projekte und
  `--grep`-Filter; die Datei/Zeile-Testauswahl kann `--ui` technisch nicht
  vorfiltern (dort das Suchfeld nutzen). Läuft unabhängig von der Web-UI und
  blockiert keinen weiteren Lauf.
- **Zusatzoptionen**: `--grep`, `--repeat-each`, `--workers` (Default 1 wegen der
  AEM-Instanz), `--update-snapshots`. **„Baselines aktualisieren"** ist der
  UI-Weg, um visuelle Vorher-Baselines zu erzeugen: betroffene visuelle Tests
  wählen, Haken setzen, starten (siehe „Vorher-Stand festhalten").
- **Kommandovorschau**: zeigt den exakten `playwright`-Aufruf vor dem Start.
- **Live-Log** während des Laufs (SSE) + grün/rot. Ein eigener Reporter
  (`webui/live-reporter.ts`) schreibt jeden Test schon beim Start
  (`[n/m] … › Titel`). Ergebnis und Dauer hängt er dahinter an, z.B. `✓ 12.3s`,
  `✘ Timeout 90.0s` oder `– übersprungen 0.1s` mit Grund. Schreibt der Test
  zwischendurch selbst etwas, folgt das Ergebnis in einer eigenen `↳`-Zeile. Bei
  Fehlern stehen die ersten Zeilen der Meldung direkt darunter. Am Ende kommt die
  Gesamtdauer.
  Die Statuszeile zeigt dazu „läuft seit m:ss · letzte Ausgabe vor m:ss" als
  Lebenszeichen bei langen Headless-Tests. Nach einem Reload zählt sie ab dem
  echten Laufstart.
- **Button „Report & Traces"**: der native Playwright-HTML-Report inkl.
  Screenshots/Traces/Videos. `/report` leitet auf den neuesten Lauf-Report um
  (`/report/<id>/`), aus `webui/runs/` ermittelt — überlebt einen Neustart der
  Web-UI. Jeder Lauf erzeugt seinen eigenen, in sich geschlossenen HTML-Report
  unter `webui/runs/<id>/html/` (mit eingebetteten Artefakten in `html/data/`).
  In der **Frühere Testergebnisse**-Ansicht hat jeder frühere Lauf einen eigenen „Report & Traces"-Link.
- **Frühere Testergebnisse**: alle bisherigen Läufe, gruppiert
  nach **Jahr/Monat/Tag** (jeweils einklappbar). Toolbar zeigt Gesamt-Speicher
  und Anzahl. Pro Lauf: Status-Badge (✓/⚠ instabil/✗/⊘/●), Uhrzeit, Umgebung, Einstellungen
  (z.B. „Sichtbar, Sehr langsam, 3×, Smoketest vorab"; ab 19.11.2026), Testergebnis,
  Speicherplatz und „Report ↗"-Link. „Neu starten" nutzt die aktuellen
  Einstellungen der Oberfläche, nicht die gespeicherten. Klick auf Zeile lädt Ergebnis in die
  Ergebnistabelle (minimaler Scroll, aktive Zeile grün markiert).
  - **Aufräumen**: Läufe per Checkbox wählen, „X Einträge löschen"-Button, Bestätigungs-Dialog.
  - **Neu starten**: markierte Läufe erneut ausführen — übernimmt die originale
    Test-Auswahl, startet gegen die aktuell gewählte Umgebung.
- **Ergebnistabelle**: Spalten Bereich · Testsuite · Test · Status · Dauer · Artefakte.
  „Bereich“ zeigt den Testbereich mit Stufe, z.B. „Basisfunktionen (L1)“.
  Fehlermeldungen sind ausklappbar, Wiederholungen (Retries) werden markiert.
  Bei „Wiederholungen" > 1 steht jeder Durchlauf in einer eigenen Zeile
  („Durchlauf 2/3"). Ein Test, der erst im Wiederholungsversuch grün wird, gilt
  als **instabil** (Playwright-Status `flaky`): gelbes Badge „⚠ instabil" in der
  Tabelle, „davon N instabil" in der Zusammenfassung, in der Historie „⚠" statt
  „✓" und „· N instabil". Ältere Läufe rechnet die Historie beim ersten Laden
  einmalig aus ihrer `report.json` neu und schreibt die Summary in `meta.json` zurück.
  Übersprungene Tests zeigen den Skip-Grund direkt in der Test-Spalte. Bei
  fehlenden Referenz-Fixtures erscheint ein gelbes Banner mit „Capture jetzt
  ausführen"-Button.
- **Artefakt-Icons**: 🔍 Trace (öffnet trace.playwright.dev direkt),
  🖼️ Screenshot, 🎥 Video, 📋 Fehler-Kontext (öffnet als gerendertes Markdown),
  🎯 Baseline, 👁️ Aufnahme, 🆚 Diff. Tooltip beim Hovern zeigt den Namen.
- **Aufräum-Task** (eigener Abschnitt in der Konfig-Spalte „Testseiten
  aufräumen"): durchsucht **alle Umgebungen** (DEV und TEST, unabhängig von der
  Umgebungswahl oben) und zeigt die Treffer je Umgebung getrennt. Findet
  verwaiste Testseiten, Visitenkarten und Asset-Testordner direkt unter den
  Spielwiesen `AEM_PLAYGROUND_PATH`, `AEM_BUSINESSCARD_PLAYGROUND_PATH` und
  `AEM_DAM_PLAYGROUND_PATH` (Schema `<level>-<testslug>-<zeitstempel>-<uuid>`,
  optional mit Dateiendung, alle Test-Level). Fremde Inhalte der Spielwiesen
  (z.B. vorhandene Assets in `/content/dam/fhgtest`) erkennt er nicht als
  Testdaten und löscht sie nie. Gelöscht wird auf
  der Umgebung, bei der die Seite steht. Die Bestätigung nennt sie, z.B. „2 auf
  TEST". Ist eine Umgebung oder Spielwiese nicht erreichbar, erscheint ein
  Hinweis, die übrigen werden trotzdem durchsucht. Rein manuell; Author-URLs
  kommen serverseitig aus `environments.json`, Credentials aus `.env`. Der
  Pfad-Guard lässt nur Testseiten direkt unter einer Spielwiese zu.
- **Blocker-Erkennung**: schlagen alle Tests mit Login-/Erreichbarkeits-/Timeout-
  Fehlern fehl, weist die UI auf einen wahrscheinlichen Umgebungs-Blocker hin
  (statt es als einzelne Funktionsfehler zu zeigen). Ist ein Smoketest rot,
  meldet sie „Umgebungs-Blocker: Smoketest fehlgeschlagen (<Test>)". Die übrigen
  Tests stehen dann als übersprungen in der Tabelle.

- **Artefakt-Archivierung**: Traces, Screenshots und Videos landen lauf-spezifisch
  unter `webui/runs/<id>/artifacts/`. Beim Löschen eines Laufs werden alle
  Artefakte mitentfernt. `test-results/` wird weiterhin von Playwright angelegt
  (normales Verhalten), ist aber kein primäres Artefakt-Archiv mehr.

Grenzen (bewusst): nur localhost, kein Auth, genau ein Lauf gleichzeitig, keine
Credential-Eingabe über die UI, keine Bearbeitung der Tests. Lauf-Artefakte liegen
unter `webui/runs/` (in `.gitignore`). Port überschreibbar via `WEBUI_PORT`.

```
webui/
  server.ts          HTTP-Service (Node-Bordmittel): Katalog, Lauf, SSE, statische Auslieferung
  catalog.ts         Parser für `playwright test --list --reporter=json`
  runArgs.ts         UI-Auswahl -> Playwright-Argumente + env
  report.ts          JSON-Report -> Tabelle + Blocker-Heuristik
  history.ts         Frühere-Testergebnisse-Sortierung + Baseline-Pfade
  cleanup.ts         Testseiten-Erkennung + Pfad-Guard des Aufräum-Tasks
  live-reporter.ts   Playwright-Reporter fürs Live-Log (Start + Ergebnis/Dauer je Test)
  environments.json  Umgebungs-Presets (DEV/TEST)
  categories.json    Tag -> Kategorie-Mapping (erweiterbar)
  public/            Frontend (HTML/CSS/JS, kein Build-Step)
```

## Testfälle

Eine lesbare Übersicht aller Testfälle (Vorbedingung, Schritte, erwartetes
Ergebnis) für die Nachweisführung steht in [`docs/TESTFAELLE.md`](docs/TESTFAELLE.md).

## Stabilität / Flakiness

Jeder Flow ist einzeln stabil. Neue Flows wurden mit `--repeat-each=3
--retries=0` geprüft. Beim kompletten Suite-Lauf (mehrere Minuten Dauerlast) kann
die Instanz träge werden und sporadisch einen Test mit Timeout fehlschlagen
lassen (wandernd, kein fester Selektor-Bug). Dafür gibt es Retries: lokal 1,
in CI 2. Die Web-UI markiert Tests, die erst in der Wiederholung grün wurden,
als „instabil" (Tabelle und Historie).

**Timeouts**: Der globale Test-Timeout liegt bei 90s (statt der
Playwright-Standard-30s), weil die mehrstufigen AEM-UI-Flows unter Last länger
brauchen (real bis ~53s beobachtet). Besonders lange Flows erhöhen zusätzlich per
`test.setTimeout(120_000)`.

**„snapshot doesn't exist … writing actual" ist KEIN Fehler im Sinne einer
Regression**: Beim ersten visuellen Lauf einer Umgebung fehlt die Baseline;
Playwright nimmt sie auf und meldet den Lauf rot (Standardverhalten). Einmalig
den Vorher-Stand erzeugen (Web-UI „Baselines aktualisieren" oder
`npm run baseline:visual`, siehe „Vorher-Stand festhalten"), danach
vergleicht der Test grün. Das harte Verhalten ist bewusst beibehalten: Ein
tolerantes „fehlende Baseline = grün" würde eine echte Rendering-Regression
verstecken.

## Offene Punkte / Risiken

- **Playwright-Version**: `package.json` deklariert `^1.49`, getestet mit 1.65.
  Ab neueren Versionen nimmt `--update-snapshots` ein optionales `[mode]`-Argument.
  Skripte und Web-UI nutzen deshalb `--update-snapshots=all`, am Ende der
  Argumente. Ohne Modus gilt `changed`, dann bleiben Baselines mit kleinen echten
  Änderungen unter der Toleranz unverändert.
- **Login-Methode**: `auth.setup.ts` nutzt den Granite-Formular-Login (gegen TEST
  bestätigt). Erzwingt eine Umgebung SSO, muss der Login an den IdP-Flow angepasst
  werden.
- **Komponente**: Default `Verweis` (in der Fraunhofer-Vorlage vorhanden). Bei
  anderer Vorlage `AEM_TEST_COMPONENT` setzen.
- **Publish-Instanz**: Der Replication-Test prüft den Status im Author und die
  Zustellung auf Publish: Nach dem Aktivieren muss die Seite HTTP 200 liefern,
  nach dem Deaktivieren 404, jeweils bis 60 s. Ohne `AEM_PUBLISH_URL` prüft er
  nur den Author-Status.
- **Visuelle Baseline**: derzeit leere Seite; nach Komponenten-Priorisierung mit
  gefüllter Seite erweitern (`shortcut:`-Notiz im Spec).
- **TEST-Referenzen**: Publish-Baselines liegen für DEV und TEST vor (TEST seit
  17.11.2026), inklusive Logo, Sprachwahl und Filterseite (Tags wiederhergestellt,
  siehe AGENTS.md). Der Newsroom sortiert nach Veröffentlichungsdatum. Wird auf
  einer Umgebung neu veröffentlicht, ändert sich seine Trefferliste, dann die
  Newsroom-Baseline neu erzeugen.
- **„Neu starten" alter Läufe**: Läufe von vor der Titel-Vereinheitlichung (11/2026)
  filtern nach den alten Testtiteln. Bei umbenannten Tests findet so ein Lauf
  nichts. Dann die Tests neu auswählen.
- **Web-UI und Publish-URL**: Bis 17.11.2026 setzte die UI keine Publish-URL.
  Publish-Tests auf TEST liefen dadurch gegen DEV-Publish (mit TEST-Baselines).
  Behoben über `publishUrl` je Preset. Ergebnisse früherer UI-Läufe auf TEST mit
  Publish-Tests sind nicht belastbar, neu laufen lassen. „Neu starten" alter Läufe
  nutzt deren gespeichertes Preset und kann noch die alte Publish-URL verwenden.
- **Baselines lokal erzeugt**: Die Baselines entstanden unter macOS. Die CI (Linux)
  rendert Schrift anders und kann abweichen. Vor CI-Nutzung die Baselines im
  CI-Image neu erzeugen.
- **DEV-Author, leere Tags**: Auf dem DEV-Author fehlen die Tags der Seiten (mit
  JET zu klären). TEST ist wiederhergestellt, Nachweis in
  `docs/TEST-tags-wiederhergestellt-20261117.md`. Herkunft und offene Fragen:
  `docs/DEV-tags-analyse-20261118.md`.
- **Tests vom 18.11.2026**: Kopieren, Verschieben, Umbenennen,
  Seiteneigenschaften, Asset-Upload und FAQ befüllen sind seit 19.11.2026 auch
  auf TEST verifiziert und mehrfach wiederholt (`--repeat-each`). Der Fix im
  Kopieren-Test (Warten auf die Spalten-Vorschau) lief bisher nur auf TEST, DEV
  war beim Gegencheck nicht erreichbar (HTTP 503).
- **Vorfall 18.11.2026 (DEV)**: Ein Testlauf hat während der Entwicklung des
  Asset-Tests ein fremdes Asset in `/content/dam/fhgtest` gelöscht. Es ist aus
  TEST wiederhergestellt (nur Datei, alte DEV-Metadaten fehlen). Nachweis und
  Gegenmaßnahmen: `docs/DEV-asset-geloescht-wiederhergestellt-20261118.md`.
- **Leerfelder in den Samples**: Der Dialog-Test meldet leere Felder als Befund
  (z.B. Pflichtfelder im Formular). Fachlich bei FHG klären.
```
