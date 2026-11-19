import { test, expect } from '../../fixtures/test-fixtures.js';
import { titleEn, describeEn } from '../../fixtures/titles.js';
import { getAemConfig } from '../../config/env.js';

/**
 * Overlay-Regression (JET-Antwort zu 7., Punkt 3): die Fileupload-Komponente im
 * Authoring-Dialog der Download-Komponente. Konkret genannte Seite:
 *   /content/samples/de/components/section/download-component.html
 *
 * Geprueft werden BEIDE Faelle (abgestimmt):
 *  - Asset per Drag & Drop SETZEN, wenn kein Asset vorhanden ist,
 *  - vorhandenes Asset per Drag & Drop ERSETZEN.
 *
 * Redakteursweg (gegen DEV per Diag verifiziert): Karte aus dem Asset-Finder
 * (Seitenbedienfeld) in das coral-fileupload-Feld ziehen. Nachweis ueber das
 * versteckte Feld ./fileReference. Dialog wird ohne Speichern geschlossen.
 */

// Relativ zu AEM_SAMPLES_ROOT. Die Download-Komponente liegt unter section/.
const DOWNLOAD_PAGE = '/section/download-component';
// Overlay-Titel ist deutsch "Herunterladen" (per Diag gegen DEV verifiziert).
const DOWNLOAD_COMPONENT = process.env.AEM_DOWNLOAD_COMPONENT?.trim() || 'Herunterladen';

test.describe('Regression: Download-Dialog Fileupload (Drag & Drop)', { tag: '@regression', annotation: describeEn('Regression: download dialog file upload (drag & drop)') }, () => {
  test('Asset setzen (leer) und ersetzen (vorhanden)', titleEn('Set an asset (empty) and replace it (present)'), async ({ samplesComponent, overlayChecks }) => {
    test.setTimeout(120_000);
    const pagePath = `${getAemConfig().samplesRoot}${DOWNLOAD_PAGE}`;

    await samplesComponent.open(pagePath);
    // Vor dem Dialog: bei offenem Dialog blockiert der modale Hintergrund den Schalter.
    await overlayChecks.openSidePanel();
    await samplesComponent.openConfigDialog(DOWNLOAD_COMPONENT);

    // Ausgangszustand herstellen: leeres Feld fuer den "setzen"-Fall.
    if ((await overlayChecks.fileReference()) !== '') {
      await overlayChecks.clearAssetField();
    }
    expect(await overlayChecks.fileReference(), 'Feld sollte vor dem Setzen leer sein.').toBe('');

    // Fall 1: Asset setzen.
    const first = await overlayChecks.dragAssetIntoField(0);
    expect(first, 'Asset-Finder lieferte keinen DAM-Pfad.').not.toBe('');

    // Fall 2: vorhandenes Asset durch ein anderes ersetzen.
    const second = await overlayChecks.dragAssetIntoField(1);
    expect(second, 'Ersetzen nicht nachweisbar: gleiches Asset gezogen.').not.toBe(first);
    expect(await overlayChecks.fileReference()).toBe(second);

    // Dialog ohne Speichern schliessen - Samples-Seite bleibt unveraendert.
    await samplesComponent.closeDialog();
  });
});
