import { test, expect } from '../../fixtures/test-fixtures.js';
import { titleEn, describeEn } from '../../fixtures/titles.js';
import { SAMPLE_COMPONENTS, samplePagePath } from '../../fixtures/samples-components.js';

/**
 * Overlay-Regression (JET-Antwort zu 7., Punkte 1+2): die Fraunhofer-eigenen
 * Asset-Finder-Suchen "Visitenkarten" und "Externe Links".
 *
 * Redakteursweg: Seitenbedienfeld öffnen -> Reiter "Assets" -> in der
 * Typauswahl den Fraunhofer-Eintrag wählen. Erwartet: Treffer erscheinen und
 * stammen aus der zugehörigen Bibliothek (sonst liefert der Overlay die
 * falschen Inhalte oder ist kaputt). Lesend auf einer Samples-Seite.
 * Gegen DEV verifiziert (16.11.2026).
 */
const SEARCHES = [
  { label: 'Visitenkarten', root: '/content/businesscards/' },
  { label: 'Externe Links', root: '/content/externallinklib/' },
];

test.describe('Regression: Asset-Finder-Overlays', { tag: '@regression', annotation: describeEn('Regression: asset finder overlays') }, () => {
  for (const { label, root } of SEARCHES) {
    test(`Asset-Finder-Suche "${label}" liefert Treffer`, titleEn(`Asset finder search "${label}" returns results`), async ({ samplesComponent, overlayChecks }) => {
      test.setTimeout(90_000);
      await samplesComponent.open(samplePagePath(SAMPLE_COMPONENTS[0]));
      const paths = await overlayChecks.assetFinderSearch(label);
      expect(paths.length, `Asset-Finder-Suche "${label}" lieferte keine Treffer.`).toBeGreaterThan(0);
      const foreign = paths.filter((p) => !p.startsWith(root));
      expect(foreign, `Treffer außerhalb von ${root}:\n${foreign.slice(0, 5).join('\n')}`).toEqual([]);
    });
  }
});
