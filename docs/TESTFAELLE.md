# Testfälle — AEM 6.5 LTS Migration

Lesbare Übersicht der automatisierten Testfälle für die Nachweisführung.
Technische Umsetzung: Playwright/TypeScript (siehe `tests/`). Alle Testfälle
laufen über echte Redakteurs-Gesten in der AEM-Author-UI. Verifiziert sind sie
gegen DEV und TEST, LDAP-Import nur gegen TEST (siehe Gesamtübersicht);
Testseiten werden unter `/content/fhgtest/<level>-<testslug>-<zeitstempel>-<uuid>`
angelegt und nach dem Test automatisch gelöscht. Der LDAP-Import legt
Visitenkarten nach demselben Schema unter `/content/businesscards/fhgtest` an,
der Asset-Test einen Testordner unter `/content/dam/fhgtest`. Verwaiste
Rückstände unter allen drei Spielwiesen lassen sich über den Aufräum-Task der
Web-UI entfernen.

Die Testfälle sind in fünf Bereiche gegliedert (in der Web-UI in dieser
Reihenfolge, die Stufe steht in Klammern):

1. **Smoketest**: Ist die Umgebung betriebsbereit?
2. **AEM-Basisfunktionen (Level 1)**: Was ein Redakteur täglich tut: Seiten
   anlegen, kopieren, verschieben, umbenennen, Eigenschaften, Komponenten
   einfügen, Versionen, Veröffentlichen, Assets hochladen.
3. **Komponenten (Level 2)**: Die Fraunhofer-Komponenten im Editor (Dialoge,
   Befüllen) und ihre Darstellung auf Publish.
4. **Integrationstest**: Zusammenspiel mit aktualisierten Bibliotheken und
   angebundenen Systemen (ACL-Tool, LDAP).
5. **Regressionstest: Bekannte Migrationsrisiken**: gezielte Prüfungen von
   Stellen, die bei der Migration erfahrungsgemäß brechen (Overlays,
   Fehlerseite, Sprachversionen).

Die gesamte Suite dient als Regressionstest der Migration (Vorher-/Nachher).
Bereich 5 bündelt nur die Prüfungen bekannter Einzelrisiken.

| Konvention | Wert |
| --- | --- |
| Umgebung | DEV oder TEST (`AEM_BASE_URL`), Publish über `AEM_PUBLISH_URL`; Umgebungs-Matrix in `AGENTS.md` |
| Spielwiesen | `/content/fhgtest` (Seiten), `/content/businesscards/fhgtest` (Visitenkarten), `/content/dam/fhgtest` (Assets, nur eigener Testordner) |
| Testdaten | `<level>-<testslug>-<zeitstempel>-<uuid>`, Auto-Cleanup nach jedem Test |
| Browser | Chromium (headless) |
| Wiederholungen | lokal 1, CI 2 |
| Nachweis | HTML-Report + Trace/Screenshot/Video bei Fehlern |
| Kategorie-Tags | `@smoke` (Smoketest), `@level1` (Basisfunktionen), `@level2-components` (Komponenten), `@integration` (Integrationstest), `@regression` (Regressionstest), `@unit`, `@tooling`; Facette `@visual`; Einschränkung `@env:<id>` |
| Testnamen | beginnen immer mit einem Großbuchstaben |

---

## Gesamtübersicht (Stand 19.11.2026)

59 AEM-Testfälle inklusive Login (LOGIN-1), dazu 11 Capture-Läufe (COMP-CAP,
nur auf Anforderung) und 80 Unit-Tests. „Verifiziert" nennt die Umgebungen mit
grünem Lauf.

| ID | Testname | Bereich | Datei | Verifiziert |
| --- | --- | --- | --- | --- |
| LOGIN-1 | Authentifizieren (Anmeldung an AEM) | Smoketest | `auth.setup.ts` | DEV, TEST |
| SMOKE-1..5 | „<Oberfläche> lädt ohne JS-Fehler" (Sites, Assets, Posteingang, Tools, Benutzerverwaltung) | Smoketest | `smoke.spec.ts` | DEV, TEST |
| SMOKE-6 | Page-Editor lädt eine Seite mit Komponenten-Overlays | Smoketest | `smoke.spec.ts` | DEV, TEST |
| SMOKE-7 | Publish liefert die Startseite der Fraunhofer-Website aus | Smoketest | `smoke.spec.ts` | DEV, TEST |
| SMOKE-8 | Publish zeigt die Fraunhofer-Fehlerseite für fehlende Seiten | Smoketest | `smoke.spec.ts` | DEV, TEST |
| SMOKE-9 | Alle OSGi-Bundles sind aktiv | Smoketest | `smoke.spec.ts` | DEV, TEST |
| SMOKE-10 | Replication-Agents sind eingerichtet und nicht blockiert | Smoketest | `smoke.spec.ts` | DEV, TEST |
| SMOKE-11 | Tag-Verwaltung lädt und enthält die Samples-Tags | Smoketest | `smoke.spec.ts` | DEV, TEST |
| CRUD-1 | Seite anlegen, bearbeiten und löschen | Basisfunktionen (L1) | `basics/page-crud.spec.ts` | DEV, TEST |
| CRUD-2 | Seite löschen über Tastatur-Shortcut (Backspace) | Basisfunktionen (L1) | `basics/page-crud.spec.ts` | DEV, TEST |
| PAGE-1 | Seite kopieren und im selben Ordner einfügen | Basisfunktionen (L1) | `basics/page-actions.spec.ts` | DEV, TEST |
| PAGE-2 | Unterseite unter eine andere Startseite verschieben | Basisfunktionen (L1) | `basics/page-actions.spec.ts` | DEV, TEST |
| PAGE-3 | Seite umbenennen | Basisfunktionen (L1) | `basics/page-actions.spec.ts` | DEV, TEST |
| PAGE-4 | Seiteneigenschaften speichern und erneut anzeigen | Basisfunktionen (L1) | `basics/page-actions.spec.ts` | DEV, TEST |
| PAGE-5 | Tag in den Seiteneigenschaften setzen und erneut anzeigen | Basisfunktionen (L1) | `basics/page-actions.spec.ts` | DEV, TEST |
| COMP-1 | Komponente hinzufügen und wieder entfernen | Basisfunktionen (L1) | `basics/component-edit.spec.ts` | DEV, TEST |
| VER-1 | Version erstellen und wiederherstellen | Basisfunktionen (L1) | `basics/versioning.spec.ts` | DEV, TEST |
| REP-1 | Seite aktivieren und wieder deaktivieren | Basisfunktionen (L1) | `basics/replication.spec.ts` | DEV, TEST |
| ASSET-1 | Bild in einen Testordner der DAM hochladen und verarbeiten lassen | Basisfunktionen (L1) | `basics/asset-upload.spec.ts` | DEV, TEST |
| COMP-DLG-1..11 | Dialog "<Komponente>": Reiter & Feldinhalte wie Referenz | Komponenten (L2) | `components/dialog.spec.ts` | DEV, TEST |
| COMP-AUTH-1 | FAQ mit Textblock befüllen, im Editor und auf Publish prüfen | Komponenten (L2) | `components/component-authoring.spec.ts` | DEV, TEST |
| COMP-VIS-1..11 | Gerenderte Seite "<Komponente>" entspricht Baseline | Komponenten (L2) | `components/visual-publish.spec.ts` | DEV, TEST |
| VIS-1 | Gerenderte Seite entspricht Baseline (Testseite) | Komponenten (L2) | `basics/visual-regression.spec.ts` | DEV, TEST |
| ACL-1 | AC-Tool-Konsole ist erreichbar | Integrationstest | `integration/acl-tool.spec.ts` | DEV, TEST |
| ACL-2 | AC-Tool-Bundles sind aktiv | Integrationstest | `integration/acl-tool.spec.ts` | DEV, TEST |
| LDAP-1 | Import ist startbar: Kontakt suchen, in Spielwiese importieren, bereinigen | Integrationstest | `integration/ldap-import.spec.ts` | nur TEST |
| OVL-1/2 | Asset-Finder-Suche "Visitenkarten" / "Externe Links" liefert Treffer | Regressionstest | `regression/asset-finder.spec.ts` | DEV, TEST |
| OVL-3 | Asset setzen (leer) und ersetzen (vorhanden) | Regressionstest | `regression/download-fileupload.spec.ts` | DEV, TEST |
| OVL-4 | Formular über die Timeline erreichbar und abbrechbar | Regressionstest | `regression/tree-restore.spec.ts` | DEV, TEST |
| OVL-5 | Fehlerseite (404) entspricht Baseline | Regressionstest | `regression/error-pages.spec.ts` | DEV, TEST |
| LANG-1/2 | Sprachwahl "English" / "Deutsch" öffnet die Gegenseite | Regressionstest | `regression/languages.spec.ts` | DEV, TEST |
| LANG-3 | Hreflang: de- und en-Fassung verweisen gegenseitig aufeinander | Regressionstest | `regression/languages.spec.ts` | DEV, TEST |
| TAG-1 | Filterseite liefert getaggte Treffer | Regressionstest | `regression/tags-filter.spec.ts` | DEV, TEST |

Die am 18.11.2026 neuen Tests (PAGE-1 bis PAGE-4, ASSET-1, COMP-AUTH-1) sind seit
19.11.2026 auch auf TEST grün und mehrfach wiederholt. PAGE-1 (Kopieren) wartet
seitdem auf die Spalten-Vorschau, bevor er kopiert. Dieser Stand lief 10× headless
und 2× sichtbar auf TEST grün. Auf DEV ist er noch nicht nachgeprüft (DEV-Author
am 19.11.2026 nicht erreichbar, HTTP 503).

---

# Bereich 1: Smoketest

## Smoketest (`tests/smoke.spec.ts`, Projekt `smoke`)

Schnelle, rein lesende Prüfung, ob die Umgebung grundsätzlich lebt. Läuft als
**Vorstufe** vor allen übrigen AEM-Tests: Schlägt ein Smoketest fehl, überspringt
Playwright das Projekt `chromium` komplett. Die Web-UI meldet dann „Umgebungs-
Blocker: Smoketest fehlgeschlagen (…)". Datei- und Grep-Filter wirken nicht auf
die Vorstufe, sie läuft dann immer vollständig (≈ 30 s). Läuft auf DEV und TEST.
Die Vorstufe gilt für CLI und CI (`SMOKE_GATE`, Default an). In der Web-UI laufen
nur die ausgewählten Tests. Die Vorstufe ist dort per Schalter „Smoketest vorab
ausführen" zuschaltbar (Stand 19.11.2026).

| Konvention | Wert |
| --- | --- |
| Vorbedingung | gültiger Login (storageState aus `auth.setup.ts`) |
| Echte Site | `/content/zv/de` (Editor und Publish, nur lesend) |
| JS-Fehler | unbehandelte Fehler (`pageerror`) lassen den Test scheitern. Ausnahmen (Vorher-Stand, DEV und TEST): `/miscadmin` „reading 'Tracker'", Page-Editor „reading 'toLowerCase'" |

### LOGIN-1 — Anmeldung an AEM (`tests/auth.setup.ts`, Projekt `setup`)
- **Testname**: „Authentifizieren".
- **Schritte**: Granite-Login-Maske öffnen, Benutzer und Passwort aus `.env`
  eintragen, anmelden. Die Sitzung wird gespeichert und von allen übrigen Tests
  genutzt.
- **Erwartet**: Keine Fehlermeldung auf der Login-Seite, Weiterleitung aus der
  Login-Maske, Granite-Shell sichtbar.
- **Hinweis**: Läuft vor jedem AEM-Lauf, auch ohne Smoketest-Vorstufe. Die
  Web-UI zeigt ihn nur, wenn er fehlschlägt (dann mit Login-Blocker-Hinweis).
  Erzwingt eine Umgebung SSO, muss er an den IdP-Flow angepasst werden.

### SMOKE-1..5 — Author-Oberflächen laden ohne JS-Fehler
- **Testname**: „<Oberfläche> lädt ohne JS-Fehler".
- **Oberflächen**:
  - Sites-Konsole (Spielwiese)
  - Assets-Konsole (`/content/dam`)
  - Posteingang (`/aem/inbox`)
  - Tools (`/miscadmin`)
  - Benutzerverwaltung (`/useradmin`)
- **Schritte**: Oberfläche öffnen, auf das Kernelement warten (Seitenliste,
  Asset-Karten, Posteingangstabelle, Tools-Baum, Benutzerliste).
- **Erwartet**: Keine Weiterleitung zur Login-Maske, Kernelement sichtbar,
  keine unerwarteten JS-Fehler.

### SMOKE-6 — Page-Editor lädt eine Seite mit Komponenten-Overlays
- **Schritte**: `/content/zv/de` im Editor öffnen (keine Änderung).
- **Erwartet**: Content-iFrame und Komponenten-Overlays erscheinen, keine
  unerwarteten JS-Fehler.
- **Hinweis**: echte Site statt Samples, weil `zv` stabil und gebrandet ist.

### SMOKE-7 — Publish liefert die Startseite der Fraunhofer-Website aus
- **Schritte**: `/content/zv/de.html` auf Publish aufrufen.
- **Erwartet**: HTTP 200, Fraunhofer-Header (`.fhg-header`) und -Footer
  (`.fhg-footer`) sichtbar. Ohne Publish-URL überspringt sich der Test.

### SMOKE-8 — Publish zeigt die Fraunhofer-Fehlerseite für fehlende Seiten
- **Schritte**: `/content/zv/de/qa-seite-gibt-es-nicht.html` auf Publish aufrufen.
- **Erwartet**: HTTP 404, Titel „Fehlerseite 404", Fraunhofer-Header sichtbar.
  Die rohe Sling-Meldung „Resource at … not found" ist ein Befund.
- **Grenze**: kein Bildvergleich (der steht in OVL-5).

### SMOKE-9 — Alle OSGi-Bundles sind aktiv
- **Schritte**: `/system/console/bundles.json` lesen.
- **Erwartet**: Jedes Bundle ist `Active` oder `Fragment`. Abweichende Bundles
  werden mit Name und Status genannt.
- **Hinweis**: technische Prüfung, kein Redakteursweg (wie ACL-Test).

### SMOKE-11 — Tag-Verwaltung lädt und enthält die Samples-Tags
- **Schritte**: Tag-Verwaltung (`/aem/tags.html/etc/tags/Samples`) öffnen, danach
  `/aem/tags.html/etc/tags/categories/samples`.
- **Erwartet**: Die Tags `Samples:tag1`, `tag2`, `tag3` und der Bereich
  `categories/samples` werden angezeigt, keine unerwarteten JS-Fehler.
- **Zweck**: Die Filterseite der Samples fragt diese Tags ab (TAG-1). Fehlen sie,
  ist das ein Umgebungs-Blocker für Filter- und Suchtests.

### SMOKE-10 — Replication-Agents sind eingerichtet und nicht blockiert
- **Realer Befund**: Auf DEV war `publish_aem-publish1-dev` vom 10. bis
  16.11.2026 blockiert. Publish antwortete mit HTTP 401, weil das Agent-Passwort
  veraltet war (von JET behoben). Der Test hat das erkannt.
- **Schritte**: Agents unter `/etc/replication/agents.author` lesen, für jeden
  aktivierten Agent die Warteschlange (`…/jcr:content.queue.json`) prüfen.
- **Erwartet**: Mindestens ein aktivierter Publish-Agent (`/bin/receive`). Kein
  aktivierter Agent ist blockiert oder pausiert. Probleme werden mit Agent,
  Anzahl Einträgen und ältestem Eintrag genannt.
- **Hinweis**: technische Prüfung. Ein blockierter Agent heißt, dass
  Veröffentlichungen nicht auf Publish ankommen. Der Smoketest erkennt das
  schnell und vor allen anderen Tests. REP-1 prüft die Zustellung Ende zu Ende
  an einer eigenen Testseite.

---

# Bereich 2: AEM-Basisfunktionen (Level 1)

## AEM-Basis: Seiten-CRUD (`tests/basics/page-crud.spec.ts`)

### CRUD-1 — Seite anlegen, bearbeiten und löschen
- **Vorbedingung**: angemeldet, Spielwiese erreichbar.
- **Schritte**:
  1. Seite über den Erstellen-Wizard anlegen (Standardvorlage).
  2. Seite in der Konsole wiederfinden (erscheint in der Liste).
  3. Titel über die Eigenschaften-UI ändern (Seite selektieren → „Eigenschaften").
  4. Seite über das Action-Menü „…" → „Löschen" entfernen.
- **Erwartet**: Seite wird angelegt, ist auffindbar, Titeländerung speichert,
  nach dem Löschen ist die Seite nicht mehr in der Liste.

### CRUD-2 — Seite löschen über Tastatur-Shortcut (Backspace)
- **Vorbedingung**: angemeldet; eine zuvor angelegte Testseite.
- **Schritte**: Seite selektieren, `Backspace` drücken, Lösch-Dialog bestätigen.
- **Erwartet**: Seite wird gelöscht und verschwindet aus der Liste.
- **Zweck**: belegt den zweiten, von AEM offiziell angebotenen Lösch-Weg.

---

## AEM-Basis: Komponente (`tests/basics/component-edit.spec.ts`)

### COMP-1 — Komponente hinzufügen und entfernen
- **Vorbedingung**: angemeldet; Testseite angelegt und im Page-Editor geöffnet.
- **Schritte**:
  1. Haupt-Inhalts-Parsys aktivieren → „+" → Komponente aus dem Insert-Dialog
     wählen (Default `Verweis`, konfigurierbar via `AEM_TEST_COMPONENT`).
  2. Komponente über ihre Editable-Toolbar → „Löschen" entfernen, Dialog bestätigen.
- **Erwartet**: Komponente erscheint nach dem Einfügen, ist nach dem Entfernen weg.
- **Grenze**: Komponenten-*Befüllen* prüft COMP-AUTH-1 (andere Komponente).
- **Hinweis (zwei Parsys)**: Jede Seite hat oben ein Bühnen-Parsys (nur
  Stage-Komponenten) und darunter das Haupt-Inhalts-Parsys („Komponenten hierher
  ziehen"). Normale Komponenten wie `Verweis` gibt es nur im Haupt-Parsys; der
  Test fügt gezielt dort ein, nicht in der Bühne.

---

## AEM-Basis: Versionierung (`tests/basics/versioning.spec.ts`)

### VER-1 — Version erstellen und wiederherstellen
- **Vorbedingung**: angemeldet; Testseite angelegt.
- **Schritte**:
  1. In der Zeitachse (Konsole) eine Version „v1" des Ausgangszustands speichern.
  2. Seite verändern: eine Komponente im Haupt-Inhalts-Parsys einfügen.
  3. Version „v1" über „Auf diese Version zurück" wiederherstellen.
- **Erwartet**: Nach dem Wiederherstellen ist die eingefügte Komponente wieder
  verschwunden (Rollback auf den Stand von v1).
- **Hinweis (Editor-Timing)**: Der Editor (`editor.html`) hält Dauerverbindungen;
  das Öffnen wartet daher zustandsbasiert auf den Content-iFrame, nicht auf
  `networkidle` (das nie eintritt).

---

## AEM-Basis: Replication (`tests/basics/replication.spec.ts`)

### REP-1 — Seite aktivieren und deaktivieren
- **Vorbedingung**: angemeldet; Testseite angelegt; `AEM_PUBLISH_URL` gesetzt
  (bzw. ableitbar).
- **Schritte**:
  1. Seite aktivieren (Quick Publish, Dialog bestätigen).
  2. Publikationsstatus im Author prüfen.
  3. Seite auf Publish abrufen, bis sie erscheint (bis 60 s).
  4. Seite deaktivieren („…" → „Veröffentlichung verwalten" → Wizard).
  5. Publikationsstatus im Author erneut prüfen.
  6. Seite auf Publish abrufen, bis sie verschwindet (bis 60 s).
- **Erwartet**: Der Status wechselt auf „Veröffentlicht" und wieder auf „Nicht
  veröffentlicht". Auf Publish liefert die Seite nach dem Aktivieren HTTP 200,
  nach dem Deaktivieren HTTP 404.
- **Hinweis**: AEM setzt „Veröffentlicht" schon beim Einreihen in die
  Warteschlange. Ohne die Publish-Prüfung blieb die blockierte DEV-Zustellung
  vom 10.–16.11.2026 unbemerkt. Der Abruf umgeht den Dispatcher-Cache per
  Query-Parameter. Gegenprobe mit fremder Publish-Instanz: Der Test wird rot
  („Seite kommt nicht auf Publish an").
- **Grenze**: Ohne Publish-URL prüft der Test nur den Author-Status und vermerkt
  das im Report.

---


## AEM-Basis: Seiten kopieren, verschieben, umbenennen, Eigenschaften (`tests/basics/page-actions.spec.ts`)

### PAGE-1 — Seite kopieren und im selben Ordner einfügen
- **Schritte**: Testseite selektieren, „Kopieren", Auswahl aufheben, „Einfügen".
- **Erwartet**: Die Kopie erscheint als `<name>1` neben dem Original, das
  Original bleibt erhalten.

### PAGE-2 — Unterseite unter eine andere Startseite verschieben
- **Vorbedingung**: zwei Testseiten (Startseiten), unter der ersten eine
  Unterseite.
- **Schritte**: Unterseite selektieren → „Verschieben" → Schritt 1 ohne
  Änderung → Schritt 2 die zweite Startseite als Ziel wählen → „Verschieben" →
  „Jetzt" / Fortfahren → Hinweis auf den Hintergrundauftrag bestätigen.
- **Erwartet**: Die Unterseite steht unter der zweiten Startseite und fehlt am
  alten Ort (Hintergrundauftrag, bis 90 s).
- **Hinweis**: Testseiten direkt unter der Spielwiese sind Startseiten. AEM
  erlaubt keine Startseite unter einer Startseite (Vorlagenregel), deshalb wird
  eine Unterseite verschoben. Vor dem Absenden prüft der Test das tatsächliche
  Ziel im Assistenten (verstecktes Feld `destPath`). Ohne diese Prüfung ging am
  18.11.2026 ein Auftrag mit Ziel `/content` ab (ohne Wirkung).

### PAGE-3 — Seite umbenennen
- **Schritte**: „Verschieben" → Schritt 1 neuen Seitennamen eintragen →
  Schritt 2 den bisherigen Ordner als Ziel wählen → „Verschieben".
- **Erwartet**: Die Seite heißt danach `<name>-neu`, der alte Name fehlt.

### PAGE-5 — Tag in den Seiteneigenschaften setzen und erneut anzeigen
- **Schritte**: „Eigenschaften" öffnen, im Feld „Tags" „Tag 1" tippen, den
  Vorschlag `Samples : Tag 1` wählen, „Speichern & schließen". Eigenschaften
  erneut öffnen.
- **Erwartet**: Der Tag `Samples:tag1` ist gespeichert und wird angezeigt.
- **Zweck**: Tags steuern Filter- und Suchergebnisse. Am 17.11.2026 war die
  Filterseite auf TEST leer, weil `cq:tags` fehlte.
- **Grenze**: Auf Publish wird der Tag nicht geprüft. Er erscheint nicht im
  HTML der Seite, nur seine Wirkung in Filtern (siehe TAG-1).

### PAGE-4 — Seiteneigenschaften speichern und erneut anzeigen
- **Schritte**: „Eigenschaften" öffnen, Navigationstitel, Untertitel und
  Beschreibung eintragen, „Speichern & schließen". Eigenschaften erneut öffnen.
- **Erwartet**: Alle drei Werte sind gespeichert und werden wieder angezeigt.

---

## AEM-Basis: Asset hochladen (`tests/basics/asset-upload.spec.ts`)

### ASSET-1 — Bild in einen Testordner der DAM hochladen und verarbeiten lassen
- **Vorbedingung**: DAM-Spielwiese `/content/dam/fhgtest` (Freigabe 18.11.2026,
  `AEM_DAM_PLAYGROUND_PATH`).
- **Schritte**:
  1. Assets-Konsole → „Erstellen" → „Ordner": eigenen Testordner nach
     Testschema anlegen.
  2. Im Testordner „Erstellen" → „Dateien": Testbild (`fixtures/assets/qa-upload.png`,
     32 × 32 Pixel) hochladen.
  3. Warten, bis die Karte die Bildmaße „32 x 32" zeigt.
  4. Testordner in der Spaltenansicht auswählen und löschen.
- **Erwartet**: Upload gelingt, die Verarbeitung (Workflow „DAM Update Asset")
  schreibt die Bildmaße, der Testordner ist danach weg.
- **Sicherung**: Gelöscht wird nur, wenn genau der eigene Testordner ausgewählt
  ist. Anlass: Vorfall vom 18.11.2026 (fremdes Asset gelöscht und
  wiederhergestellt, `docs/DEV-asset-geloescht-wiederhergestellt-20261118.md`).

---

# Bereich 3: Komponenten (Level 2)

## Komponenten-Dialoge (Author) (`tests/components/`)

Basis: Komponenten-Beispielseiten unter `AEM_SAMPLES_ROOT`
(Default `/content/samples/de/components`). Läuft gegen Author (DEV **oder** TEST
über `AEM_BASE_URL`). Priorisierung laut JET-Antwort: Section, Teaser (inkl.
Stage), Presse, Event, Messe, Formular, Slider, Gallery, Businesscard, Filter,
Newsroom. Rein lesend — der Schreib-Guard ist nicht berührt.

### COMP-DLG-1..11 — Konfig-Dialog je Komponente (`tests/components/dialog.spec.ts`)
- **Vorbedingung**: angemeldet; Samples-Seite vorhanden; Referenz-Fixture je
  Komponente erzeugt (siehe Capture unten).
- **Schritte**:
  1. Samples-Seite der Komponente im Editor öffnen.
  2. Komponente über ihr Overlay selektieren, Konfig-Dialog öffnen.
  3. Über **alle Reiter** iterieren, je Reiter Felder + aktuelle Werte auslesen.
  4. Gegen die Referenz-Fixture (Vorher-Stand) vergleichen.
- **Erwartet**: der richtige Dialog öffnet (Dialogtitel = Komponentenname;
  sonst Fehler „Falscher Dialog geöffnet"), alle sichtbaren Reiter vorhanden,
  erwartete Felder vorhanden und mit den Referenzwerten befüllt. Bei
  Auswahlfeldern zählt der gewählte Eintrag, bei Mehrfachauswahl alle gewählten.
  Die angebotene Optionsliste zählt nicht.
- **Stand**: grün auf DEV und TEST (16.11.2026). Die Referenzen sind aus DEV
  erfasst und gelten für beide Umgebungen.
- **Befund**: Leere Felder werden als Warnung ausgegeben (fachlicher
  Nachbesserungs-Befund — Samples-Inhalt fehlt), nicht stillschweigend geschluckt.
- **Grenze**: Soll-Werte stammen aus dem aktuellen Stand (vor Migration). Fehlt
  die Referenz, überspringt sich der Test mit Hinweis auf den Capture-Lauf.

### COMP-CAP — Referenz-Fixtures erzeugen (`tests/components/dialog-capture.spec.ts`)
- **Zweck**: hält den Vorher-Stand der Dialogstruktur fest
  (`fixtures/component-dialogs/<key>.json`), analog zu `update-snapshots`.
- **Ausführen**: `npm run capture-dialogs` (setzt `CAPTURE_DIALOGS=1`). Ohne
  diese Variable überspringt sich der Capture.
- **Erwartet**: pro Komponente eine JSON mit Reitern/Feldern/Werten; leere Felder
  werden auf der Konsole gemeldet und sind vor dem Festschreiben zu klären.

### COMP-VIS-1..11 — Visuelle Regression (Publish) (`tests/components/visual-publish.spec.ts`)
- **Testname**: „Gerenderte Seite "<Komponente>" entspricht Baseline".
- **Vorbedingung**: `AEM_PUBLISH_URL` gesetzt (bzw. aus `AEM_BASE_URL`
  ableitbar); Baseline erzeugt.
- **Schritte**: gerenderte Komponenten-Beispielseite auf der Publish-Instanz
  aufnehmen und mit der Baseline vergleichen.
- **Erwartet**: Screenshot stimmt innerhalb der Toleranz mit der Baseline überein.
- **Grenze**: nur Publish (JET-Vorgabe). Ohne Publish-URL überspringt sich der
  Test sauber. Baselines pro `AEM_ENV` getrennt (Vorher-/Nachher). Bekannte
  Unterschiede zwischen TEST und DEV (z.B. Tags, Newsroom-Sortierung) stehen in
  AGENTS.md. Nach Veröffentlichungen Baselines neu erzeugen.

### COMP-AUTH-1 — FAQ mit Textblock befüllen, im Editor und auf Publish prüfen (`tests/components/component-authoring.spec.ts`)
- **Vorbedingung**: Testseite in der Spielwiese; für den Publish-Teil
  `AEM_PUBLISH_URL`.
- **Schritte**:
  1. Komponente „FAQ" in den Haupt-Inhalts-Parsys einfügen.
  2. In den inneren Parsys der FAQ einen „Textblock extern" einfügen.
  3. Dialog öffnen, Überschrift und Text eintragen, „Fertig".
  4. Editor neu laden, Inhalt prüfen.
  5. Seite veröffentlichen, auf Publish prüfen, Veröffentlichung zurücknehmen.
- **Erwartet**: Überschrift und Text stehen nach dem Speichern im Editor und
  kommen auf Publish an (bis 60 s).
- **Hinweis**: Bewusst andere Komponenten als COMP-1 (Verweis) und die 11
  Samples-Dialoge. FAQ und Textblock laden nach jeder Änderung die Seite neu
  (`REFRESH_PAGE`), danach öffnet der Test den Editor neu. Ohne Publish-URL
  endet der Test nach der Editor-Prüfung (Skip mit Grund).
- **Grenze**: Welche weiteren Komponenten so geprüft werden sollen, ist
  fachlich mit JET zu klären.

### VIS-1 — Gerenderte Testseite entspricht Baseline (`tests/basics/visual-regression.spec.ts`)

- **Vorbedingung**: angemeldet; Testseite angelegt; Baseline vorhanden
  (Web-UI „Baselines aktualisieren" oder `npm run baseline:visual`).
- **Schritte**: gerenderte Seitenansicht (`?wcmmode=disabled`) aufnehmen und mit
  der Baseline vergleichen.
- **Erwartet**: Screenshot stimmt innerhalb der Toleranz mit der Baseline überein.
- **Grenze**: Baseline derzeit auf Basis der leeren Seite; mit gefüllter Seite
  erweitern, sobald Komponenten priorisiert sind. Baselines sind pro `AEM_ENV`
  getrennt (Vorher-/Nachher-Vergleich alt vs. neu).
- **Toleranz**: Font-/Icon-Anti-Aliasing erzeugt an Kanten Sub-Pixel-Rauschen
  (real ~1100 Pixel = 0,01 der Fläche) ohne echte Änderung. Die Toleranz ist
  daher auf `maxDiffPixelRatio: 0.02` gesetzt (statt absoluter 100 Pixel), sodass
  echte Layout-/Inhaltsänderungen weiterhin auffallen.

- **Einordnung**: Bereich Komponenten (Darstellung), Datei bleibt aus
  Kompatibilität der Baselines unter `tests/basics/`.

---

# Bereich 4: Integrationstest

## Integration (`tests/integration/`)

### ACL-1 — AC-Tool-Konsole erreichbar (`tests/integration/acl-tool.spec.ts`)
- **Schritte**: `/system/console/actool` als eingeloggter Admin aufrufen.
- **Erwartet**: HTTP 200, keine Weiterleitung zur Login-Maske.

### ACL-2 — AC-Tool-Bundles aktiv
- **Schritte**: `/system/console/bundles.json` lesen, AC-Tool-Bundles filtern
  (Muster `actool`/`accesscontroltool`).
- **Erwartet**: mindestens ein AC-Tool-Bundle gefunden, alle im Status `Active`.
  Inaktive Bundles werden einzeln benannt.
- **Grenze**: nur technische Prüfung (JET zu 4.), keine Berechtigungs-/Rollentests.

### LDAP-1 — LDAP-/Visitenkartenimport startbar (`tests/integration/ldap-import.spec.ts`)
- **Vorbedingung**: **nur TEST** (LDAP ist in DEV dauerhaft nicht angebunden);
  angemeldet. Vorname via `LDAP_SEARCH_QUERY` überschreibbar (Default `Max`).
- **Schritte**:
  1. Tools (`/miscadmin`) → fraunhofer → adminpages → „LDAP Business Card
     Import" doppelklicken; die Importseite öffnet in einem neuen Tab.
  2. Nach Vorname suchen („Search").
  3. Beim ersten Treffer das grüne Plus klicken; der Dialog schlägt einen Pfad
     unter `/content/businesscards/` vor.
  4. Zielpfad auf die Visitenkarten-Spielwiese
     `/content/businesscards/fhgtest/<level>-ldap-import-<zeitstempel>-<uuid>`
     setzen und „Import" klicken.
  5. In der Sites-Konsole prüfen, dass die Karte existiert. Danach löscht das
     Auto-Cleanup genau die Karte aus der Erfolgsmeldung über die Konsole.
- **Erwartet**: Treffer vorhanden, Pfad vorbelegt, Erfolgsmeldung „… successfully
  imported to …", Karte in der Konsole sichtbar, keine Rückstände.
- **Hinweis**: Das Zielfeld erzwingt `/content/businesscards/…`. Deshalb wird
  nicht in `/content/fhgtest` importiert, sondern in den dafür vorhandenen
  Ordner `fhgtest` im Visitenkarten-Bereich. Echte Institutsordner werden nicht
  beschrieben (Pfad-Guard).
- **Grenze**: Geprüft wird, dass der Import startbar ist und eine Karte anlegt
  (JET zu 5./6.). Der Karteninhalt wird nicht feldweise geprüft. Außerhalb von
  TEST überspringt sich der Test. Grundlegende Berechtigungsfunktionen werden
  nicht getestet.

---

# Bereich 5: Regressionstest: Bekannte Migrationsrisiken

## Overlays, Fehlerseite, Sprachversionen (`tests/regression/`)

Konkrete Fraunhofer-Overlays laut JET-Antwort zu 7, dazu Fehlerseite und
Sprachversionen.

### OVL-1/2 — Asset-Finder-Suchen (`tests/regression/asset-finder.spec.ts`)
- **Schritte**: Samples-Seite im Editor öffnen, Seitenbedienfeld (Asset-Finder)
  aufklappen, in der Typauswahl „Visitenkarten" bzw. „Externe Links" wählen.
- **Erwartet**: die Ergebnisliste wechselt und liefert Treffer, alle aus
  `/content/businesscards/` bzw. `/content/externallinklib/`.

### OVL-3 — Download-Dialog Asset-Feld per Drag & Drop (`tests/regression/download-fileupload.spec.ts`)
- **Schritte**: Download-Komponente öffnen (`…/section/download-component`).
  Asset-Finder öffnen, danach den Konfig-Dialog. Anschließend:
  1. vorhandenes Asset über „Entfernen" leeren;
  2. leeres Feld → Karte aus dem Asset-Finder per Drag & Drop **setzen**;
  3. vorhandenes Asset → andere Karte per Drag & Drop **ersetzen**.
- **Erwartet**: `./fileReference` ist nach dem Leeren leer. Nach dem Setzen enthält
  es den DAM-Pfad der ersten Karte, nach dem Ersetzen den der zweiten. Der Dialog
  wird ohne Speichern geschlossen, die Samples-Seite bleibt unverändert.
- **Hinweis**: echter Redakteursweg (Drag aus dem Asset-Finder), kein Upload
  einer lokalen Datei.

### OVL-4 — Baum wiederherstellen (Timeline) (`tests/regression/tree-restore.spec.ts`)
- **Schritte**: Seite der Spielwiese (Default `/content/fhgtest/de`) in der Konsole
  selektieren. Timeline → Aktionsmenü → „Baum wiederherstellen" öffnen, dann
  „Abbrechen".
- **Erwartet**: Formular „Baum unter … wiederherstellen" mit Button
  „Wiederherstellen" erscheint und schließt nach „Abbrechen". **Nicht destruktiv**:
  Es wird keine Wiederherstellung ausgeführt.

### OVL-5 — Fehlerseite (Publish, visuell) (`tests/regression/error-pages.spec.ts`)
- **Testname**: „Fehlerseite (404) entspricht Baseline".
- **Vorbedingung**: `AEM_PUBLISH_URL` gesetzt; Baseline erzeugt. Pfad via
  `ERROR_PAGE_PATH` überschreibbar (Default
  `/content/samples/de/qa-seite-gibt-es-nicht`).
- **Schritte**: nicht existierende URL auf Publish aufrufen, gerenderte
  Fehlerseite aufnehmen und mit der Baseline vergleichen.
- **Erwartet**: Fraunhofer-Fehlerseite („Dokument nicht gefunden") statt roher
  Sling-Meldung; Screenshot stimmt innerhalb der Toleranz mit der Baseline überein.

### LANG-1/2 — Sprachwahl öffnet die Gegenseite (`tests/regression/languages.spec.ts`)
- **Testname**: „Sprachwahl "English" öffnet die en-Gegenseite" bzw. „… "Deutsch"
  öffnet die de-Gegenseite".
- **Vorbedingung**: `AEM_PUBLISH_URL` gesetzt, sonst Skip. Nur lesend.
- **Schritte**: Auf Publish `/content/zv/de/datenschutzerklaerung.html` öffnen und
  im Header auf „English" klicken. Umgekehrt von
  `/content/zv/en/data-protection-policy.html` aus auf „Deutsch".
- **Erwartet**: Die zugehörige Seite der anderen Sprache öffnet sich, nicht die
  Startseite und keine 404. `html lang` ist `en` bzw. `de`, der Fraunhofer-Header
  ist sichtbar.
- **Grenze**: Geprüft wird ein echtes Seitenpaar der Fraunhofer-Website (`zv`).
  Die Samples-Seiten haben keine Sprachverknüpfung. Ihr Ausklappmenü
  „Language" ist nicht abgedeckt.

### TAG-1 — Filterseite liefert getaggte Treffer (`tests/regression/tags-filter.spec.ts`)
- **Vorbedingung**: `AEM_PUBLISH_URL` gesetzt, sonst Skip. Nur lesend.
- **Schritte**: Auf Publish `…/components/filterpage/filterpage_v2.html` aufrufen
  und die Treffer (`.filterpage-results--item`) zählen.
- **Erwartet**: HTTP 200 und mindestens ein Treffer (DEV und TEST heute je 7).
  Bei 0 Treffern nennt die Meldung die wahrscheinliche Ursache: `cq:tags` der
  Samples-Seiten oder nicht veröffentlichte Tags.
- **Hintergrund**: Am 17.11.2026 war die Filterseite auf TEST leer, weil die
  Tags im Author fehlten (`docs/TEST-tags-wiederhergestellt-20261117.md`). Der
  Bildvergleich COMP-VIS-10 zeigt so etwas nur als Bildabweichung.
- **Hinweis**: Auf dem DEV-Author fehlen die Tags weiterhin. Wird auf DEV neu
  veröffentlicht, wird der Test dort rot. Das ist gewollt.
- **Grenze**: Geprüft wird „mindestens 1", nicht die genaue Zahl, damit
  inhaltliche Änderungen an den Samples nicht stören. Die Gegenprobe mit
  leerer Filterseite ist nicht durchgeführt.

### LANG-3 — Hreflang (`tests/regression/languages.spec.ts`)
- **Schritte**: de- und en-Fassung des Seitenpaars auf Publish laden, im Seitenkopf
  `<link rel="alternate" hreflang="…">` auslesen.
- **Erwartet**: Beide Seiten liefern HTTP 200. Die de-Seite verweist per
  `hreflang="en"` auf die en-Seite, die en-Seite per `hreflang="de"` zurück.
  Verglichen wird nur der Pfad, der Host ist der externe Name `www.fraunhofer.de`.

---

# Technische Prüfungen

## Unit (ohne AEM) (`tests/unit/`)

### UNIT-PUBLISH — Publish-URL-Auflösung (`tests/unit/publish-config.spec.ts`)
- **Zweck**: sichert `resolvePublishConfig`/`derivePublishUrl` ab (Task 1).
- **Fälle**: explizite `AEM_PUBLISH_URL` hat Vorrang; Fallback leitet
  author→publish1 ab; End-Slash wird entfernt; ohne ableitbare URL trägt
  `reason` den Skip-Grund.
- **Erwartet**: alle Fälle grün, ohne AEM.

### UNIT-1..4 — Pfad-Guard (`tests/unit/path-guard.spec.ts`)
- **Zweck**: stellt sicher, dass Schreiboperationen nur unterhalb der Spielwiesen
  erlaubt sind.
- **Fälle**: erlaubt Pfade innerhalb `/content/fhgtest`; blockiert Pfade außerhalb;
  blockiert Präfix-Trickserei (`/content/fhgtest-evil`); mehrere Spielwiesen:
  `/content/businesscards/fhgtest` erlaubt, echte Institutsordner (z.B. `IOF`)
  blockiert.
- **Erwartet**: Guard lässt erlaubte Pfade zu und wirft bei allen anderen.

### UNIT-WEBUI — Web-UI-Kernlogik (ohne AEM)
- **Zweck**: sichert die reine Logik hinter der Test-Web-UI ab, ohne AEM/Login.
- **Dateien**: `tests/unit/webui-catalog.spec.ts`, `webui-runargs.spec.ts`,
  `webui-report.spec.ts`, `webui-history.spec.ts`, `webui-cleanup.spec.ts`,
  `webui-live-reporter.spec.ts`.
- **Fälle**:
  - **Katalog-Parser** (`parseCatalog`): flacht die verschachtelte
    `--list`-JSON-Struktur (Datei → describe → Test) korrekt ab; führt denselben
    Test über mehrere Projekte zu einem Eintrag zusammen.
  - **Argument-Bauer** (`buildRun`): baut aus der UI-Auswahl die korrekte
    Playwright-Kommandozeile; `chromium` zieht `setup` nach; `--headed` vs.
    `--ui` (UI-Mode) schließen sich aus; der Datei/Zeile-Filter steht OHNE `--`
    (sonst ignoriert Playwright ihn und läuft das ganze Projekt); UI-Mode
    übernimmt Projekte + `--grep`, aber keine positionalen Filter; Zusatzoptionen
    (`--grep`, `--repeat-each`, `--workers`, `--update-snapshots`); leere
    Legacy-URL setzt `AEM_BASE_URL` nicht. Die Umgebungswahl setzt
    `AEM_BASE_URL`, `AEM_PUBLISH_URL` (aus `publishUrl` des Presets) und
    `AEM_ENV`; ohne `publishUrl` bleibt `AEM_PUBLISH_URL` ungesetzt.
    `SMOKE_GATE` ist ohne Schalter `0` (nur die Auswahl), mit Schalter
    „Smoketest vorab ausführen" `1`.
  - **Report-Transformer** (`buildReportView`): wandelt den JSON-Report in die
    Tabellenform (Status, Dauer, Fehler ohne ANSI, Attachments); Summary zählt
    korrekt; jeder Durchlauf bei `--repeat-each` zählt einzeln („Durchlauf 2/3"),
    ein erst im Retry bestandener Test zählt als instabil (`flaky`); `detectBlocker` erkennt einen Umgebungs-Blocker, wenn alle Tests an
    Login/Timeout scheitern, und meldet nichts bei gemischtem Ergebnis. Ein
    fehlgeschlagener Smoketest (Projekt `smoke`) ergibt den Gate-Hinweis mit
    Testname; derselbe Fehler in `chromium` nicht. `buildRun`: Nur Smoketests
    ziehen `setup` nach. Ein bestandener Login (`setup`) erscheint nicht in
    Tabelle und Summary, ein gescheiterter schon.
  - **Aufräum-Erkennung** (`webui-cleanup.spec.ts`: `isTestPageName`,
    `isAllowedCleanupPath`): erkennt alle Test-Level und ignoriert Fremd- und
    Altnamen. Erlaubt sind nur Testseiten direkt unter `/content/fhgtest`,
    `/content/businesscards/fhgtest` oder `/content/dam/fhgtest`. Testdateien
    mit Endung (`….png`) werden erkannt, fremde Assets wie `Koala.jpg` nicht. Blockiert werden echte Institutsordner,
    tiefere Pfade und `..`.
  - **Live-Reporter** (`formatTestDuration`, `statusLabel`): Die Dauer hat eine
    Nachkommastelle und ist korrekt gerundet (0,85 s → `0.9s`). Ab 60 s kommt
    das Minutenformat (`1m 00s` statt `60.0s`). Die Statuskürzel lauten ✓, ✘,
    `✘ Timeout` und `– übersprungen`.
  - **Historie/Baseline** (`sortRunsNewestFirst`, `baselinePath`, `runSettingsFrom`): sortiert Läufe
    neueste zuerst; löst Baseline-Pfade gemäß `snapshotPathTemplate` je Umgebung auf;
    speichert die Lauf-Einstellungen, das Tempo nur im sichtbaren Lauf (headless = 0).
- **Erwartet**: alle Fälle grün; die Web-UI-Logik ist unabhängig von einer echten
  AEM-Umgebung abgesichert.

### UNIT-UI-LOGIK — Logik und Kontrast der neuen Web-UI (`tests/unit/webui-ui-logic.spec.ts`)
- **Zweck**: sichert die DOM-freie Logik der neuen Oberfläche (`webui/public/js/logic.js`)
  und die Lesbarkeit der Farbpalette (`webui/public/tokens.css`) ab. Kein AEM, kein Browser.
- **Fälle** (15):
  - **Theme** (`resolveTheme`): gespeicherte Wahl schlägt die Systemeinstellung, sonst gilt das System.
  - **Auswahl**: Testschlüssel trennt Geschwister mit gleicher Datei und Zeile; `env:`-Tag schränkt
    die Umgebung ein; Unit-only erzwingt Headless; Suche über Titel, Suite, Kategorie, Tags.
  - **Ergebnisse**: Statusart (instabil = bestanden mit Wiederholung, Timeout = Fehlschlag);
    Gruppierung mit Fehlschlägen zuerst und stabiler Reihenfolge; Kernaussage („2 von 6 Tests
    fehlgeschlagen", „Alle 4 Tests bestanden", abgebrochen, leer); Formate für Dauer und Größe.
  - **Historie**: Lauf-Label (max. 3 Dateien), Einstellungs-Kurztext, Gruppierung nach Monat und
    Tag (aktueller Monat offen, „Heute"/„Gestern").
  - **Kontrast (WCAG AA)**: Textpaare der Tokens erreichen im hellen und im dunklen Theme 4,5:1
    (UI-Elemente wie der Fokusrahmen 3:1).
- **Erwartet**: alle Fälle grün.

### UNIT-UI-BROWSER — Bedienung der neuen Web-UI (`tests/unit/webui-ui.spec.ts`)
- **Zweck**: prüft die Oberfläche im Browser gegen einen lokalen Server, der `webui/public`
  ausliefert und `/api/*` mit festen Daten beantwortet. Kein AEM, kein Login, kein echter Lauf;
  gelöscht oder gestartet wird nichts.
- **Fälle** (10):
  - **Testlauf**: Start ohne Auswahl gesperrt, mit Auswahl frei; Schritt-Kopf und Start-Leiste
    fassen die Auswahl zusammen. Im Schrittmodus ist genau ein Schritt offen, „Alle offen" öffnet alle.
  - **Umgebung**: Ein Test mit `@env:test` ist unter DEV gesperrt und fällt beim Wechsel aus der
    Auswahl. Aufgeklappte Kategorien bleiben beim Neuzeichnen offen.
  - **Nur Unit-Tests**: „Sichtbar" ist gesperrt, Headless aktiv.
  - **Shell**: Reiter per Hash-Routing, Reload und Home-Taste; Theme-Umschalter speichert die Wahl,
    ohne Wahl folgt die UI dem System.
  - **Ergebnisse**: Früherer Lauf zeigt Kernaussage, Fehlschlag zuerst, Filter wirkt;
    Löschen verlangt Bestätigung und sendet bei „Abbrechen" nichts.
  - **Werkzeuge**: Aufräum-Suche listet Testseiten; Löschen fragt erst nach.
- **Erwartet**: alle Fälle grün.

---

## Pflege

Bei neuen oder geänderten Tests diese Übersicht mitführen (siehe
`.kiro/steering/arbeitsweise.md`).
