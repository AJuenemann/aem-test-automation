# TEST: Samples-Tags nachgetragen und Samples veröffentlicht (27.11.2026, Freigabe Andreas Jünemann)
## Anlass
Die Veröffentlichung auf TEST lief wieder (Publisher-Adresse korrigiert, Warteschlangen leer, 27.11.2026 10:30).
Die Samples standen wieder im Author, auf TEST-Publish fehlten sie (HTTP 404, SMOKE-12 rot). Mit dem Produktionsinhalt
waren auch die Tags der 51 Beispielseiten wieder verloren (0 von 51 vollständig), wie auf DEV am 24.11.2026. Ohne Tags
zeigt die Filterseite keine Treffer. Vorgehen wie auf DEV (`docs/DEV-samples-veroeffentlicht-20261124.md`), Quelle der
Tag-Werte ist dieselbe Tabelle. Ziel: Vorher-Stand der Samples-Seiten auf TEST vor dessen Upgrade (AEM 6.5.25.0).
Freigabe: Andreas Jünemann (Testmanagement), 27.11.2026, für Tags und Veröffentlichung.
## 1. Tags auf TEST-Author (11:05)
Nur das Feld `cq:tags` der 51 Seiten gesetzt (Sling POST auf `…/jcr:content`, `String[]`). Vorhandene Tags bleiben
erhalten (Vereinigung). Vorher geprüft: alle Seiten und alle Tag-Definitionen unter `/etc/tags` vorhanden. Danach
nachgelesen: 51 von 51 Seiten haben die erwarteten Tags.
| Seite (unter `/content/samples/`) | vorher | jetzt |
|---|---|---|
| `de/components/filterpage/presse/presse-2012-01-02` | – | Samples:tag2 |
| `de/components/filterpage/presse/presse-2013-05-14` | – | Samples:tag2 |
| `de/components/filterpage/presse/presse-2014-03-14` | – | Samples:tag1, Samples:tag3 |
| `de/components/filterpage/presse/presse-2014-04-10` | – | Samples:tag1 |
| `de/components/filterpage/presse/sample-press` | – | categories:samples/category_1, Samples:tag1 |
| `de/components/filterpage/veranstaltungen_messen/veranstaltungen/05-02-13_veranstaltung` | – | Samples:tag1, Samples:tag2, Samples:tag3, categories:samples/category_1, categories:samples/category_2, categories:samples/category_3 |
| `de/components/filterpage/veranstaltungen_messen/veranstaltungen/12-03-13_veranstaltung` | – | Samples:tag1 |
| `de/components/filterpage/veranstaltungen_messen/veranstaltungen/13-11-13_veranstaltung` | – | Samples:tag1 |
| `de/components/filterpage/veranstaltungen_messen/veranstaltungen/15-09-14_veranstaltung` | – | Samples:tag2, Samples:tag1 |
| `de/components/filterpage/veranstaltungen_messen/veranstaltungen/21-05-14_veranstaltung` | – | Samples:tag2, Samples:tag3 |
| `de/components/filterpage/veranstaltungen_messen/veranstaltungen/22-07-14_veranstaltung` | – | Samples:tag1, Samples:tag3 |
| `de/components/filterpage/veranstaltungen_messen/veranstaltungen/30-09-14_veranstaltung` | – | Samples:tag2 |
| `de/components/filterpage/veranstaltungen_messen/veranstaltungen` | emft:Veranstaltung, emft:Schulung, emft:Forum, emft:Seminar | emft:Veranstaltung, emft:Schulung, emft:Forum, emft:Seminar, Samples:tag1, Samples:tag2, Samples:tag3 |
| `de/search-data/presse/presse-2013-05-14` | – | Samples:tag2 |
| `de/search-data/presse/presse-2014-03-14` | – | Samples:tag1, Samples:tag3 |
| `de/search-data/presse/presse-2014-04-10` | – | Samples:tag1 |
| `de/search-data/presse/tv-filme/Fraunhofer-EMFT_Jahresveranstaltung/presse-2014-03-14` | – | Samples:tag1, Samples:tag3 |
| `de/search-data/presse/tv-filme/Fraunhofer-EMFT_Jahresveranstaltung/presse-2014-04-10` | – | Samples:tag1 |
| `de/search-data/veranstaltungen_messen/veranstaltungen/05-02-13_veranstaltung` | – | Samples:tag1, Samples:tag2, Samples:tag3 |
| `de/search-data/veranstaltungen_messen/veranstaltungen/12-03-13_veranstaltung` | – | Samples:tag1, categories:samples/category_1 |
| `de/search-data/veranstaltungen_messen/veranstaltungen/13-11-13_veranstaltung` | – | Samples:tag1 |
| `de/search-data/veranstaltungen_messen/veranstaltungen/15-09-14_veranstaltung` | – | Samples:tag2, Samples:tag1 |
| `de/search-data/veranstaltungen_messen/veranstaltungen/21-05-14_veranstaltung` | – | Samples:tag2, Samples:tag3 |
| `de/search-data/veranstaltungen_messen/veranstaltungen/22-07-14_veranstaltung` | – | Samples:tag1, Samples:tag3 |
| `de/search-data/veranstaltungen_messen/veranstaltungen/30-09-14_veranstaltung` | – | Samples:tag2 |
| `de/search-data/veranstaltungen_messen/veranstaltungen` | emft:Veranstaltung, emft:Schulung, emft:Forum, emft:Seminar | emft:Veranstaltung, emft:Schulung, emft:Forum, emft:Seminar, Samples:tag1, Samples:tag2, Samples:tag3 |
| `en/components/filterpage/presse/presse-2013-05-14` | – | Samples:tag2 |
| `en/components/filterpage/presse/presse-2014-03-14` | – | Samples:tag1, Samples:tag3 |
| `en/components/filterpage/presse/presse-2014-04-10` | – | Samples:tag1 |
| `en/components/filterpage/presse/sample-press` | – | categories:samples/category_1, Samples:tag1 |
| `en/components/filterpage/veranstaltungen_messen/veranstaltungen/05-02-13_veranstaltung` | – | Samples:tag1, Samples:tag2, Samples:tag3, categories:samples/category_1, categories:samples/category_2, categories:samples/category_3 |
| `en/components/filterpage/veranstaltungen_messen/veranstaltungen/12-03-13_veranstaltung` | – | Samples:tag1 |
| `en/components/filterpage/veranstaltungen_messen/veranstaltungen/13-11-13_veranstaltung` | – | Samples:tag1 |
| `en/components/filterpage/veranstaltungen_messen/veranstaltungen/15-09-14_veranstaltung` | – | Samples:tag2, Samples:tag1 |
| `en/components/filterpage/veranstaltungen_messen/veranstaltungen/21-05-14_veranstaltung` | – | Samples:tag2, Samples:tag3 |
| `en/components/filterpage/veranstaltungen_messen/veranstaltungen/22-07-14_veranstaltung` | – | Samples:tag1, Samples:tag3 |
| `en/components/filterpage/veranstaltungen_messen/veranstaltungen/30-09-14_veranstaltung` | – | Samples:tag2 |
| `en/components/filterpage/veranstaltungen_messen/veranstaltungen` | – | Samples:tag3, Samples:tag2, Samples:tag1 |
| `en/search-data/presse/presse-2013-05-14` | – | Samples:tag2 |
| `en/search-data/presse/presse-2014-03-14` | – | Samples:tag1, Samples:tag3 |
| `en/search-data/presse/presse-2014-04-10` | – | Samples:tag1 |
| `en/search-data/presse/tv-filme/Fraunhofer-EMFT_Jahresveranstaltung/presse-2014-03-14` | – | Samples:tag1, Samples:tag3 |
| `en/search-data/presse/tv-filme/Fraunhofer-EMFT_Jahresveranstaltung/presse-2014-04-10` | – | Samples:tag1 |
| `en/search-data/veranstaltungen_messen/veranstaltungen/05-02-13_veranstaltung` | – | Samples:tag1, Samples:tag2, Samples:tag3 |
| `en/search-data/veranstaltungen_messen/veranstaltungen/12-03-13_veranstaltung` | – | Samples:tag1, categories:samples/category_1 |
| `en/search-data/veranstaltungen_messen/veranstaltungen/13-11-13_veranstaltung` | – | Samples:tag1 |
| `en/search-data/veranstaltungen_messen/veranstaltungen/15-09-14_veranstaltung` | – | Samples:tag2, Samples:tag1 |
| `en/search-data/veranstaltungen_messen/veranstaltungen/21-05-14_veranstaltung` | – | Samples:tag2, Samples:tag3 |
| `en/search-data/veranstaltungen_messen/veranstaltungen/22-07-14_veranstaltung` | – | Samples:tag1, Samples:tag3 |
| `en/search-data/veranstaltungen_messen/veranstaltungen/30-09-14_veranstaltung` | – | Samples:tag2 |
| `en/search-data/veranstaltungen_messen/veranstaltungen` | – | Samples:tag3, Samples:tag2, Samples:tag1 |
## 2. Veröffentlicht (11:06–11:08)
Agents `publish_aem-publish1-test` und `flush_aem-publish1-dispatcher-test`, vorher frei und leer.
„Tree aktivieren" (`/libs/replication/treeactivation.html`): „Nur geänderte" aus, „Deaktivierte ignorieren" an,
erst Probelauf, dann Aktivieren. Zahlen von Probelauf und Aktivieren identisch, und identisch mit DEV am 24.11.2026.
| Pfad | Ergebnis |
|---|---|
| `/etc/tags/Samples` | 4 von 4 Ressourcen |
| `/etc/tags/categories/samples` | 5 von 5 Ressourcen |
| `/content/dam/samples` | 67 von 67 Ressourcen |
| `/content/businesscards/samples` | 39 von 39 Ressourcen |
| `/content/samples/de` | 300 von 311 Ressourcen (11 deaktivierte ignoriert) |
| `/content/samples/en` | 311 von 311 Ressourcen |
| `/content/samples` und Startseiten `fr`, `bg`, `ja`, `zh` | einzeln aktiviert (`/bin/replicate.json`, je HTTP 200) |
## 3. Nachweis
- Warteschlangen beider Agents danach leer, nicht blockiert.
- TEST-Publish: `/content/samples/de.html`, `/content/samples/en.html`, `…/section/table.html` HTTP 200; Filterseite
  `…/filterpage/filterpage_v2.html` mit 7 Treffern (wie DEV); nicht vorhandene Samples-Seite HTTP 404 (Fehlerseite).
- Tests auf TEST (ohne Schreiben von Baselines, `--update-snapshots=none`): Smoketest 13/13 grün (inkl. SMOKE-12),
  VIS-1, OVL-5 und TAG-1 grün, von den 11 vorhandenen Komponenten-Baselines 10 grün.
- Abweichung nur „Newsroom": gleiches Layout, andere Reihenfolge der Pressemitteilungen (Sortierung nach
  Veröffentlichungsdatum, durch das Veröffentlichen geändert; wie auf DEV am 24.11.2026). Baseline mit Freigabe neu
  erzeugt (nur diese, 11:41), danach dreimal grün.
- 14 fehlende Baselines der weiteren Komponenten neu angelegt (`--update-snapshots=missing`, nichts überschrieben):
  bcoverview, contactbox, download, faq, imagerow, lightbox, newsbox, parallelnav, projectproducts, reference,
  slidersmall, socialwall, tabs, teaserexternal. Höhe jeweils gleich wie auf DEV, danach zweimal grün.
- Publish-Referenzen und REAL-1..9 auf TEST waren vor der Veröffentlichung (10:35) grün, Tag `vorher-stand-test-20261126`.
- Gesamtlauf TEST 11:42–12:05 (CLI, Smoketest-Gate an, ohne Schreiben von Baselines): 260 grün, 36 übersprungen
  (Capture-Läufe, Referenz-Erfassungen), 1 instabil (OVL-6, bekannter Befund), 3 rot (NAV-1, LANG-4, FEED-1) mit
  `EADDRNOTAVAIL` und Timeouts am Testrechner (Netzwerk, kein Inhalt). Diese Datei einzeln wiederholt: 10 von 10 grün.
- Tag `vorher-stand-test-20261127` (maßgeblich für TEST).
## Rückgängig machen
Veröffentlichung: „Tree aktivieren" mit Deaktivieren bzw. „Veröffentlichung verwalten" → zurücknehmen für dieselben
Pfade. Tags: Werte der Spalte „vorher" wieder setzen.
