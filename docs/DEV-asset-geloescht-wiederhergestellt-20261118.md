# DEV: Fremdes Asset durch Testlauf gelöscht und wiederhergestellt (18.11.2026)

## Vorfall

- Umgebung: DEV-Author (`https://aem-author-dev.ws.fraunhofer.de`)
- Gelöscht: `/content/dam/fhgtest/pamilacan hutte.jpg`
- Zeitpunkt: 18.11.2026, 11:33:03 (Audit-Log `/var/audit/com.day.cq.dam`,
  Typ `ASSET_REMOVED`, Benutzer `admin`)
- Auslöser: Aufräumschritt des neuen Asset-Upload-Tests während der Entwicklung.
  Der Test fuhr mit der Maus auf die eigene Karte und klickte die Schnellaktion
  „Auswählen". In der Kachelansicht (Masonry) traf das eine fremde Karte, danach
  wurde „Löschen" bestätigt.
- Ein zweiter Lauf wählte so den fremden Ordner `2011-2015` aus. Er wurde nicht
  gelöscht (Abbruch beim Dialog „Löschen erzwingen"), Existenz geprüft.
- Laut Audit-Log wurden an diesem Tag sonst nur eigene Testdateien
  (`level1-asset-…`) gelöscht.

## Wiederherstellung (Freigabe User, Variante „Datei von TEST")

1. Original-Rendition vom TEST-Author geladen:
   `/content/dam/fhgtest/pamilacan hutte.jpg/jcr:content/renditions/original`
   (936.526 Byte, 2016 x 1512, SHA-1 `ed1906efcc3a4360a6be4f06b6e2c17f7bb64cfb`).
2. Unter demselben Namen nach `/content/dam/fhgtest` auf DEV hochgeladen
   (`createasset`).
3. Geprüft: `dam:assetState` = `processed`, SHA-1, Größe und Maße wie TEST,
   Renditions erzeugt (Thumbnails und Web-Renditions).

Nicht wiederhergestellt: Titel, eigene Metadaten, Versionen und Verweise des
alten DEV-Stands. Ob die TEST-Fassung mit dem alten DEV-Stand identisch war, ist
nicht belegbar. Auf DEV-Publish war das Asset vorher nicht erreichbar (404), es
wurde nicht veröffentlicht.

## Gegenmaßnahmen im Code

- `pageobjects/AssetsConsolePage.ts`: Vor dem Löschen muss genau das eigene
  Asset ausgewählt sein, sonst Abbruch ohne Löschen.
- Der Asset-Test arbeitet in einem eigenen Testordner nach Testschema unter
  `/content/dam/fhgtest`. Fremde Karten liegen nicht in derselben Ansicht.
- `pageobjects/SitesConsolePage.ts`: Dieselbe Auswahlprüfung vor dem Löschen von
  Seiten (wichtig, weil „Löschen erzwingen" Unterseiten mitlöscht).
