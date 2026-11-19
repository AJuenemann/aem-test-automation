import path from 'node:path';
import { test, expect } from '../../fixtures/test-fixtures.js';
import { SAMPLE_COMPONENTS, samplePagePath } from '../../fixtures/samples-components.js';

/**
 * Visuelle Regression der gerenderten Komponenten-Beispielseiten auf der
 * PUBLISH-Instanz (JET-Antwort: visuelle Regression nur für Publish relevant).
 *
 * Zweck: Vorher-/Nachher-Vergleich über die Migration. Die Baselines werden
 * JETZT (vor der Migration) als Vorher-Stand erzeugt:
 *   AEM_ENV=<umgebung> AEM_PUBLISH_URL=<publish> npm run update-snapshots -- tests/components/visual-publish.spec.ts
 * Baselines sind pro AEM_ENV getrennt (snapshotPathTemplate).
 *
 * Ist keine Publish-URL verfügbar, überspringt sich der Test sauber (kein
 * Funktionsfehler). Siehe config/env.ts (resolvePublishConfig).
 *
 * Datengetrieben über die priorisierte Komponentenliste. Task 3 pilotierte dies
 * mit Section; Task 8 rollt es über alle priorisierten Komponenten aus (bereits
 * hier abgedeckt, da die Liste iteriert wird).
 */
// Wiederverwendung der bestehenden Screenshot-Masking-CSS (tests/basics).
const stylePath = path.join(import.meta.dirname, '..', 'basics', 'screenshot.css');

test.describe('Komponenten: Visuelle Regression (Publish)', { tag: ['@level2-components', '@visual'] }, () => {
  for (const c of SAMPLE_COMPONENTS) {
    test(`Gerenderte Seite "${c.label}" entspricht Baseline`, async ({ publishPage }) => {
      const skipReason = publishPage.unavailableReason();
      test.skip(skipReason !== null, skipReason ?? '');

      await publishPage.openRendered(samplePagePath(c));

      await expect(publishPage.page).toHaveScreenshot(`${c.key}.png`, {
        fullPage: true,
        stylePath,
      });
    });
  }
});
