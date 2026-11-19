# Agentic-Coding-Setup: AEM Testautomatisierung

Leitfaden für KI-Agenten und Menschen, die diese Testsuite erweitern.

## Projekt- und Testziel

Absicherung der Fraunhofer-Website nach der Migration auf AEM 6.5 LTS
(FHGWCMS-2415/2416). Ziel: die Website funktioniert nach dem Update wie vorher.
Start der Automatisierung bei den AEM-Basisfunktionen; danach technisch
betroffene Services (siehe Priorisierung).

## AEM-Umgebungen

| Umgebung | Author-URL                                   | Zweck                       |
| -------- | -------------------------------------------- | --------------------------- |
| TEST     | https://aem-author-test.ws.fraunhofer.de     | primäre Testumgebung        |
| DEV      | https://aem-author-dev.ws.fraunhofer.de      | Entwicklung; ggf. kein LDAP |
| LEGACY   | alte AEM-Version                             | Vorher-/Nachher-Referenz    |

- Spielwiesen (schreibend): `/content/fhgtest` für Seiten,
  `/content/businesscards/fhgtest` für Visitenkarten (LDAP-Import) und
  `/content/dam/fhgtest` für Assets (Freigabe 18.11.2026). In der DAM-Spielwiese
  liegen fremde Assets: Tests schreiben dort nur in einen eigenen Testordner
  nach Testschema und löschen nur diesen.
  Zentralverwaltung `/content/zv` nur lesend.
- Zugang über `.env` / CI-Secrets. Keine Credentials im Repo.
- Cockpit-Presets: nur DEV (primär) und TEST. LEGACY ist kein UI-Button mehr
  (kein aktueller Nutzen); die Vorher-/Nachher-Referenz läuft per CLI mit
  `AEM_ENV=legacy`.
- Visuelle Baselines (Vorher-Stand) erzeugen: Cockpit „Baselines aktualisieren"
  oder `npm run baseline:visual`. Immer `--update-snapshots=all`: Ohne Modus gilt
  `changed`, das überschreibt nur Baselines, deren Vergleich fehlschlägt. Kleine
  echte Änderungen unter der Toleranz blieben dann stehen. Am 17.11.2026 wäre
  so z.B. das fehlende Logo in den TEST-Baselines geblieben. Das Flag steht am
  Ende (Playwright ≥1.65 deutet ein folgendes Positional sonst als `[mode]`).

## Aktueller Stand

**Gliederung** (Cockpit-Reihenfolge, `cockpit/categories.json`): Smoketest ·
AEM-Basisfunktionen (Level 1) · Komponenten (Level 2) · Integrationstest ·
Regressionstest: Bekannte Migrationsrisiken. „Level" steht nur noch in Klammern.

**AEM-Basisfunktionen (Level 1, DEV und TEST, grün):** Seiten-CRUD (zwei Lösch-Wege),
Komponente einfügen/entfernen, Versionierung, Replication.
**Neu 18.11.2026 (DEV und TEST verifiziert, TEST seit 19.11.2026):** Seite kopieren, Unterseite verschieben,
Umbenennen, Seiteneigenschaften (`tests/basics/page-actions.spec.ts`),
Asset-Upload in eigenem Testordner (`tests/basics/asset-upload.spec.ts`),
Komponente FAQ + Textblock befüllen bis Publish
(`tests/components/component-authoring.spec.ts`). VIS-1 gehört jetzt zum
Bereich Komponenten (Tag `@level2-components`, Datei bleibt wegen der Baselines
in `tests/basics/`).

**Erweiterung (JET-Antworten 04.11., verifiziert und grün):**
- Level 2: Komponenten-Dialoge (Author) für 11 priorisierte Komponenten auf
  `/content/samples`. Der richtige Dialog öffnet (Titelprüfung), alle sichtbaren
  Reiter, Felder gegen die Referenz befüllt, leere Felder werden gemeldet.
  Referenz via `npm run capture-dialogs` (Vorher-Stand, aus DEV erfasst).
- Visuelle Regression (Publish) der Komponenten-Seiten und der Fehlerseite.
  Baselines liegen für DEV und TEST vor (siehe „Umgebungs-Matrix"). Sie sind
  lokal unter macOS erzeugt; vor CI-Nutzung im CI-Image neu erzeugen.
- Smoketest (`tests/smoke.spec.ts`, Projekt `smoke`): 11 rein lesende Checks als
  Vorstufe. Schlägt er fehl, bricht der Lauf ab (Umgebungs-Blocker). Enthält den
  Replication-Agents-Check.
- Replication (REP-1): prüft zusätzlich die Zustellung auf Publish (200 nach
  Aktivieren, 404 nach Deaktivieren).
- Sprachversionen (LANG-1..3): Sprachwahl und Hreflang am `zv`-Seitenpaar.
- Tags (18.11.2026, DEV + TEST): Tag-Verwaltung im Smoketest (SMOKE-11), Tag
  setzen in den Seiteneigenschaften (PAGE-5), Filterseite liefert Treffer
  (TAG-1).
- Integrationstest: ACL-Tool (Konsole + Bundles). LDAP-Import (nur TEST): echter
  Import in `/content/businesscards/fhgtest`, danach Cleanup.
- Regressionstest (bekannte Migrationsrisiken): Asset-Finder (Visitenkarten/Externe Links). Download-Asset-Feld:
  per Drag & Drop aus dem Asset-Finder setzen und ersetzen. Baum wiederherstellen:
  Formular öffnen und abbrechen.

Verifiziert gegen DEV und TEST, LDAP nur gegen TEST (siehe „Diag-Specs" und die Gesamtübersicht in
`docs/TESTFAELLE.md`). Aktuell liegen keine Diag-Specs im Repo.

Umfang: 59 AEM-Testfälle (12 Smoketest inkl. Login, 11 Basisfunktionen,
24 Komponenten, 3 Integrationstest, 9 Regressionstest), dazu 11 Capture-Läufe
und 132 Unit-Tests. Der Login (LOGIN-1, `auth.setup.ts`) zählt seit 19.11.2026
als Testfall des Smoketests (einheitlich mit dem Testplan).

## Cockpit: Aufbau und Fallback

Bis 19.11.2026 hieß das Cockpit „Web-UI" (Ordner `webui`, `npm run webui`, `WEBUI_*`,
localStorage `aem-webui-*`). Alte Läufe in `cockpit/runs/` wurden migriert (Pfade in `report.json`).

Adresse: `npm run cockpit` nennt und öffnet `http://cockpit.localhost:4321/` (ohne Einrichtung;
`http://localhost:4321/` geht gleichwertig. `*.localhost` zeigt immer auf den eigenen Rechner und ist
in Chrome ein sicherer Kontext; ein Name ohne `.localhost` zeigt „Nicht sicher"). `COCKPIT_URL`
ändert nur die ausgegebene/geöffnete URL, gebunden wird immer `127.0.0.1`. Ohne Port geht es
nicht sauber: Port 80 an `127.0.0.1` braucht unter macOS Root (`EACCES`), und eine
pf-Weiterleitung 80 → 4321 legte direkte Verbindungen zu 4321 lahm (19.11.2026). Nicht wieder einführen.

- Neue Oberfläche in `cockpit/public/`: `index.html` (Shell, Icon-Sprite), `tokens.css`
  (einzige Farbpalette, hell/dunkel über `data-theme`), `app.css`, `app.js` (Router,
  Theme) und `js/` (`core.js` Zustand/API, `logic.js` reine Logik, `testrun.js`,
  `results.js`, `history.js`, `tools.js`). Vanilla-ES-Module, kein Build.
- Die Module sprechen über Ereignisse (`emit`/`on` in `core.js`), nicht über
  zyklische Importe. Reine Logik gehört nach `logic.js`: nur dort ist sie unter Node testbar.
- Fallback: die bisherige Oberfläche liegt unverändert in `cockpit/public-legacy/` und
  wird unter `/legacy/` ausgeliefert (`server.ts`). Beide nutzen dieselben `/api/*`-
  Endpunkte. **API-Änderungen nur additiv**, sonst bricht die jeweils andere UI.
  Eigene localStorage-Schlüssel: `aem-cockpit-prefs-v2`, `aem-cockpit-theme` und `aem-cockpit-lang` (neu),
  `aem-cockpit-prefs-v1` (alt). Entfernen von `public-legacy/` und der Weiche erst nach
  ausdrücklicher Abnahme durch den User.
- **Zweisprachig (DE/EN-US, ab 19.11.2026)**: Texte stehen in `js/i18n/de.js` und `js/i18n/en.js`
  (flache Schlüssel, Platzhalter `{name}`, Plural `.one`/`.other`), Kern in `js/i18n.js`
  (`t`, `tn`, `locale`, DOM-frei, Default `de`). Statisches HTML nutzt `data-i18n`,
  `data-i18n-title`, `-aria-label`, `-placeholder`; `app.js` übersetzt es (`applyStatic`).
  Der Sprachschalter `#lang-toggle` speichert `aem-cockpit-lang` samt Start-Kennung des Dienstes
  (`aem-cockpit-lang-server`, wie bei der Umgebung): Nach einem Neustart von `npm run cockpit` gilt wieder
  die Systemsprache (`resolveLang` in `logic.js`, `syncLangWithServer` in `app.js`). Module zeichnen sich bei `lang-change` neu (idempotente
  Render-Funktionen, Zustand bleibt; Gruppen über `groupKey`, nicht über das Label).
  **Neue Texte immer in beiden Wörterbüchern, nie als Literal im JS.** Server-Texte additiv:
  `labelEn`/`descriptionEn` in `categories.json` und `environments.json`, `blockerInfo`
  (`{code, params}`), `code`/`params` bei bekannten Fehlern (`CodedError`), `repeatIndex`/
  `repeatTotal`. Testnamen: jeder Test trägt `titleEn(...)`, jede Suite `describeEn(...)`
  (Annotationen `_title-en`/`_describe-en`, `fixtures/titles.ts`), das Cockpit zeigt sie in EN
  (`testTitle`/`suiteLabel` in `core.js`); der deutsche Titel bleibt Schlüssel für Auswahl und
  `--grep`. Nicht übersetzt: Dateinamen, Playwright-Fehlertexte, `skip`-Gründe, Playwright-Report;
  sie tragen in EN `lang="de"` (`markContent`/`contentLangAttr` in `core.js`).
  Zahlen folgen der Sprache (`oneDecimal` in `logic.js`). `cockpit-ui.spec.ts` nagelt `locale: 'de-DE'` fest, `cockpit-i18n.spec.ts`
  prüft Vollständigkeit und Umschalten.
- Tests: `tests/unit/cockpit-ui-logic.spec.ts` (Logik, Token-Kontrast) und
  `tests/unit/cockpit-ui.spec.ts` (Browser gegen gemockte API). Neue Farben in
  `tokens.css` müssen den Kontrast-Test bestehen.

## Lauf-Archivierung und -Verwaltung

Jeder über das Cockpit gestartete Lauf ist vollständig in `cockpit/runs/<id>/` gespeichert:

```
cockpit/runs/<id>/
  meta.json      ← id, startedAt, environment, selection, status, summary (inkl.
                   flaky = instabil, ab 19.11.2026), sizeBytes,
                   originalRequest (Auswahl), settings (headed, slowMo, repeatEach,
                   workers, smokeGate, updateSnapshots; ab 19.11.2026)
  report.json    ← Playwright JSON-Reporter-Output
  html/          ← Playwright HTML-Report (selbst-enthaltend, inkl. html/data/)
  artifacts/     ← Traces, Screenshots, Videos (nur bei Fehlern: retain-on-failure)
```

**Wichtige Endpoints:**
- `GET /api/runs` → `{ runs: RunMeta[], totalSizeBytes: number }` — alle Läufe mit Größe
- `POST /api/runs/delete` → `{ ids: string[] }` — löscht Lauf-Verzeichnisse rekursiv
- `GET /files/runs/:id/...` → serviert Artefakte und HTML-Report-Assets

**`startRun()`-Verhalten:**
- Reporter `./cockpit/live-reporter.ts,json,html`. `list` schreibt ohne TTY erst bei
  Testende, `line` kennt kein Testende. Der Live-Reporter schreibt den Teststart
  sofort und hängt Status und Dauer an dieselbe Zeile an. Kommt dazwischen eigene
  Ausgabe, steht das Ergebnis in einer `↳`-Zeile. Tabelle und Report kommen
  weiter aus `json`/`html`.
- `GET /api/status` liefert beim aktiven Lauf `startedAt`. Damit zählt die
  Statuszeile („läuft seit … · letzte Ausgabe vor …") auch nach einem Reload richtig.
- Artefakte via Playwright-Flag `--output <pfad>` (zwei separate Argumente) auf
  `cockpit/runs/<id>/artifacts/` — **nicht** `--output-dir` (kein gültiges Flag)
- Größe in `meta.json` nach Abschluss via `dirSizeBytes(runDir)`
- URL-Übersetzung: `toArtifactUrl(runId, absPath)` → `/files/runs/<id>/...`

**Löschen:**
- UUID-Format-Validierung (Path-Traversal-Schutz)
- Laufende Läufe (`activeRun.finished === false`) werden nicht gelöscht
- `fs.rm(dir, { recursive: true, force: true })` — löscht alles inkl. Artefakte

**Aufräum-Task (Testseiten):**
- `GET /api/cleanup/list` → `{ playgrounds, environments: [{ id, label, pages: string[] (volle Pfade), warnings }] }`.
  Durchsucht ALLE Umgebungen aus `environments.json`. Ist eine nicht erreichbar,
  steht ein Hinweis in `warnings`, die übrigen werden trotzdem durchsucht.
- `POST /api/cleanup/delete` → `{ items: [{ env: <id>, path }] }`, Antwort
  `{ results: [{ env, name, status, ok }] }`. Jeder Eintrag nennt seine Umgebung.
- `env` ist die Kennung aus `environments.json`. Nur die Kennung kommt vom
  Browser, nie eine URL, sonst ließen sich Credentials an fremde Hosts schicken.
  Unbekannte Kennungen werden abgelehnt (`ok: false`).
- Gelöscht wird nur, was `isAllowedCleanupPath` erlaubt (`cockpit/cleanup.ts`):
  Testschema-Name direkt unter einer der drei Spielwiesen (Seiten, Visitenkarten, DAM).
- Bis 17.11.2026 nutzte der Task immer die Umgebung der `.env`. Testseiten auf
  TEST blieben deshalb unsichtbar, solange die `.env` auf DEV stand.

## AEM-UI-Patterns (hart erarbeitet — bei Erweiterungen beachten)

Diese Eigenheiten haben viel Zeit gekostet; künftige Agenten sollen sie nicht neu entdecken:

- **Timing vor Selektoren**: Die Granite-Konsole bindet ihre JS-Handler erst nach
  asynchronem Laden. Immer `networkidle` abwarten und zustandsbasiert (nicht per
  festem Sleep) auf das tatsächliche Erscheinen von Elementen warten. Ein zu früher
  Klick setzt zwar DOM-Attribute, löst aber keine Handler aus (Action-Bar bleibt 0px).
- **Selektion in der Spaltenansicht**: Klick auf `coral-columnview-item-thumbnail`,
  danach auf die Action-Bar warten (`button[icon="more"]`-Breite > 0). Der Klick ist
  mehrdeutig (navigieren vs. selektieren) — Zustand prüfen, bei Bedarf wiederholen.
- **Overflow-Aktionen**: Löschen, Veröffentlichung verwalten u.a. liegen im
  "..."-Menü (`button[icon="more"]:visible`), nicht direkt sichtbar in der Bar.
- **Editor-Overlays** (`div[role=button]`): Playwright stuft sie als "not enabled"
  ein. `hover({force})` + `click({force})` statt Koordinaten-Klick. Der Hover
  blendet die Editable-Toolbar erst ein.
- **Komponente einfügen**: Platzhalter-Overlay klicken -> "+"-Button (`icon="add"`)
  -> Insert-Dialog mit Suchfeld. Komponente per Name wählen.
- **Zwei Parsys pro Seite**: Jede Seite hat oben ein Bühnen-Parsys
  (`.../stage/stageParsys/*`, nur Stage-Komponenten wie "Bühne Bild") und darunter
  das Haupt-Inhalts-Parsys (`.../contentPar/*`, "Komponenten hierher ziehen").
  Normale Komponenten wie "Verweis" gibt es NUR im contentPar. `insertComponent`
  wartet daher gezielt auf den contentPar-Platzhalter (nicht den ersten
  sichtbaren), sonst landet der Insert in der Bühne und die Suche bleibt leer.
- **Create-Menü ("Erstellen" -> "Seite")**: Der Eintrag ist
  `a[role=menuitem, is=coral-anchorlist-item]`. ABER es gibt mehrere
  `coral-anchorlist` im DOM, auch in GESCHLOSSENEN Popovers mit `display:block`,
  die Playwright als sichtbar zählt. Immer auf das TATSÄCHLICH offene Popover
  scopen (`coral-popover[open]`), sonst trifft `.first()` einen versteckten
  Dubletten-Eintrag und läuft in den Timeout. Gegen TEST per Diag verifiziert.
- **Versionierung** sitzt in der KONSOLE, nicht im Editor: Rail-Umschalter
  (`coral-cyclebutton`) auf "Timeline", chevronUp-Icon öffnet das Aktionsmenü.
  "Als Version speichern" öffnet ein Label-Formular (Feld `name="label"` + Erstellen).
  Wiederherstellen: Versionseintrag anklicken -> "Auf diese Version zurück"
  (NICHT der Bulk-"Version wiederherstellen"-Button).
- **Dialog-Werte bei Auswahlfeldern** (`coral-select`): `selectedItem` bzw. bei
  `multiple` alle `selectedItems` (kommagetrennt). Nicht `textContent`, das
  enthält alle Optionen. Auf TEST ist die Institutsliste älter als auf DEV, das
  ergab sonst falsche Abweichungen. Referenzen am 16.11.2026 neu erfasst, nur
  die Werte der Auswahlfelder haben sich geändert.
- **Komponenten-Dialog öffnen**: Overlay erst an der Ecke `{x:4,y:4}`, dann
  mittig klicken und jeweils den Dialogtitel (`coral-dialog-header`) prüfen. Mittig
  trifft oft ein verschachteltes Kind (Bereich öffnete „Tabelle").
- **Asset-Finder**: Fraunhofer-Suchen sind Einträge von
  `coral-select[name="assetfilter_type_selector"]` („Visitenkarten", „Externe
  Links"), keine Tabs. Karten: `#SidePanel .editor-Card-asset[data-path]`.
- **Asset-Feld per DnD**: Seitenbedienfeld (`#sidepanel-toggle-button`) VOR dem
  Dialog öffnen, sonst blockiert der modale Hintergrund. Karte per `dragTo` auf
  `coral-fileupload`; Nachweis `input[name="./fileReference"]` (Attributwert
  quoten, `./` ist sonst ungültiges CSS).
- **Baum wiederherstellen**: Timeline braucht eine SEITE (Ordner wie
  `/content/fhgtest` haben keine). chevronUp → `button.cq-siteadmin-admin-restoretree`
  → `form.cq-sites-restoretree-form` (Abbrechen/Wiederherstellen).
- **Timeline-chevronUp**: Nach der Selektion lädt die Rail neu, chevronUp ist kurz
  unsichtbar. Vor jedem Klick auf Sichtbarkeit warten (`openTimelineActionMenu`),
  sonst flaky im Suite-Lauf.
- **LDAP-Import** (Tools, ExtJS): siehe „Diag-Specs → Verifiziert gegen TEST".
- **Sprachversionen (Publish)**:
  - `zv` hat im Header direkte Links: `header` → Link „English"/„Deutsch"
    (exakter Name, nur der sichtbare; im Element `.lang`).
  - Die Samples-Site hat stattdessen ein Ausklappmenü „Language" und keine
    Sprachverknüpfung zwischen den Seiten.
  - `hreflang` steht als `<link rel="alternate" hreflang>` mit Host
    `www.fraunhofer.de` (Externalizer), daher nur den Pfad vergleichen.
  - Die `zv`-Startseite hat kein `hreflang`, das Seitenpaar
    Datenschutzerklärung schon (DEV und TEST, 17.11.2026).
- **Fehlerseite**: nicht existierende Samples-URL nutzen;
  `/content/fhgtest/de/404` liefert nur die rohe Sling-Meldung. Die Samples-404
  ist auf DEV und TEST gebrandet (Titel „Fehlerseite 404"). Der Smoketest nutzt
  `/content/zv/de/<fehlt>`.
- **Smoketest-Selektoren** (DEV + TEST, 16.11.2026):
  - Sites `.cq-siteadmin-admin-childpages .foundation-collection-item`
  - Assets `.cq-damadmin-admin-childpages .foundation-collection-item`
  - Posteingang `table.cq-workflow-inbox-list`
  - miscadmin `.x-tree-node-el`
  - useradmin `.x-grid3-row`
  - Publish `.fhg-header`, `.fhg-footer`
  - Tag-Verwaltung `/aem/tags.html/etc/tags/Samples` →
    `coral-columnview-item[data-foundation-collection-item-id="/etc/tags/Samples/tag1"]`
  - Agents `/etc/replication/agents.author.2.json` + `…/<id>/jcr:content.queue.json`
    (`metaData.queueStatus.isBlocked/isPaused`)
- **Create-Menü, unsichtbares Popover** (Diag 18.11.2026): Nach einmal
  geöffnetem und geschlossenem „Erstellen"-Menü bleibt das Popover mit
  `opacity: 0` und `display: block` über dem Button liegen und fängt Mausklicks
  ab. `clickCreateMenu` klickt mit kurzem Timeout und öffnet sonst per Fokus +
  Enter. Per Tastatur geöffnet fehlt den Einträgen `role=menuitem`, daher
  `a[is="coral-anchorlist-item"]` mit Text „Seite" suchen.
- **Löschen mit Unterseiten**: zweiter Dialog „Löschen erzwingen". Vor jedem
  Löschen prüft `assertOnlySelected`, dass genau die eigene Seite ausgewählt ist.
- **Verschieben/Umbenennen** (Assistent `movepagewizard`): Schritt 1 Name
  (`input[name="name"]`), Schritt 2 Ziel in der Spaltenansicht anklicken. Erst
  die Auswahl setzt das versteckte Feld `destPath`. Fehlt es, schickt AEM den
  Auftrag mit Ziel `/content` ab (Job „0 von 0", ohne Wirkung). `movePage` prüft
  `destPath` vor dem Absenden. Danach „Jetzt" → Fortfahren → Hinweis auf den
  Hintergrundauftrag → OK. Ergebnis erst nach ~15 s sichtbar (`waitForPage`).
  Testseiten unter der Spielwiese sind Startseiten (`homepage`, nur unter
  `instituteconfig` erlaubt), verschoben wird deshalb eine Unterseite.
- **Kopieren**: Vor „Kopieren" auf die Spalten-Vorschau warten
  (`coral-columnview-preview`). Die Auswahl lädt sie nach (`pagecolumnpreview.html`),
  die Action-Bar steht schon ~40 ms vorher. Ein Klick in diesem Fenster ließ die
  Konsole in die Seite springen, „Einfügen" zielte dann auf die Seite selbst
  („Homepage not allowed below …", Diag TEST 19.11.2026, zufällig headless und
  headed). Danach „Kopieren", Escape (Auswahl aufheben), „Einfügen". Im selben
  Ordner heißt die Kopie `<name>1`. In eine leere Unterseite einfügen bietet
  die Konsole nicht an.
- **Seiteneigenschaften** (Reiter Allgemein): `./jcr:title`, `./pageTitle`,
  `./navTitle`, `./subtitle`, `./jcr:description`.
- **Tags** (DEV + TEST, 18.11.2026):
  - Tag-Feld `foundation-autocomplete[name="./cq:tags"]`: Titel ins Eingabefeld
    tippen, Vorschlag `button[value="Samples:tag1"]` wählen, danach steht
    `coral-tag[value="Samples:tag1"]` im Feld.
  - Filterseite (Publish) rendert die Treffer serverseitig als
    `.filterpage-results .filterpage-results--item` (heute je 7).
  - Tags erscheinen nicht im Publish-HTML einer Seite, nur in ihrer Wirkung.
- **Assets-Konsole**:
  - Standard ist die Kartenansicht (Masonry). Dort traf die Auswahl per Hover
    eine fremde Karte, ein fremdes Asset wurde gelöscht (Vorfall 18.11.2026,
    `docs/DEV-asset-geloescht-wiederhergestellt-20261118.md`). Auswählen und
    Löschen deshalb nur in der Spaltenansicht und nur nach Prüfung, dass genau
    der eigene Eintrag ausgewählt ist.
  - Ansicht umschalten: `coral-cyclebutton` mit Eintrag `icon="viewColumn"`.
  - Die Action-Bar erscheint erst nach gebundenen Handlern, sonst abwählen und
    erneut auswählen. „Löschen" liegt im Overflow
    (`coral-actionbar-primary button[icon="more"]` →
    `coral-popover[open] button[trackingelement="delete"]`).
  - Hochladen: „Erstellen" → „Dateien" öffnet die Dateiauswahl
    (`filechooser`), danach Dialog „Assets hochladen" → „Hochladen".
  - Ordner: „Erstellen" → „Ordner", Felder `./jcr:content/jcr:title` und `:name`.
  - Die Kartenansicht lädt nur 20 Einträge, der Rest kommt beim Scrollen.
- **FAQ und Textblock** (`cq:editConfig` mit `REFRESH_PAGE`): Nach Einfügen
  oder Bearbeiten lädt die Seite neu, die Overlays sind danach nicht
  zuverlässig bedienbar. Editor neu öffnen. Innerer Parsys der FAQ:
  `…/faq/faqComponentParsys`, dort u.a. „Textblock extern" (`./headline`,
  `./summary`).
- **Verifikationsmethode**: Bei unbekannter UI ein temporäres
  `_<name>.diag.spec.ts` schreiben (siehe „Diag-Specs"). Es dumpt Elemente und
  Screenshots gegen DEV/TEST. Danach Selektoren fixieren und das Diag wieder
  löschen. Nicht blind raten.

## Testebenen

- **Smoke** (Vorstufe/Gate): Author-Oberflächen laden ohne JS-Fehler, Publish
  liefert `zv` und die Fehlerseite aus, Bundles aktiv, Replication-Agents frei.
  Realer Befund 10.–16.11.2026 auf DEV: Publish-Agent blockiert (HTTP 401,
  veraltetes Agent-Passwort, von JET behoben). Der Author-Status allein hätte
  das nicht gezeigt. REP-1 prüft deshalb zusätzlich Publish (200/404).
- **AEM-Basisfunktionen (Level 1)**: fachlicher Ablauf korrekt (CRUD, Kopieren,
  Verschieben, Umbenennen, Eigenschaften, Komponente einfügen, Version,
  Replication, Asset-Upload).
- **Komponenten (Level 2)**: Komponenten-Dialoge laden, Reiter und Felder gegen
  die Referenz. Eine Komponente (FAQ + Textblock) befüllen bis Publish.
  Darstellung auf Publish (COMP-VIS, VIS-1).
- **Integrationstest**: Zusammenspiel aktualisierter Bibliotheken. Umgesetzt sind
  ACL-Tool und LDAP-Client (Visitenkartenimport). Slice, jsoup, Biweekly und
  vinnie sind offen.
- **Regressionstest: Bekannte Migrationsrisiken**: Overlays und
  Bestandsfunktionen unverändert (Asset-Finder, Download-Asset-Feld, Baum
  wiederherstellen, Fehlerseite, Sprachversionen). Die gesamte Suite ist der
  Regressionstest der Migration, dieser Bereich nur die Einzelrisiken.
- **Visuell**: Screenshotvergleich, Baselines pro `AEM_ENV` getrennt.

### Tags (Kategorisierung für Auswahl/Filter)

Jeder Test trägt einen Playwright-Tag, der ihn einer Kategorie zuordnet (von der
Cockpit zur Gruppierung genutzt). Tag am `test.describe(...)` setzen, damit er für
alle Tests der Datei gilt:

```ts
test.describe('AEM-Basis: Seiten-CRUD', { tag: '@level1' }, () => { /* ... */ });
```

- `@smoke` — Smoketest (Vorstufe/Gate)
- `@level1` — AEM-Basisfunktionen (Cockpit: „AEM-Basisfunktionen (Level 1)")
- `@level2-components` — Komponenten (Dialoge, Befüllen, Darstellung auf Publish)
- `@integration` — Integrationstest (ACL-Tool, LDAP-Import)
- `@regression` — Regressionstest: Bekannte Migrationsrisiken (Overlays,
  Fehlerseite, Sprachversionen)
- `@unit` — Logik-Tests ohne AEM (im Cockpit ausgeblendet, `hidden`)
- `@tooling` — Werkzeug-/Capture-Läufe, kein Testfall (Cockpit ausgeblendet)
- `@visual` — Facette zusätzlich zur Stufe (visuelle Regression)
- `@env:<id>` — Umgebungs-Einschränkung (z.B. `@env:test`). Das Cockpit graut
  den Test bei nicht passender Umgebung aus. Ergänzt (ersetzt nicht) den
  `test.skip` im Code, der die harte Laufzeit-Absicherung bleibt. Aktuell:
  LDAP-Import `@env:test`.

Kategorien mit `"hidden": true` in `cockpit/categories.json` erscheinen nicht in
der Auswahl-Oberfläche, laufen aber weiter über CLI/CI (`@unit`, `@tooling`).

Neue Stufe = neuer Tag plus Eintrag in `cockpit/categories.json` (Tag → lesbarer
Name + `order`). Ohne bekannten Kategorie-Tag landet eine Datei unter "Sonstige".

## Priorisierte Testobjekte

1. AEM-Basisfunktionen (dieses MVP)
2. Formulare inkl. Mailversand, Double Opt-in
3. Globale Suche / Oak-Indizes
4. Navigation, Asset-Verwaltung, Visitenkartenimport (LDAP)
5. RSS, Social Media Wall, Event, Messe, Kurs-/Downloadsuche, Hreflang, adaptive Bilder
6. Overlays und visuelle Regression

## Konventionen

- **Testdaten**: eindeutige Namen via `makeTestPage(slug)` nach dem Schema
  `<level>-<testslug>-<JJJJMMTT>-<HHMMSS>-<uuid4>` (z.B.
  `level1-seiten-crud-20261111-122321-f1dc`). Das `level` kommt aus dem Test-Tag
  (`TEST_LEVELS` in `fixtures/test-fixtures.ts`; neue Level auch in
  `CLEANUP_LEVELS` des Cockpits eintragen) — fehlt ein Level-Tag, wirft `makeTestPage` bewusst
  (kein Fallback, keine namenlosen Rückstände). Nur unter den Spielwiesen.
  Schreibpfade laufen immer durch `assertWithinPlayground`; ohne Argument
  erlaubt der Guard `AEM_PLAYGROUND_PATH` und `AEM_BUSINESSCARD_PLAYGROUND_PATH`.
  Der Aufräum-Task des Cockpits erkennt genau dieses Schema (für DAM-Testdateien
  auch mit Dateiendung). Asset-Tests nutzen den Namen als Testordner unter
  `AEM_DAM_PLAYGROUND_PATH`.
- **Testtitel** (`test`/`describe`) beginnen immer mit einem Großbuchstaben. Ein
  Code-Bezeichner am Anfang bekommt einen deutschen Begriff davor, z.B.
  `Blocker-Erkennung (detectBlocker): …`. Den Bezeichner nicht großschreiben.
  Baselines hängen nicht am Titel (`{arg}` im `snapshotPathTemplate`).
  **Jeder neue Test und jede neue Suite braucht einen englischen Namen**:
  `test('…', titleEn('…'), …)` bzw. `{ tag, annotation: describeEn('…') }` (`fixtures/titles.ts`).
  `tests/unit/titles-en.spec.ts` schlägt sonst fehl.
- **Cleanup**: jede angelegte Seite mit `registerCleanup` registrieren; Teardown
  löscht idempotent, auch bei Fehlschlag.
- **Screenshots**: `toHaveScreenshot` mit `screenshot.css` (dynamische Elemente
  aus). Baselines nur in gleicher Umgebung (CI/Docker) erzeugen.
- **Fehlerklassifikation**: `test-results/` + Trace (`trace: retain-on-failure`).
  Blocker (Login/Umgebung nicht erreichbar) von Funktionsfehlern trennen.
- **Nachweis**: HTML-Report + Traces sind der Beleg eines Laufs.
- **Smoketest-Gate**: Projekte `setup` → `smoke` → `chromium` (playwright.config.ts).
  `smoke` = nur `tests/smoke.spec.ts`. Ist ein Smoketest rot, überspringt Playwright
  `chromium`. Datei- und Grep-Filter wirken nicht auf Abhängigkeiten (gegen
  1.65 geprüft): Bei aktivem Gate läuft die Vorstufe immer komplett (≈ 30 s).
  Das Gate hängt an `SMOKE_GATE`: CLI/CI an (Default), Cockpit aus (nur die
  Auswahl plus Login), dort per Schalter „Smoketest vorab ausführen" zuschaltbar.
  Bei `SMOKE_GATE=0` hängt `chromium` nur am Login. Das Cockpit blendet den
  bestandenen Login in Live-Log und Tabelle aus (19.11.2026, User-Vorgabe:
  „nur ausgewählte Tests laufen"). Neue Smoketests müssen rein
  lesend und schnell sein und auf DEV und TEST laufen. Bekannte JS-Fehler stehen
  mit Begründung in `KNOWN_JS_ERRORS`, nur nach Diag und als Vorher-Stand.
- **Flakiness**: Jeder Flow ist einzeln stabil. Bei langen Suite-Läufen kann die
  TEST-Instanz unter Last träge werden (wandernde Timeout-Fehler = Umgebung, kein
  Selektor-Bug). Retries: lokal 1, CI 2. Globaler Timeout 90 s. Neue Flows
  einzeln mit `--repeat-each=3 --retries=0` auf Stabilität prüfen.

## Regeln für Agenten

- Nur reproduzierbare Schritte. Keine manuellen Vorbedingungen annehmen.
- Keine unbestätigten Annahmen über AEM-Selektoren: beim ersten realen Lauf
  gegen TEST verifizieren, dann nachschärfen.
- Niemals außerhalb der Spielwiesen schreiben. Guard nie umgehen. Eine neue
  Schreib-Wurzel nur nach Rücksprache mit dem User.
- Spielwiesen können fremde Inhalte enthalten (`/content/dam/fhgtest`). Nur
  eigene Einträge nach Testschema löschen, vorher die Auswahl prüfen. Nie über
  Hover oder Position auswählen, wenn fremde Einträge in derselben Ansicht liegen.
- Läuft ein schreibender Test gegen unerwartete Inhalte, sofort stoppen, den
  User informieren und den Stand per Audit-Log prüfen.
- Keine Secrets committen.
- Klare Abbruchkriterien: Login scheitert oder Umgebung nicht erreichbar -> Test
  als Blocker melden, nicht mit Workarounds überdecken.
- Bestehende Patterns (Page Objects, Fixtures) wiederverwenden statt duplizieren.

## Eingriffe außerhalb der Spielwiesen
Veröffentlichen, Tags setzen oder Löschen außerhalb von `/content/fhgtest` und
`/content/businesscards/fhgtest` nur mit ausdrücklicher Freigabe. Vorher Probelauf
oder Plan, danach Nachweis in `docs/`, das Ergebnis immer verifizieren.

## Cockpit und Publish-URL
Das Cockpit setzt bei der Umgebungswahl `AEM_BASE_URL`, `AEM_PUBLISH_URL` und
`AEM_ENV` aus dem Preset in `cockpit/environments.json` (`publishUrl`). Neue
Umgebung = neues Preset mit allen drei Werten. Ohne `publishUrl` gilt `.env`.

## Diag-Specs

- Dateiname `tests/**/_<name>.diag.spec.ts` (Playwright findet nur `*.spec.ts`),
  Tags `@tooling` + Bereich, `test.skip(process.env.DIAG !== '1')`.
- Lauf: `DIAG=1 npx playwright test <datei> --project=setup --project=chromium --retries=0 --reporter=line`.
- Gegen TEST ohne `.env`-Änderung: `AEM_ENV=test AEM_BASE_URL=https://aem-author-test.ws.fraunhofer.de AEM_PUBLISH_URL= DIAG=1 …`
  (dotenv überschreibt gesetzte Variablen nicht).

**Verifiziert gegen DEV (11/2026):** Komponenten-Overlay-Titel
(`fixtures/samples-components.ts`), Dialog-Referenzen, Visual-Baselines,
Asset-Finder, Download-Asset-Feld, Baum wiederherstellen, ACL-Tool.

**Verifiziert gegen DEV und TEST:** Smoketest, Sprachversionen, Replication mit
Publish-Prüfung.
**Verifiziert gegen DEV (18.11.2026) und TEST (19.11.2026):** Kopieren, Verschieben,
Umbenennen, Seiteneigenschaften, Asset-Upload (Testordner), FAQ befüllen bis
Publish. Selektoren und Abläufe siehe „AEM-UI-Patterns".
**Verifiziert gegen TEST:** LDAP-Import (`pageobjects/LdapImportPage.ts`).
- Einstieg liegt NICHT in `/useradmin`, sondern unter Tools (`/miscadmin`) →
  fraunhofer/adminpages → „LDAP Business Card Import". Den Knoten erst anklicken
  und `networkidle` abwarten, dann doppelklicken. Ein sofortiger Doppelklick
  trifft den neu gerenderten Knoten nicht. Die Seite öffnet in einem neuen Tab.
- Das Pfadfeld erzwingt per Regex `/content/businesscards/…`. Schreibziel ist
  deshalb die zweite Spielwiese `/content/businesscards/fhgtest`
  (`AEM_BUSINESSCARD_PLAYGROUND_PATH`), die der Pfad-Guard zusätzlich erlaubt.
- Die Erfolgsmeldung nennt `…/<karte>/jcr:content/businesscard`. Gelöscht wird
  die Seite davor.
- Der Aufräum-Task des Cockpits durchsucht alle drei Spielwiesen (Seiten,
  Visitenkarten, DAM; Testdateien auch mit Endung)
  (`cockpit/cleanup.ts`: `CLEANUP_LEVELS` = alle Test-Level,
  `isAllowedCleanupPath` = nur Testseiten direkt unter einer Spielwiese).

## Umgebungs-Matrix (Erweiterung)

| Testbereich                        | Umgebung            | Grund                                  |
| ---------------------------------- | ------------------- | -------------------------------------- |
| Komponenten-Dialoge (Author)       | DEV oder TEST       | Samples-Content (JET: DEV, auch TEST)  |
| Visuelle Regression (Publish)      | Publish zu DEV/TEST | `AEM_PUBLISH_URL`, sonst Skip          |
| ACL-Tool                           | DEV oder TEST       | technische Prüfung                     |
| LDAP-Import                        | **nur TEST**        | LDAP in DEV dauerhaft nicht angebunden |
| Overlays                           | DEV oder TEST       | Samples-/Editor-Kontext                |
| Smoketest                          | DEV oder TEST       | rein lesend, `/content/zv`             |
| Sprachversionen                    | Publish zu DEV/TEST | `zv`-Seitenpaar, `AEM_PUBLISH_URL`     |
| Replication (REP-1)                | DEV oder TEST       | Publish-Prüfung nur mit `AEM_PUBLISH_URL` |
| Kopieren/Verschieben/Eigenschaften | DEV oder TEST       | Spielwiese `/content/fhgtest`          |
| Asset-Upload                       | DEV oder TEST       | eigener Testordner in `/content/dam/fhgtest` |
| Komponente befüllen (FAQ)          | DEV oder TEST       | Spielwiese, Publish mit `AEM_PUBLISH_URL` |

Stand der Referenzen:
- Dialog-Referenzen (`fixtures/component-dialogs/*.json`) gelten für alle
  Umgebungen und sind aus DEV erfasst. Sind die Samples auf TEST anders befüllt,
  meldet der Dialog-Test Abweichungen.
- Visual-Baselines liegen pro Umgebung getrennt, DEV und TEST sind komplett
  (TEST seit 17.11.2026).
- Samples auf TEST: von JET nur in den Author kopiert. Wir haben einmalig mit
  Freigabe veröffentlicht, per „Tree aktivieren" (`/libs/replication/treeactivation.html`:
  „Nur geänderte" aus, „Deaktivierte ignorieren" an):
  - `/content/samples/de` (300 von 311 Seiten)
  - `/content/samples/en` (311 Seiten, 17.11.2026)
  - `/content/samples/fr|bg|ja|zh` (je nur Startseite, 17.11.2026)
  - `/content/dam/samples`
  - `/content/businesscards/samples`

  Dazu einzeln die Konfigurationsseite `/content/samples` (Logo, Social-Links),
  per Schnellveröffentlichung. Alles von JET freigegeben. Vorsicht: Die kopierten
  Inhalte tragen den DEV-Status „Aktiviert, 23.03.2021". „Veröffentlichung
  verwalten" würde sie deshalb überspringen.
- „Tree aktivieren" schreibt sein Ergebnis in das iframe `treeProgress`
  (Formular-target), nicht in die Seite. Wer das Ergebnis automatisiert liest,
  muss dort auf „N von M Ressourcen in X Sekunden aktiviert" warten. Bricht der
  Browser vorher ab, kann der Vorgang auf dem Server trotzdem weiterlaufen.
- Bekannte Unterschiede DEV/TEST-Publish (Inhalt, kein Testfehler):
  - Social-Links weichen ab.
  - Externe Links ohne Kennzeichen.
  - Newsroom zeigt andere Pressemitteilungen als DEV: Er sortiert nach
    Veröffentlichungsdatum, und auf TEST wurden 51 Seiten am 17.11.2026 neu
    veröffentlicht. Das ist erwartet.
- **Gelöst 17.11.2026: Filterseite auf TEST leer.** Ursache waren fehlende Tags.
  - Auf DEV- und TEST-Author war `cq:tags` der Samples-Seiten leer. DEV-Publish
    hat noch einen älteren Stand mit Tags.
  - Die Filterkomponente fragt nach `cq:tags`. Ihre Abfrage (laut JET) filtert
    auf `Samples:tag1`/`tag2` unter `/content/samples/de/search-data`.
  - Behoben mit Freigabe JET:
    1. `/etc/tags/Samples` und `/etc/tags/categories/samples` per Tree
       aktivieren veröffentlicht.
    2. Bei 51 Seiten auf TEST-Author `cq:tags` wie auf DEV-Publish gesetzt,
       nur dieses Feld, per Sling POST.
    3. Die 51 Seiten neu veröffentlicht.
  - Nachweis: `docs/TEST-tags-wiederhergestellt-20261117.md`. Die Filterseite
    zeigt jetzt 7 Treffer wie DEV.
  - DEV-Author hat weiter leere Tags. Ein Neuveröffentlichen auf DEV würde die
    DEV-Filterseite leeren (mit JET zu klären).
  - Analyse 18.11.2026 (`docs/DEV-tags-analyse-20261118.md`): Die Samples kamen
    auf DEV-Author und DEV-Publish getrennt per Paket `Sicherung_Samples`
    (Juni 2026), nicht per Veröffentlichen. TEST erbte den leeren Stand über das
    am 16.11.2026 aus dem DEV-Author neu gebaute Paket. Warum der DEV-Author die
    Tags verlor, ist offen (andere Paketfassung oder Bereinigung beim Import).
