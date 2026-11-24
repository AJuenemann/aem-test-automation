# DEV: Samples-Tags nachgetragen und Samples veröffentlicht (24.11.2026, Freigabe Andreas Jünemann)

## Anlass

Auf DEV wurde der Produktionsinhalt eingespielt, die Samples kamen wieder in den Author. Auf DEV-Publish fehlten sie
(HTTP 404), dadurch waren 13 Tests rot (COMP-VIS-1..11, OVL-5, TAG-1) und SMOKE-12. Auf DEV-Author hatten nur 2 von 51
Beispielseiten unter `search-data`/`filterpage` Tags, die Filterseite hätte nach dem Veröffentlichen kaum Treffer
gezeigt. Vorgehen wie auf TEST am 17.11.2026 (`docs/TEST-tags-wiederhergestellt-20261117.md`), dessen Tabelle die Quelle
der Tag-Werte ist (der damalige DEV-Publish-Stand existiert nicht mehr).

Freigabe: Andreas Jünemann (Testmanagement), 24.11.2026. Begründung: Für TEST lag die Freigabe von JET vor, DEV ist die
weniger kritische Umgebung.

## 1. Tags auf DEV-Author

Nur das Feld `cq:tags` der 51 Seiten gesetzt (Sling POST auf `…/jcr:content`, `String[]`). Vorhandene Tags bleiben
erhalten (Vereinigung). Vorher geprüft: alle Seiten vorhanden, alle Tag-Definitionen unter `/etc/tags` vorhanden.
Danach nachgelesen: 51 von 51 Seiten haben genau die erwarteten Tags.

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

## 2. Veröffentlicht

Agent `publish_aem-publish1-dev` (einziger aktiver Publish-Agent auf DEV, kein Dispatcher-Flush), vorher frei.
„Tree aktivieren" (`/libs/replication/treeactivation.html`): „Nur geänderte" aus, „Deaktivierte ignorieren" an,
erst Probelauf, dann Aktivieren. Zahlen von Probelauf und Aktivieren identisch.

| Pfad | Ergebnis |
|---|---|
| `/etc/tags/Samples` | 4 von 4 Ressourcen |
| `/etc/tags/categories/samples` | 5 von 5 Ressourcen |
| `/content/dam/samples` | 67 von 67 Ressourcen |
| `/content/businesscards/samples` | 39 von 39 Ressourcen |
| `/content/samples/de` | 300 von 311 Ressourcen (11 deaktivierte ignoriert, wie auf TEST) |
| `/content/samples/en` | 311 von 311 Ressourcen |
| `/content/samples` und Startseiten `fr`, `bg`, `ja`, `zh` | einzeln aktiviert (`/bin/replicate.json`, je HTTP 200) |

## 3. Nachweis

- Warteschlange des Agents danach leer, nicht blockiert.
- DEV-Publish: `/content/samples/de.html`, `/content/samples/en.html`, `…/section/table.html` HTTP 200; Filterseite
  `…/filterpage/filterpage_v2.html` mit 7 Treffern (wie TEST); nicht vorhandene Samples-Seite HTTP 404 (Fehlerseite).
- Tests auf DEV: Smoketest 13/13 grün (inkl. SMOKE-12), COMP-VIS-1..11, OVL-5, TAG-1 grün.
- Baseline „Newsroom" (DEV) neu erzeugt: Der Newsroom sortiert nach Veröffentlichungsdatum, durch das Veröffentlichen
  tauschten zwei Pressemitteilungen den Platz (Layout unverändert, Bildvergleich geprüft). Vor dem Upgrade zulässig.
  Danach zweimal grün.
- Gesamtlauf DEV danach: 210 grün (66 AEM-Tests, 144 Unit-Tests), 16 übersprungen (Capture-Läufe, LDAP nur TEST),
  0 rot.

## Rückgängig machen

Veröffentlichung: „Tree aktivieren" mit Deaktivieren bzw. „Veröffentlichung verwalten" → zurücknehmen für dieselben
Pfade. Tags: Werte der Spalte „vorher" wieder setzen.
