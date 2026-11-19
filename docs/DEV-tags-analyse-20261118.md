# Analyse: Leere Tags auf dem DEV-Author (18.11.2026)

Ergänzt `docs/TEST-tags-wiederhergestellt-20261117.md`. Alle Prüfungen waren
rein lesend (JSON-Abfragen, QueryBuilder, Package Manager). Auf DEV wurde nichts
verändert.

## Befund

Die Filterseite der Samples (`/content/samples/de/components/filterpage/filterpage_v2`)
zeigt Seiten mit bestimmten Tags (`cq:tags`). Laut JET fragt sie `Samples:tag1`
und `Samples:tag2` unter `/content/samples/de/search-data` ab.

Stand unter `/content/samples/de/search-data` (50 Seiten):

| Umgebung | Seiten mit Tags | Filterseite |
| --- | --- | --- |
| DEV-Author | 2, nur `emft:`-Tags, keine `Samples:`-Tags | – |
| DEV-Publish | 14, davon 12 mit `Samples:`-Tags | 7 Treffer |
| TEST-Author | 14 (am 17.11.2026 wiederhergestellt) | – |
| TEST-Publish | 14 | 7 Treffer |

Beispiel `…/search-data/presse/presse-2014-03-14`:

| Eigenschaft | DEV-Author | DEV-Publish |
| --- | --- | --- |
| `cq:tags` | `[]` (ausdrücklich leer, nicht fehlend) | `Samples:tag1`, `Samples:tag3` |
| `cq:lastModified` | 10.03.2021, admin | 10.03.2021, admin |
| `cq:lastReplicated` | 07.05.2020 | 07.05.2020 |

Author und Publish unterscheiden sich nur in `cq:tags`. Ein normales Speichern
über die Oberfläche hätte `cq:lastModified` aktualisiert.

Zwei Ebenen sind zu unterscheiden:

1. **Tag-Definitionen** (`/etc/tags/Samples`, `/etc/tags/categories/samples`):
   auf DEV-Author, DEV-Publish, TEST-Author und TEST-Publish vorhanden. Kein
   Problem.
2. **Tags an den Seiten** (`cq:tags`): auf dem DEV-Author leer. Das ist der
   eigentliche Befund.

## Herkunft der Samples: Inhaltspaket, kein Veröffentlichen

Paket `my_packages/Sicherung_Samples`. Filter: `/content/samples`,
`/content/dam/samples`, `/content/businesscards/samples`,
`/content/externallinklib/samples`, `/etc/tags/Samples`,
`/etc/tags/categories/samples`.

| Zeitpunkt | Umgebung | Vorgang | Beleg |
| --- | --- | --- | --- |
| 28.03.2025, 10:14 | unbekannte Quelle | Paket gebaut | Package Manager DEV-Publish („erstellt") |
| 16.06.2026, 16:49–16:56 | DEV-Author | Paket installiert; Seiten entstehen 16:49–16:56, Tag-Definitionen erst 16:56:15 | `jcr:created` von `/content/samples`, der Seiten und `/etc/tags/Samples`; `lastUnpacked` 16:56:17 |
| 17.06.2026, 09:54–09:58 | DEV-Publish | Paket (Stand 28.03.2025) installiert, gleiche Reihenfolge | `jcr:created`; `lastUnpacked` 09:58:55 |
| 16.11.2026, 16:06 | DEV-Author | Paket neu gebaut (mit leerem DEV-Author-Stand) | `lastWrapped` 16.11.2026 16:06:18 |
| 16.11.2026, 16:26 | TEST-Author | neu gebautes Paket installiert (Kopie durch JET) | Package Manager TEST-Author, `jcr:created` der Tags 16:26:23 |

Daraus folgt:

- `cq:lastModified` 2021 und `cq:lastReplicated` 2020 stammen aus dem
  Quellsystem und kamen per Paket mit. Auf DEV wurden die Samples nicht
  veröffentlicht, Author und Publish wurden getrennt per Paket befüllt.
- TEST hat die leeren Tags vom DEV-Author geerbt, weil das Paket am 16.11.2026
  aus dem DEV-Author neu gebaut wurde.
- Die Seiten haben auf dem DEV-Author keine gespeicherten Versionen, das
  Audit-Log enthält keine Einträge zu ihnen.

## Offen: Warum fehlen die Tags im DEV-Author?

Der Paketstand, der am 16.06.2026 auf dem DEV-Author installiert wurde, ist nicht
mehr nachprüfbar. Das Paket wurde am 16.11.2026 neu gebaut und damit
überschrieben. Zwei Erklärungen sind möglich:

1. Auf den Author kam eine andere Fassung des Pakets, die schon keine Tags
   enthielt.
2. Es war dieselbe Fassung wie auf Publish, und ein Vorgang nur auf dem Author
   hat `cq:tags` beim Import geleert, z.B. ein Workflow-Launcher oder Listener,
   der Tag-Verweise prüft. Beim Import entstanden die Seiten vor den
   Tag-Definitionen. Das unveränderte `cq:lastModified` passt dazu. Auf Publish
   laufen solche Vorgänge normalerweise nicht.

Erklärung 2 entspricht JETs Vermutung („Tags waren noch nicht vorhanden, deshalb
entfernt"), allerdings beim Paket-Import auf dem Author, nicht beim
Veröffentlichen. Beide Erklärungen sind nicht belegt.

## Einschätzungen von JET (wörtlich, zur Einordnung)

- „Auf dem Pubsliher in der Testumgebung ist das cq:tags Property leer. Warum
  auch immer" — zutreffend für den Stand vor dem 17.11.2026. Ursache lag schon im
  TEST-Author (siehe oben).
- „entweder wurden die Tags vor dem Publishen selbst entfernt oder weil die Tags
  nicht vorher gepublished waren hat er diese beim Publishen entfernt" — beim
  Veröffentlichen ging nichts verloren: Auf TEST war das Feld schon vorher leer,
  auf DEV wurde nicht veröffentlicht.
- „Es gibt auf jeden Fall eine Inkonsistenz bei den Tags. Auch zwischen Author
  und Publish." — bestätigt.
- „ich vermute das liegt daran, dass die Seiten auf dem DEV Server auch ewig
  nicht gepublished wurden" — zutreffend in dem Sinn, dass Author und Publish nie
  abgeglichen wurden. Befüllt wurden beide per Paket.

## Fragen an JET

1. Welche Fassung von `Sicherung_Samples` wurde am 16.06.2026 auf dem DEV-Author
   installiert? Dieselbe wie am 17.06.2026 auf DEV-Publish (gebaut 28.03.2025)?
2. Gibt es auf dem Author einen Workflow-Launcher oder Listener, der `cq:tags`
   bereinigt, wenn ein Tag nicht existiert?
3. Wer hat das Paket am 16.11.2026 auf dem DEV-Author neu gebaut? War bekannt,
   dass dabei der leere Stand nach TEST ging?
4. Falls Erklärung 2 zutrifft: Kann das auch bei der Migration passieren, wenn
   Inhalte vor ihren Tags importiert werden? Das wäre über die Samples hinaus
   relevant.

## Folgen für die Tests

- TAG-1 („Filterseite liefert getaggte Treffer") ist auf DEV heute grün, weil
  DEV-Publish den Paketstand mit Tags hat. Werden die Samples auf DEV aus dem
  Author veröffentlicht, wird TAG-1 dort rot. Das ist gewollt.
- Auf TEST sind Author und Publish seit dem 17.11.2026 abgeglichen.
