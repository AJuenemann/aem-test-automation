import path from 'node:path';
import { test, expect } from '../../fixtures/test-fixtures.js';
import { titleEn, describeEn } from '../../fixtures/titles.js';

/**
 * Overlay-Regression (JET-Antwort zu 7., Punkt 4): die auf das Fraunhofer-
 * Design angepasste Fehlerseite. Nur auf der PUBLISH-Seite testbar.
 *
 * Aufgerufen wird bewusst eine NICHT existierende URL: So sieht ein Besucher die
 * Fehlerseite. Gegen DEV verifiziert (13.11.2026): Unter /content/samples/de
 * liefert Publish die gestaltete "Fehlerseite 404"; unter /content/fhgtest/de
 * (JET-Beispiel) ist keine Fehlerseite eingerichtet, dort kommt nur die rohe
 * Sling-Meldung. Pfad via Env ERROR_PAGE_PATH überschreibbar.
 *
 * Visueller Vergleich gegen die Vorher-Baseline (pro AEM_ENV getrennt).
 * Überspringt sich sauber, wenn keine Publish-URL verfügbar ist.
 */
const ERROR_PAGE =
  process.env.ERROR_PAGE_PATH?.trim() || '/content/samples/de/qa-seite-gibt-es-nicht';
const stylePath = path.join(import.meta.dirname, '..', 'basics', 'screenshot.css');

test.describe('Regression: Fehlerseite (Publish, visuell)', { tag: ['@regression', '@visual'], annotation: describeEn('Regression: error page (publish, visual)') }, () => {
  test('Fehlerseite (404) entspricht Baseline', titleEn('Error page (404) matches baseline'), async ({ publishPage }) => {
    const skipReason = publishPage.unavailableReason();
    test.skip(skipReason !== null, skipReason ?? '');

    await publishPage.openRendered(ERROR_PAGE);
    // Schutz: die rohe Sling-Fehlermeldung ist NICHT die Fraunhofer-Fehlerseite.
    // Ohne diese Prüfung würde sie unbemerkt als Baseline gespeichert.
    await expect(publishPage.page).not.toHaveTitle(/Resource at .* not found/i);
    await expect(publishPage.page).toHaveTitle(/Fehlerseite|404/i);
    await expect(publishPage.page).toHaveScreenshot('error-404.png', {
      fullPage: true,
      stylePath,
    });
  });
});
