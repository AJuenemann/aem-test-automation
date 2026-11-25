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
Cockpit entfernen.

Die Testfälle sind in fünf Bereiche gegliedert (im Cockpit in dieser
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
| Testnamen | beginnen immer mit einem Großbuchstaben; jeder Test trägt zusätzlich einen englischen Namen (`titleEn(...)`, jede Suite `describeEn(...)`, `fixtures/titles.ts`), den das Cockpit in der Sprache EN zeigt |

---

## Gesamtübersicht (Stand 23.11.2026)

82 AEM-Testfälle inklusive Login (LOGIN-1), dazu 11 Capture-Läufe (COMP-CAP)
und 8 Referenz-Erfassungen (REF-CAP, nur auf Anforderung) und 149 Unit-Tests. „Verifiziert" nennt die Umgebungen mit
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
| SMOKE-11 | Tag-Verwaltung lädt und enthält die Samples-Tags | Smoketest | `smoke.spec.ts` | DEV (23.11.2026), TEST (19.11.2026) |
| SMOKE-12 | Samples-Inhalte liegen auf Author und Publish | Smoketest | `smoke.spec.ts` | DEV (24.11.2026); TEST offen (Samples fehlen) |
| CRUD-1 | Seite anlegen, bearbeiten und löschen | Basisfunktionen (L1) | `basics/page-crud.spec.ts` | DEV, TEST |
| CRUD-2 | Seite löschen über Tastatur-Shortcut (Backspace) | Basisfunktionen (L1) | `basics/page-crud.spec.ts` | DEV, TEST |
| PAGE-1 | Seite kopieren und im selben Ordner einfügen | Basisfunktionen (L1) | `basics/page-actions.spec.ts` | DEV (23.11.2026), TEST |
| PAGE-2 | Unterseite unter eine andere Startseite verschieben | Basisfunktionen (L1) | `basics/page-actions.spec.ts` | DEV, TEST |
| PAGE-3 | Seite umbenennen | Basisfunktionen (L1) | `basics/page-actions.spec.ts` | DEV, TEST |
| PAGE-4 | Seiteneigenschaften speichern und erneut anzeigen | Basisfunktionen (L1) | `basics/page-actions.spec.ts` | DEV, TEST |
| PAGE-5 | Tag in den Seiteneigenschaften setzen und erneut anzeigen | Basisfunktionen (L1) | `basics/page-actions.spec.ts` | DEV (23.11.2026), TEST |
| COMP-1 | Komponente hinzufügen und wieder entfernen | Basisfunktionen (L1) | `basics/component-edit.spec.ts` | DEV, TEST |
| VER-1 | Version erstellen und wiederherstellen | Basisfunktionen (L1) | `basics/versioning.spec.ts` | DEV, TEST |
| REP-1 | Seite aktivieren und wieder deaktivieren | Basisfunktionen (L1) | `basics/replication.spec.ts` | DEV, TEST |
| ASSET-1 | Bild in einen Testordner der DAM hochladen und verarbeiten lassen | Basisfunktionen (L1) | `basics/asset-upload.spec.ts` | DEV, TEST |
| ASSET-2 | Bild in einer Seite verwenden, Verweise zählen und über die Suche finden | Basisfunktionen (L1) | `basics/asset-usage.spec.ts` | DEV, TEST (24.11.2026) |
| COMP-DLG-1..11 | Dialog "<Komponente>": Reiter & Feldinhalte wie Referenz | Komponenten (L2) | `components/dialog.spec.ts` | DEV (23.11.2026), TEST |
| COMP-AUTH-1 | FAQ mit Textblock befüllen, im Editor und auf Publish prüfen | Komponenten (L2) | `components/component-authoring.spec.ts` | DEV, TEST |
| COMP-VIS-1..11 | Gerenderte Seite "<Komponente>" entspricht Baseline | Komponenten (L2) | `components/visual-publish.spec.ts` | DEV (24.11.2026), TEST |
| VIS-1 | Gerenderte Seite entspricht Baseline (Testseite) | Komponenten (L2) | `basics/visual-regression.spec.ts` | DEV, TEST |
| ACL-1 | AC-Tool-Konsole ist erreichbar | Integrationstest | `integration/acl-tool.spec.ts` | DEV, TEST |
| ACL-2 | AC-Tool-Bundles sind aktiv | Integrationstest | `integration/acl-tool.spec.ts` | DEV, TEST |
| LDAP-1 | Import ist startbar: Kontakt suchen, in Spielwiese importieren, bereinigen | Integrationstest | `integration/ldap-import.spec.ts` | nur TEST |
| LDAP-2 | Importierte Karte im Asset-Finder finden, in eine Seite einsetzen und Daten prüfen | Integrationstest | `integration/ldap-import.spec.ts` | nur TEST (24.11.2026) |
| OVL-1/2 | Asset-Finder-Suche "Visitenkarten" / "Externe Links" liefert Treffer | Regressionstest | `regression/asset-finder.spec.ts` | DEV (23.11.2026), TEST |
| OVL-3 | Asset setzen (leer) und ersetzen (vorhanden) | Regressionstest | `regression/download-fileupload.spec.ts` | DEV (23.11.2026), TEST |
| OVL-4 | Formular über die Timeline erreichbar und abbrechbar | Regressionstest | `regression/tree-restore.spec.ts` | DEV, TEST |
| OVL-6 | Gelöschte Unterseite wird zum Zeitpunkt davor wiederhergestellt | Regressionstest | `regression/tree-restore.spec.ts` | DEV (23.11.2026), TEST (24.11.2026) |
| OVL-5 | Fehlerseite (404) entspricht Baseline | Regressionstest | `regression/error-pages.spec.ts` | DEV (24.11.2026), TEST |
| LANG-1/2 | Sprachwahl "English" / "Deutsch" öffnet die Gegenseite | Regressionstest | `regression/languages.spec.ts` | DEV, TEST |
| LANG-3 | Hreflang: de- und en-Fassung verweisen gegenseitig aufeinander | Regressionstest | `regression/languages.spec.ts` | DEV, TEST |
| TAG-1 | Filterseite liefert getaggte Treffer | Regressionstest | `regression/tags-filter.spec.ts` | DEV (24.11.2026), TEST |
| NAV-1 | Navigation: Links sind unverändert und erreichbar | Regressionstest | `regression/publish-reference.spec.ts` | DEV (23.11.2026), TEST (25.11.2026) |
| FEED-1 | RSS-Feeds: Aufbau und Einträge sind unverändert | Regressionstest | `regression/publish-reference.spec.ts` | DEV (24.11.2026), TEST (25.11.2026) |
| EVT-1 | Event und Messe: Listen und Detailseite sind unverändert | Regressionstest | `regression/publish-reference.spec.ts` | DEV (24.11.2026), TEST (25.11.2026) |
| SEARCH-1 | Globale Suche: Trefferzahl und Spitzentreffer wie vorher | Regressionstest | `regression/publish-reference.spec.ts` | nur TEST (25.11.2026); auf DEV übersprungen |
| COURSE-1 | Kurssuche: Trefferzahl und Spitzentreffer wie vorher | Regressionstest | `regression/publish-reference.spec.ts` | DEV, TEST (25.11.2026) |
| DL-1 | Downloadsuche: Trefferzahl und Spitzentreffer wie vorher | Regressionstest | `regression/publish-reference.spec.ts` | DEV, TEST (25.11.2026) |
| NAV-2 | Geänderter Navigationstitel erscheint auf Publish im Hauptmenü | Regressionstest | `regression/navigation-change.spec.ts` | DEV (24.11.2026); TEST rot: Replication blockiert |
| LANG-4 | Hreflang: weitere Seitenpaare verweisen gegenseitig aufeinander | Regressionstest | `regression/publish-reference.spec.ts` | DEV (23.11.2026), TEST (25.11.2026) |
| IMG-1 | Bilder: laden in drei Fenstergrößen, scharf und unverändert | Regressionstest | `regression/publish-reference.spec.ts` | DEV (23.11.2026), TEST (25.11.2026) |
| ERR-1 | Fehlerseiten zeigen auf Deutsch und Englisch das Fraunhofer-Design | Regressionstest | `regression/error-pages-lang.spec.ts` | DEV (23.11.2026), TEST (25.11.2026) |
| REAL-1..9 | Seite "<Name>" sieht aus wie vorher (Startseite, Institute, Presse, Artikel mit Bildern, Inhaltsseite, Formular, Messen-Liste, Messe- und Veranstaltungs-Detailseite) | Regressionstest | `regression/real-pages-visual.spec.ts` | DEV, TEST (25.11.2026) |

**Historie des Cockpits** (`cockpit/runs/`): beginnt am 19.11.2026. Letzter vollständiger Lauf auf TEST am
19.11.2026 (18:04), alle 58 Tests grün (ohne Login). Auf DEV: Smoketest am 23.11.2026 08:45 mit 10 von 11 grün
(SMOKE-11 rot); Anmeldung auf DEV am 19.11.2026 (zweimal) und am 23.11.2026 09:52 gescheitert, DEV war nicht
erreichbar. Läufe über die Kommandozeile stehen nicht in der Historie (z. B. alle DEV-Prüfungen vor dem 19.11.2026).

**Stand DEV (24.11.2026, alter Softwarestand AEM 6.5.25.0, Produktionsinhalt, Samples):** Tags der Samples auf dem
Author nachgetragen und Samples auf Publish veröffentlicht, mit Freigabe (`docs/DEV-samples-veroeffentlicht-20261124.md`).
Baseline „Newsroom" danach neu erzeugt (Reihenfolge nach Veröffentlichungsdatum).
**Gesamtlauf über das Cockpit am 25.11.2026 (Vorher-Stand, DEV und TEST laufen noch AEM 6.5.25.0):** 236 Tests, 216 grün,
0 rot, 1 instabil (PAGE-4: `waitForURL` beim ersten Versuch im Timeout, beim zweiten grün), 20 übersprungen
(Capture-Läufe, LDAP nur TEST, SEARCH-1 nur TEST). Lauf `5605f00e-698c-475e-96b0-b23900c56784` in `cockpit/runs/`
(lokal, nicht im Repo). Dieser Stand ist als Git-Tag `vorher-stand-dev-20261125` gesichert.
**Stand TEST (24.11.2026, 25.11.2026 unverändert: AEM 6.5.25.0):** wieder erreichbar, offenbar mit neuem Produktionsinhalt. Samples fehlen auf Author und
Publish (404). Beide Replication-Agents (`publish_aem-publish1-test`, `flush_aem-publish1-dispatcher-test`) sind seit
24.11.2026 09:08 MEZ blockiert (SMOKE-10 rot). Ursache laut Agent-Log: `aem-publish1-publisher-test.ws.fraunhofer.de`
lehnt Verbindungen ab (`java.net.ConnectException: Connection refused`). Grund laut JET: Auf TEST-Publish wird
der Inhalt der Produktion eingespielt (alte Software bleibt). Danach TEST-Baselines gegen den neuen Inhalt prüfen und
bei Bedarf neu erfassen, TEST-Referenzen (`npm run capture-references`) erstmals erfassen, beides vor dem Upgrade. Die 50 wartenden Einträge stammen alle aus
unseren Testläufen nach 09:08; sie werden nach der Behebung nachgeholt und enden jeweils mit dem Löschen. Deshalb sind REP-1 und NAV-2 auf TEST rot.
Grün auf TEST: OVL-4, OVL-6, ASSET-2, CRUD-1/2, LDAP-1, LDAP-2 (3 Wiederholungen).
DEV und TEST sind jetzt die Referenz für den Vorher-Stand (Hydra ist
voraussichtlich nicht erreichbar); die Baselines und Dialog-Referenzen sind **vor dem Upgrade** zu sichern.

Die am 18.11.2026 neuen Tests (PAGE-1 bis PAGE-4, ASSET-1, COMP-AUTH-1) sind seit
19.11.2026 auch auf TEST grün und mehrfach wiederholt. PAGE-1 (Kopieren) wartet
seitdem auf die Spalten-Vorschau, bevor er kopiert. Dieser Stand lief 10× headless
und 2× sichtbar auf TEST grün und am 23.11.2026 auf DEV grün.

---

# Bereich 1: Smoketest

## Smoketest (`tests/smoke.spec.ts`, Projekt `smoke`)

Schnelle, rein lesende Prüfung, ob die Umgebung grundsätzlich lebt. Läuft als
**Vorstufe** vor allen übrigen AEM-Tests: Schlägt ein Smoketest fehl, überspringt
Playwright das Projekt `chromium` komplett. Das Cockpit meldet dann „Umgebungs-
Blocker: Smoketest fehlgeschlagen (…)". Datei- und Grep-Filter wirken nicht auf
die Vorstufe, sie läuft dann immer vollständig (≈ 30 s). Läuft auf DEV und TEST.
Die Vorstufe gilt für CLI und CI (`SMOKE_GATE`, Default an). In des Cockpits laufen
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
  Cockpit zeigt ihn nur, wenn er fehlschlägt (dann mit Login-Blocker-Hinweis).
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

### SMOKE-12 — Samples-Inhalte liegen auf Author und Publish
- **Schritte**: Auf dem Author `/content/samples/de.json` und `/content/dam/samples.json` lesen (nur HTTP-Status).
  Mit gesetzter Publish-URL zusätzlich `/content/samples/de.html` auf Publish aufrufen.
- **Erwartet**: Alle Abfragen liefern HTTP 200. Fehlt etwas, nennt der Test die Pfade mit Status
  („`/content/samples/de: HTTP 404`") und den Hinweis, das Samples-Paket einspielen bzw. die Samples veröffentlichen zu lassen.
- **Zweck**: Voraussetzung der Komponenten-Tests (Dialoge, Overlays, Visual, Asset-Finder, Fehlerseite, Filterseite).
  Fehlen die Samples, zeigt der Smoketest die Ursache vorab, statt dass Folgetests mit schwer lesbaren Fehlern scheitern.
  Ergänzt SMOKE-11: Der Tag-Test prüft nur den Tag-Namensraum.
- **Einordnung**: rein lesend, schnell, auf DEV und TEST möglich, wie die übrigen Smoketests. Als Teil des
  Smoketests hängt er am Gate: Mit eingeschaltetem Gate (CLI/CI Standard, Cockpit per Schalter) laufen bei
  fehlenden Samples auch die Basisfunktionen nicht, obwohl sie `/content/fhgtest` nutzen und keine Samples brauchen.
- **Grenze**: Prüft nicht, ob die Seiten ihre Tags tragen (`cq:tags`, TAG-1) und nicht die Businesscards.
- **Stand**: Auf DEV am 23.11.2026 rot: Samples auf Author vorhanden (wieder eingespielt), auf Publish nicht
  veröffentlicht (HTTP 404). Der Author-Teil war grün. Auf TEST noch nicht gelaufen.

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


### ASSET-2 — Asset verwenden und finden (`tests/basics/asset-usage.spec.ts`)
- **Testname**: „Bild in einer Seite verwenden, Verweise zählen und über die Suche finden".
- **Schritte**:
  1. Eigenen Testordner anlegen, Testbild mit eindeutigem Namen hochladen. Karte zeigt „Verweise 0".
  2. Testseite anlegen, „Bereich" und darin „Breites Bild" einfügen (im Haupt-Parsys gibt es keine Komponente mit
     Asset-Feld). Asset-Finder öffnen, per Feld „Filter" das Testbild suchen, Dialog „Breites Bild" → Reiter „Bild",
     Karte ins Bildfeld ziehen, „Fertig".
  3. Assets-Konsole: Karte zeigt „Verweise 1" (`coral-card-property[title="Verweise"]`, erscheint verzögert).
  4. Omnisearch (Lupe im Header) mit dem Namen: Testbild ist Treffer.
  5. Testseite löschen, danach Testordner löschen.
- **Erwartet**: Verweise 0 → 1, Suche findet das Asset, keine Rückstände.
- **Nicht automatisiert**: „Vor dem Löschen entsteht eine Version" (manuell MAN-09, Testplan Kapitel 12, Nr. 13) ist über die UI nicht prüfbar. Nach dem Löschen
  zeigt die Ordner-Timeline keine Versionen, auch nicht mit Filter „Versionen" (Diag DEV 24.11.2026).
- DEV 24.11.2026: 3 Wiederholungen grün; TEST 24.11.2026 grün.
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
  (Cockpit „Baselines aktualisieren" oder `npm run baseline:visual`).
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


### LDAP-2 — Importierte Karte einsetzen (`tests/integration/ldap-import.spec.ts`)
- **Testname**: „Importierte Karte im Asset-Finder finden, in eine Seite einsetzen und Daten prüfen". **Nur TEST.**
- **Schritte**: Wie LDAP-1 importieren, dabei Vorname, Nachname und Institut der Trefferzeile merken. Testseite anlegen,
  „Visitenkarten-Übersicht" einfügen (enthält die Komponente „Visitenkarten"). Asset-Finder → „Visitenkarten": Die Karte
  ist Treffer und zeigt den Namen. Karte auf das Drop-Ziel der Komponente „Visitenkarten" ziehen
  (`.cq-Overlay-subdroptarget[data-asset-accept*="businesscard"]`), auf den Speicher-POST warten.
- **Erwartet**: Die Seite zeigt (ohne Editor) Name und Institut aus LDAP und eine Telefonnummer.
- **Hinweis**: Das Pfadfeld im Dialog ist kein Drop-Ziel. Vor dem Drop auf eine ruhige Overlay-Position warten, das
  Seitenbedienfeld verschiebt die Overlays. Auf Testseiten der Spielwiese stehen neben den Werten Schlüssel wie
  `phoneTitle`: Der Spielwiese fehlen die Texte der Sprachkonfiguration (`instlangconfig`), auf der Samples-Seite von
  DEV steht korrekt „Telefon"/„Fax". Kein Fehler.
- TEST 24.11.2026: 3 Wiederholungen grün.
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

### OVL-6 — Baum wiederherstellen ausführen (`tests/regression/tree-restore.spec.ts`)
- **Testname**: „Gelöschte Unterseite wird zum Zeitpunkt davor wiederhergestellt". Gelöschte Assets sind über die UI nicht wiederherstellbar (manuell MAN-10).
- **Schritte**: Testseite mit Unterseite `kind` in der Spielwiese anlegen. Von der Unterseite über die Timeline
  eine Version speichern (Redaktionsseiten haben Versionen aus dem Aktivieren, frische Testseiten nicht; ohne
  Version stellt AEM nichts her). Bis nach der nächsten vollen Minute B warten, Unterseite löschen. An der
  Testseite „Baum wiederherstellen" mit Zeitpunkt B (Feld „Datum", Format „23. November 2026 16:03") ausführen.
- **Erwartet**: Antwort von `/bin/wcmcommand` ok, Umleitung in die Konsole, Unterseite erscheint wieder.
- **Hinweis**: Das Datumsfeld kennt nur Minuten, die Sekunden bleiben vom Vorschlag (jetzt). Deshalb liegt das
  Anlegen vor B und das Löschen nach B; Laufzeit etwa 4 Minuten. Cleanup löscht die Testseite samt Unterseite.
  DEV 23.11.2026: 3 Wiederholungen grün.

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
- **Hinweis**: Auf DEV-Author fehlten die `cq:tags` der Samples-Seiten wie auf TEST. Am 24.11.2026 nachgetragen und
  veröffentlicht (`docs/DEV-samples-veroeffentlicht-20261124.md`), seitdem 7 Treffer.
- **Grenze**: Geprüft wird „mindestens 1", nicht die genaue Zahl, damit
  inhaltliche Änderungen an den Samples nicht stören. Die Gegenprobe mit
  leerer Filterseite ist nicht durchgeführt.

### LANG-3 — Hreflang (`tests/regression/languages.spec.ts`)
- **Schritte**: de- und en-Fassung des Seitenpaars auf Publish laden, im Seitenkopf
  `<link rel="alternate" hreflang="…">` auslesen.
- **Erwartet**: Beide Seiten liefern HTTP 200. Die de-Seite verweist per
  `hreflang="en"` auf die en-Seite, die en-Seite per `hreflang="de"` zurück.
  Verglichen wird nur der Pfad, der Host ist der externe Name `www.fraunhofer.de`.

### NAV-1 — Navigation: Links sind unverändert und erreichbar (`tests/regression/publish-reference.spec.ts`)
- **Vorbedingung**: `AEM_PUBLISH_URL` gesetzt, Referenz `fixtures/references/<AEM_ENV>/navigation.json` vorhanden
  (Vorher-Stand, `npm run capture-references`). Nur lesend, ohne Login.
- **Schritte**: Auf Publish die Startseiten `/content/zv/de` und `/content/zv/en` laden und alle Links in den
  `<nav>`-Bereichen (Hauptnavigation, Menü, Servicenavigation) einsammeln. Mit der Referenz vergleichen, danach jedes
  interne Ziel einmal aufrufen.
- **Erwartet**: Dieselben Links wie im Vorher-Stand (kein fehlender, kein neuer), jedes interne Ziel liefert HTTP 200.
  Die Meldung nennt bis zu 25 Abweichungen.
- **Ergänzt durch**: NAV-2 (Navigationstitel ändern, veröffentlichen, auf Publish prüfen).
- **Grenze**: Prüft Ziel und Erreichbarkeit, nicht die Reihenfolge und nicht das Aussehen der Menüs.

### NAV-2 — Navigation nach Änderung (`tests/regression/navigation-change.spec.ts`)
- **Testname**: „Geänderter Navigationstitel erscheint auf Publish im Hauptmenü".
- **Vorbedingung**: `AEM_PUBLISH_URL` gesetzt, Replication frei.
- **Schritte**: Testseite mit Unterseite `kind` anlegen. Navigationstitel der Unterseite in den Seiteneigenschaften
  setzen, beide Seiten veröffentlichen. Auf Publish die Testseite öffnen, im Hauptmenü (`ul.fhg-mainmenu`) steht der
  Titel. Titel ändern, nur die Unterseite neu veröffentlichen, Testseite erneut öffnen.
- **Erwartet**: Das Hauptmenü zeigt den neuen Titel. Geprüft wird ohne Cache-Umgehung wie ein Besucher (vor Publish
  sitzt ein Apache/Dispatcher), Wartezeit bis 180 s. Danach beide Seiten deaktivieren; der Teardown löscht sie.
- **Hinweis**: `deactivatePage` bestätigt jetzt die Rückfrage „… untergeordnete Element(e) ebenfalls aufgehoben"
  (eigene Unterseiten, TEST 24.11.2026). DEV 24.11.2026: 3 Wiederholungen grün.
### LANG-4 — Hreflang weiterer Seitenpaare (`tests/regression/publish-reference.spec.ts`)
- **Vorbedingung**: wie NAV-1, Referenz `hreflang-pairs.json` (12 Seitenpaare, per Breitensuche ab der deutschen
  Startseite erfasst).
- **Schritte**: Je Paar die deutsche Seite laden, `hreflang="en"` lesen, die englische Seite laden, `hreflang="de"` lesen.
- **Erwartet**: Beide Seiten HTTP 200, die Verweise führen auf die erfassten Pfade (Vorher-Stand) und gegenseitig
  zurück, die englische Seite hat `lang="en"`. Verglichen wird nur der Pfad.
- **Ergänzt**: LANG-3 (ein Paar mit Sprachwahl im Kopf).
### IMG-1 — Bilder laden in drei Fenstergrößen, scharf und unverändert (`tests/regression/publish-reference.spec.ts`)
- **Vorbedingung**: wie NAV-1, Referenz `images.json`.
- **Schritte**: Die Seiten `/content/zv/de` und `/content/zv/de/fuer-kunden-und-partner` bei 375, 768 und 1280 px Breite
  laden, bis Lazy Loading durchgelaufen ist, und alle sichtbaren Bilder auswerten.
- **Erwartet**: Es gibt sichtbare Bilder, keines lädt nicht, keines ist schmaler als 90 % der Anzeigebreite (SVG
  ausgenommen). Die Menge der ausgelieferten Renditionen (`….img.<Rendition>.jpg` mit Breite, sonst Pfad mit Breite)
  entspricht dem Vorher-Stand.
- **Hinweis**: Rotierende Slider ändern die einzelnen Bilder, nicht
  die Renditionen, deshalb wird auf Renditionen verglichen.
- **Grenze**: Ob der Bildausschnitt oder das Motiv passt, wird nicht beurteilt.
### ERR-1 — Fehlerseiten Deutsch und Englisch (`tests/regression/error-pages-lang.spec.ts`)
- **Vorbedingung**: `AEM_PUBLISH_URL` gesetzt. Nur lesend, ohne Login.
- **Schritte**: Je zwei nicht vorhandene Adressen auf `/content/zv/de` und `/content/zv/en` aufrufen (Startebene und
  Unterseite).
- **Erwartet**: HTTP 404, Titel „Fehlerseite 404" (de) bzw. „Errorpage 404" (en), `lang` passend, Fraunhofer-Header,
  nicht die rohe Sling-Meldung.
- **Ergänzt**: SMOKE-8 (nur Deutsch) und OVL-5 (Bildvergleich).
- **Grenze**: Geschützte Seiten (403) sind nicht geprüft, dafür fehlt eine bekannte Seite (Testplan Kapitel 12, Nr. 11).
### FEED-1 — RSS-Feeds (`tests/regression/publish-reference.spec.ts`)
- **Vorbedingung**: `AEM_PUBLISH_URL` gesetzt, Referenz `feeds.json`. Nur lesend, ohne Login.
- **Schritte**: Die Feeds `/content/zv/de/rss/presse.rss` und `…/veranstaltungen.rss` auf Publish abrufen, mit dem Browser
  als XML parsen und mit der Referenz vergleichen.
- **Erwartet**: HTTP 200, XML wohlgeformt, gleicher Content-Type, gleiche Kanalfelder (Titel, Sprache, Kategorie,
  Redaktionsadresse, ttl …), gleich viele Einträge, je Eintrag gleicher Titel, Link, GUID, Datum, Länge und Text der
  Beschreibung (fängt geänderte HTML-Verarbeitung ab). Die Meldung nennt bis zu 25 Abweichungen.
- **Stand DEV 24.11.2026**: Presse-Feed 25 Einträge, Veranstaltungs-Feed 0 Einträge (DEV hat keine künftigen Veranstaltungen
  im Feed). Content-Type ist `text/html;charset=utf-8`, auch das gilt als Vorher-Stand.
- **Grenze**: Prüft den Feed, nicht die Darstellung in einem Feed-Reader.

### EVT-1 — Event und Messe (`tests/regression/publish-reference.spec.ts`)
- **Vorbedingung**: wie FEED-1, Referenz `events.json`.
- **Schritte**: Die Listen `…/veranstaltungen-messen/veranstaltungen` und `…/messen` laden (erste Seite,
  `.filterpage-results--item` mit Ort, Datum, Titel, Link). Dazu die Detailseite des Eintrags mit dem spätesten Ende, der einen
  Detailblock (`.fhg-event-details`) zeigt (manche Einträge leiten weiter, z. B. „e-world 2027").
- **Erwartet**: Dieselben Einträge mit gleichem Titel, Ort und Datum wie im Vorher-Stand, gleicher Text des Detailblocks.
  Einträge, deren Zeitraum inzwischen vorbei ist, dürfen aus der Liste fallen.
- **Stand DEV 24.11.2026**: 10 Veranstaltungen und 2 Messen.

### SEARCH-1 — Globale Suche (`tests/regression/publish-reference.spec.ts`, Tag `@env:test`)
- **Vorbedingung**: nur TEST, Referenz `search.json`. Die Enterprise Search ist auf DEV laut JET nicht
  eingerichtet (25.11.2026): `POST /bin/wcm/enterprisesearch/query` endet dort erst nach etwa 136 s mit 504 Gateway
  Timeout (in den Chrome-Entwicklertools im Reiter „Network" sichtbar). Der Test überspringt sich dort.
- **Schritte**: Für „Energie", „Quantencomputer" und „Müller" die Ergebnisseite öffnen, wie sie das Suchformular aufruft
  (`/content/zv/de/suche.html?queryString=…`). Die Treffer lädt die Seite per Skript nach: auf die Überschrift
  „N Ergebnisse für …" und die Liste warten.
- **Erwartet**: Trefferzahl höchstens 10 % unter dem Vorher-Stand, mindestens 7 der 10 vorherigen Spitzentreffer
  (Links) wieder auf der ersten Seite. Der Index wird außerhalb von AEM gepflegt und wächst, daher die Toleranz.
- **Hinweis**: Die Treffer stammen aus dem Such-Index der Produktion (Adressen `www.*.fraunhofer.de`). Der Test prüft,
  dass der Such-Dienst von AEM wie vorher antwortet, nicht den Index selbst. Die Suche über Eingabefeld und Lupe der
  Startseite ließ sich auf DEV nicht automatisieren (Absenden löste nichts aus, solange der Dienst hängt) und ist nicht
  abgedeckt.
- **Stand TEST 24.11.2026**: 23.484, 1.613 und 5.456 Treffer.

### REAL-1..9 — Optik echter Seiten (`tests/regression/real-pages-visual.spec.ts`)
- **Vorbedingung**: `AEM_PUBLISH_URL` gesetzt, Baselines je Umgebung unter `tests/__snapshots__/<AEM_ENV>/regression/real-pages-visual.spec.ts/`
  (Vorher-Stand, 25.11.2026). Nur lesend, ohne Login.
- **Schritte**: Je Seite die gerenderte Seite auf Publish öffnen, bis zum Ende scrollen (Lazy-Bilder), ganze Seite
  aufnehmen und mit der Baseline vergleichen. Toleranz wie bei VIS-1 (`maxDiffPixelRatio` 0,02).
- **Seiten (Vorschlag aus dem Produktionsinhalt)**: Startseite, Institute und Einrichtungen, Presse / Newsroom, Artikel mit
  Bildern (Humanoide Robotik), Inhaltsseite (Zahlen und Fakten), Seite mit Formular (Ausschreibungen, 18 Felder), Liste der
  Messen, Messe-Detailseite (BAU 2027), Veranstaltungs-Detailseite (AI4Surfaces 2027). Die Liste steht als `REAL_PAGES` im Test.
- **Erwartet**: Die Seite sieht aus wie im Vorher-Stand.
- **Bewusst nicht dabei**: Die Liste der Veranstaltungen. Vergangene Termine fallen aus ihr, der Vergleich bräche ohne
  Fehler der Website (Termine prüft EVT-1). Die Liste der Messen hat nur Termine ab Januar 2027.
- **Stand**: DEV und TEST am 25.11.2026 erzeugt, je dreimal wiederholt grün (27 von 27). Mit einer vertauschten Baseline
  wird der Test rot (Größe und 20 % Pixel abweichend), danach wieder grün.
- **Grenze**: Ein Bildvergleich zeigt Abweichungen, nicht ob sie gewollt sind. Nach dem Upgrade bewertet ein Mensch die
  Abweichungsbilder im Bericht.

### COURSE-1 — Kurssuche (`tests/regression/publish-reference.spec.ts`)
- **Vorbedingung**: `AEM_PUBLISH_URL` gesetzt, Referenz `course-search.json`. Nur lesend, ohne Login.
- **Schritte**: Die Ergebnisseite `/content/academy/de/weiterbildung/suchergebnis` laden (ohne Begriff zeigt sie alle Kurse).
  Danach „Management" in das Suchfeld der Seite (`form[action="/bin/wcm/coursesearch/query"]`) tippen und Enter drücken.
  Gelesen werden „Ergebnisse 1-10 von N" und die ersten 10 Treffer (Titel und Link, `.coursesearchresults--title a`).
- **Erwartet**: Trefferzahl höchstens 10 % unter dem Vorher-Stand, mindestens 7 der 10 Spitzentreffer wieder dabei.
- **Stand**: DEV und TEST am 25.11.2026: 48 Kurse, 12 Treffer für „Management".
- **Grenze**: Die Filter (Branche, Typ) sind nicht geprüft. Der Dienst `GET /bin/wcm/coursesearch/query` verlangt in
  `currentPage` den Seitenpfad, eine Zahl ergibt 400.

### DL-1 — Downloadsuche (`tests/regression/publish-reference.spec.ts`)
- **Vorbedingung**: wie COURSE-1, Referenz `download-search.json`.
- **Schritte**: Auf `/content/iis-test/de/ff/amm/dltest` (durchsucht `/content/dam/iis/de/doc/ame`, auf DEV und TEST gleich)
  „AME" und „Fraunhofer" in das Suchfeld tippen und Enter drücken (`POST …/jcr:content/downloadsearch.json`). Gelesen
  werden die Trefferzahl und die ersten 10 Treffer (`ul.download-search-results > li a`).
- **Erwartet**: Wie COURSE-1.
- **Stand**: DEV und TEST am 25.11.2026: 3 Treffer für „AME", 71 für „Fraunhofer".
- **Hinweis**: Die Samples-Seite `/content/samples/de/pages/download-search` gibt es auf TEST nicht, daher diese Seite.
- **Grenze**: Dateiinhalt und Download sind nicht geprüft.

### REF-CAP — Vorher-Stand der Publish-Seiten erfassen (`tests/regression/references-capture.spec.ts`)
- **Zweck**: erfasst Navigation, Hreflang-Paare, Bilder, RSS-Feeds, Event-/Messelisten, Kurs- und Downloadsuche und (nur TEST) Suchtreffer als
  Referenz unter `fixtures/references/<AEM_ENV>/`.
- **Ausführen**: `CAPTURE_REFERENCES=1 npm run capture-references`. Ohne die Variable überspringt sich der Lauf.
- **Schutz**: Eine vorhandene Referenz wird nicht überschrieben (Fehlermeldung). Neu erzeugen nur bewusst mit
  `CAPTURE_REFERENCES=overwrite`, **nie nach dem Upgrade**: Die Dateien sind der Vorher-Stand.
- **Stand**: DEV am 23.11.2026 erfasst (216 und 204 Navigationslinks, 12 Seitenpaare, 6 Bildlisten), am 24.11.2026
  ergänzt um Feeds und Event-/Messelisten. TEST am 25.11.2026: alle Referenzen (die der globalen Suche nur dort), Kurs- und Downloadsuche auf beiden am 25.11.2026. Auf TEST wurden
  sie bei laufender Befüllung mit dem Produktionsinhalt erfasst, die Zahlen gleichen DEV (216/204 Navigationslinks,
  12 Seitenpaare, 25 Feed-Einträge, 10 Veranstaltungen, 2 Messen). Tag `vorher-stand-test-20261125`.
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

### UNIT-COCKPIT — Cockpit-Kernlogik (ohne AEM)
- **Zweck**: sichert die reine Logik hinter dem Test-Cockpit ab, ohne AEM/Login.
- **Dateien**: `tests/unit/cockpit-catalog.spec.ts`, `cockpit-runargs.spec.ts`,
  `cockpit-report.spec.ts`, `cockpit-history.spec.ts`, `cockpit-cleanup.spec.ts`,
  `cockpit-live-reporter.spec.ts`.
- **Fälle**:
  - **Katalog-Parser** (`parseCatalog`): flacht die verschachtelte
    `--list`-JSON-Struktur (Datei → describe → Test) korrekt ab; führt denselben
    Test über mehrere Projekte zu einem Eintrag zusammen. Englische Texte der
    Kategorien (`labelEn`, `descriptionEn`) und die Annotationen `_title-en` /
    `_describe-en` der Tests erscheinen additiv als `titleEn` und `labelEn`; ohne
    sie entstehen keine leeren Felder; bei mehreren describe-Titeln je Datei gibt
    es keinen englischen Suite-Namen.
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
    Testname; derselbe Fehler in `chromium` nicht. `detectBlockerInfo` liefert
    denselben Blocker als Code mit Parametern (`network` mit Host, `env`, `login`,
    `smoke` mit Testnamen), `blockerText` erzeugt daraus den unveränderten deutschen
    Text. `repeatIndex`/`repeatTotal` stehen neben dem deutschen `repeatLabel`, der
    englische Testname (`titleEn`) kommt aus der Annotation `_title-en`. `buildRun`: Nur Smoketests
    ziehen `setup` nach. Ein bestandener Login (`setup`) erscheint nicht in
    Tabelle und Summary, ein gescheiterter schon.
  - **Aufräum-Erkennung** (`cockpit-cleanup.spec.ts`: `isTestPageName`,
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
- **Erwartet**: alle Fälle grün; die Cockpit-Logik ist unabhängig von einer echten
  AEM-Umgebung abgesichert.

### UNIT-UI-LOGIK — Logik und Kontrast des neuen Cockpits (`tests/unit/cockpit-ui-logic.spec.ts`)
- **Zweck**: sichert die DOM-freie Logik der neuen Oberfläche (`cockpit/public/js/logic.js`)
  und die Lesbarkeit der Farbpalette (`cockpit/public/tokens.css`) ab. Kein AEM, kein Browser.
- **Fälle** (16):
  - **Theme** (`resolveTheme`): gespeicherte Wahl schlägt die Systemeinstellung, sonst gilt das System.
  - **Auswahl**: Testschlüssel trennt Geschwister mit gleicher Datei und Zeile; `env:`-Tag schränkt
    die Umgebung ein; Unit-only erzwingt Headless; Suche über Titel, Suite, Kategorie, Tags.
  - **Ergebnisse**: Statusart (instabil = bestanden mit Wiederholung, Timeout = Fehlschlag);
    Gruppierung mit Fehlschlägen zuerst und stabiler Reihenfolge; Kernaussage („2 von 6 Tests
    fehlgeschlagen", „Alle 4 Tests bestanden", abgebrochen, leer); Formate für Dauer und Größe.
  - **Historie**: Bereich statt Dateinamen (`runAreaLabel`, Dateinamen nur als Ersatz und Tooltip),
    Kernaussage wie in der Detailansicht (`runHeadline`), Lauf-Label (max. 3 Dateien), Einstellungs-Kurztext, Gruppierung nach Monat und
    Tag (aktueller Monat offen, „Heute"/„Gestern").
  - **Kontrast (WCAG AA)**: Textpaare der Tokens erreichen im hellen und im dunklen Theme 4,5:1
    (UI-Elemente wie der Fokusrahmen 3:1).
- **Erwartet**: alle Fälle grün.

### UNIT-UI-BROWSER — Bedienung des neuen Cockpits (`tests/unit/cockpit-ui.spec.ts`)
- **Zweck**: prüft die Oberfläche im Browser gegen einen lokalen Server, der `cockpit/public`
  ausliefert und `/api/*` mit festen Daten beantwortet. Kein AEM, kein Login, kein echter Lauf;
  gelöscht oder gestartet wird nichts.
- **Fälle** (19):
  - **Testlauf**: Start braucht mindestens einen Test und eine Umgebung; die Start-Leiste nennt,
    was fehlt. „Zurücksetzen" leert Auswahl und Suchfeld und klappt die Kategorien zu; der Button
    erscheint nur, wenn es etwas zurückzusetzen gibt.
  - **Umgebung**: Nach dem Start des Dienstes ist keine Umgebung vorgewählt. Ein Reload behält die
    Wahl, ein Neustart des Dienstes (neue Start-Kennung) nicht; nach der ersten Wahl gilt wieder
    „zuletzt verwendet". Ein Test mit `@env:test` wird beim Wechsel nach DEV aus der Auswahl
    entfernt und gemeldet. Aufgeklappte Kategorien bleiben beim Neuzeichnen offen.
  - **Assistent**: Ohne Test geht es nicht zu Schritt 2, ohne Umgebung nicht zu Schritt 3 (Knopf und
    Kopfzeile gesperrt, Hinweis sichtbar). Wird die Auswahl geleert, springt der Assistent auf
    Schritt 1. „Alle Schritte" sperrt nichts; dort bleibt nur die Start-Leiste gesperrt.
    Nach einem beendeten Lauf steht der Assistent beim Zurückkehren in den Testlauf wieder auf
    Schritt 1; Auswahl und Umgebung bleiben.
  - **Schrittmodus**: Standard ist „Assistent", die letzte Wahl bleibt nach Reload erhalten.
    Das grüne Häkchen eines Schritts erscheint erst, wenn er geöffnet wurde (Umgebung und Ausführung
    sind vorbelegt bzw. leer, das zählt nicht). Auch „Alle Schritte“ und zurück zum Assistenten
    hakt keinen Schritt ab (alle zugleich geöffnet ist keine Bestätigung).
  - **Nur Unit-Tests**: „Sichtbar" ist gesperrt, Headless aktiv.
  - **Shell**: Reiter per Hash-Routing, Reload und Home-Taste; Theme-Umschalter speichert die Wahl,
    ohne Wahl folgt die UI dem System.
  - **Ergebnisse**: Die Historie nennt Bereich und Kernaussage. Früherer Lauf zeigt Kernaussage, Fehlschlag zuerst, Filter wirkt;
    Löschen verlangt Bestätigung und sendet bei „Abbrechen" nichts.
  - **Werkzeuge**: UI-Mode ist ohne Umgebung gesperrt. Aufräum-Suche listet Testseiten; Löschen
    fragt erst nach.
- **Erwartet**: alle Fälle grün.

### UNIT-I18N — Zweisprachiges Cockpit, DE/EN-US (`tests/unit/cockpit-i18n.spec.ts`, ab 19.11.2026)
- **Zweck**: sichert die Zweisprachigkeit der neuen Oberfläche ab (Sprachwahl, Wörterbücher,
  Umschalten). Kein AEM, kein Login. Dateinamen, Fehlertexte und Playwright-Texte bleiben
  unübersetzt. Die Testnamen kommen als englische Annotation aus den Tests (siehe UNIT-TITLES-EN).
- **Fälle** (33, davon 13 im Browser gegen den lokalen Mock-Server):
  - **Sprachwahl** (`resolveLang`): Systemsprache `de*` → DE, sonst EN, die gespeicherte Wahl gewinnt.
  - **Kern**: Platzhalter, Fallback (DE, dann Schlüssel), Plural, Locale; Formatierer
    (Kernaussage, Einstellungen, Bereiche, „Heute"/„Gestern", Monat) auch auf Englisch;
    Suche findet Kategorien über den deutschen und den englischen Namen.
  - **Zahlen und Auswahl**: Dezimalzeichen folgt der Sprache (`1,5 s` / `1.5 s`, `2,0 KB` / `2.0 KB`);
    der vom Server gespeicherte Auswahl-Text („3 Test(s)“, „2 Datei(en)“, „alle“) und die
    Datei-Auswahl erscheinen in der aktiven Sprache.
  - **Wörterbücher**: `de.js` und `en.js` haben dieselben Schlüssel und Platzhalter, keine
    leeren Werte, zu jedem `.one` ein `.other`; kein englischer Text gleicht dem deutschen.
  - **Quelltext**: Jeder Schlüssel aus `index.html` und aus `t()`/`tn()` existiert; kein Eintrag
    bleibt ungenutzt; Tags, Reiter, Status, Blocker und alle Server-Codes (`err.*`) haben Texte;
    keine deutschen Zeichenketten mehr in den JS-Modulen.
  - **Startsprache** (Browser): `en-US` und `fr-FR` → EN, `de-AT` → DE.
  - **Umschalten** (Browser): Schalter links vom Theme-Schalter, Wahl bleibt nach Reload und gewinnt
    gegen die Systemsprache; nach einem Neustart des Dienstes (neue Start-Kennung) gilt wieder die
    Systemsprache, auch bei einer Wahl aus der Vorversion ohne Kennung; der Tab-Titel (Hover im Browsertab)
    folgt Reiter und Sprache (`Results · AEM Test Cockpit` / `Testlauf · AEM Test-Cockpit`), auch nach Reload;
    Theme-Schalter, Beenden-Dialog; Testlauf behält Auswahl, offene
    Kategorie und Umgebung; Ergebnisse (Kernaussage, Blocker per Code, Durchlauf, Datum) und
    Historie (Auswahl bleibt); Werkzeuge (Aufräum-Ergebnis, Hinweis per Code, Auswahl bleibt);
    in EN steht kein deutscher Anzeigetext mehr in allen Reitern, Schritten und Dialogen;
    Testnamen erscheinen in EN englisch (ohne `lang`-Attribut), ohne englischen Namen, Fehlertexte
    und Dateinamen deutsch mit `lang="de"`; die Suche findet Original und Übersetzung, das
    deutsche Original bleibt Schlüssel für Auswahl und `--grep`.
- **Dazu erweitert**: `cockpit-report.spec.ts` (+4: `detectBlockerInfo`, `blockerText`,
  `repeatIndex`/`repeatTotal`), `cockpit-catalog.spec.ts` (+1: `labelEn`/`descriptionEn` additiv).
  `cockpit-ui.spec.ts` nagelt die Sprache auf `de-DE` fest.
- **Erwartet**: alle Fälle grün.

### UNIT-PORTGUARD — Port-Prüfung beim Start des Cockpits (`tests/unit/cockpit-portguard.spec.ts`, ab 23.11.2026)
- **Zweck**: Ein belegter Port blockiert den Start. Ist es eine hängende eigene Instanz, wird sie freigeräumt,
  ein fremder Prozess nie. Kein AEM; die Start-Fälle starten das echte Cockpit auf einem freien Port und halten
  es mit `SIGSTOP` an (Port belegt, Dienst antwortet nicht). Alle Prozesse werden am Ende beendet.
- **Fälle** (12):
  - **Bausteine** (7): PIDs aus `lsof` lesen; nur das Cockpit dieses Projekts gilt als eigen (absoluter Pfad, relativ nur mit
    Suite-Root als Arbeitsverzeichnis; fremde, ähnlich benannte und andere Projekte nicht); Kommandozeile kürzen; Warntext
    (mit und ohne alte pf-Weiterleitung, nennt Ausweich-Port und Befehle); Beenden mit SIGTERM, mit SIGKILL-Rückfall bei einem
    Prozess, der SIGTERM ignoriert, und bei einem angehaltenen Prozess; lauschenden Prozess samt Befehl und Arbeitsverzeichnis finden.
  - **Start** (5): freier Port startet normal ohne Warnung; hängende eigene Instanz wird mit `COCKPIT_FORCE=1` beendet und
    die neue übernimmt den Port; ohne Terminal und ohne `COCKPIT_FORCE` wird nichts beendet (Meldung nennt die Option);
    ein fremder Prozess bleibt auch mit `COCKPIT_FORCE=1` unangetastet (Meldung nennt PID und `COCKPIT_PORT`); eine antwortende
    eigene Instanz wird wie bisher ersetzt.
- **Erwartet**: alle Fälle grün.

### UNIT-TITLES-EN — Englische Testnamen (`tests/unit/titles-en.spec.ts`, ab 19.11.2026)
- **Zweck**: Jeder Test hat einen englischen Anzeigenamen und jede Suite einen englischen Suite-Namen
  für das Cockpit (Sprache EN). Der Titel im Test bleibt deutsch (Quelle für `--grep`, Baselines,
  Berichte). Der englische Name steht als Annotation `_title-en` bzw. `_describe-en` am Test
  (`fixtures/titles.ts`); der Unterstrich blendet sie im Playwright-HTML-Report aus.
- **Fälle** (2): Die echte Testliste (`playwright test --list`) enthält zu jedem der 101 AEM-Tests
  (inkl. Login) `_title-en` und zu jeder Suite `_describe-en`, nichts ist leer oder unübersetzt.
  Der Katalog liefert zu jedem sichtbaren Test und jeder Datei den englischen Namen.
- **Dazu erweitert**: `cockpit-catalog.spec.ts` (+1: liest `_title-en`/`_describe-en`, bei mehreren
  describe-Titeln kein englischer Suite-Name), `cockpit-report.spec.ts` (+1: `titleEn` der Ergebniszeile).
- **Neuer Test**: `test('Deutscher Titel', titleEn('English title'), async …)`, neue Suite:
  `test.describe('Deutscher Titel', { tag: '@level1', annotation: describeEn('English title') }, …)`.
  Fehlt der englische Name, schlägt dieser Test fehl.
- **Erwartet**: alle Fälle grün.

---

## Pflege

Bei neuen oder geänderten Tests diese Übersicht mitführen (siehe
`.kiro/steering/arbeitsweise.md`).
