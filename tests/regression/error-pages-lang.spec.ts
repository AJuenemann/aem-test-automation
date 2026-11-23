import { test, expect } from '../../fixtures/test-fixtures.js';
import { titleEn, describeEn } from '../../fixtures/titles.js';

/**
 * Fehlerseiten Deutsch und Englisch auf Publish (nur lesend, ohne Login): HTTP 404, Titel, Sprache und
 * Fraunhofer-Header statt der rohen Sling-Meldung. Ergänzt SMOKE-8 (nur Deutsch) und OVL-5 (Bildvergleich der
 * Samples-Fehlerseite). Ersetzt den manuellen Test MAN-18.
 */
test.describe('Regression: Fehlerseiten Deutsch und Englisch (Publish)', { tag: '@regression', annotation: describeEn('Regression: error pages in German and English (publish)') }, () => {
  test.beforeEach(({ publishPage }) => {
    const skip = publishPage.unavailableReason();
    test.skip(skip !== null, skip ?? '');
  });

  test('Fehlerseiten zeigen auf Deutsch und Englisch das Fraunhofer-Design', titleEn('Error pages show the Fraunhofer design in German and English'), async ({ page, publishPage }) => {
    const base = publishPage.config().url;
    const cases = [
      { path: '/content/zv/de/qa-seite-gibt-es-nicht', title: /Fehlerseite 404/, lang: 'de' },
      { path: '/content/zv/de/jobs-und-karriere/qa-seite-gibt-es-nicht', title: /Fehlerseite 404/, lang: 'de' },
      { path: '/content/zv/en/qa-page-does-not-exist', title: /Errorpage 404/, lang: 'en' },
      { path: '/content/zv/en/jobs-and-career/qa-page-does-not-exist', title: /Errorpage 404/, lang: 'en' },
    ];
    for (const c of cases) {
      const res = await page.goto(`${base}${c.path}.html`, { waitUntil: 'networkidle' });
      expect(res?.status(), `${c.path}: kein HTTP 404.`).toBe(404);
      await expect(page, `${c.path}: rohe Sling-Meldung statt Fraunhofer-Fehlerseite.`).not.toHaveTitle(/Resource at .* not found/i);
      await expect(page, `${c.path}: falscher Titel.`).toHaveTitle(c.title);
      await expect(page.locator('html'), `${c.path}: falsche Sprache.`).toHaveAttribute('lang', c.lang);
      await expect(page.locator('.fhg-header'), `${c.path}: Fehlerseite ohne Fraunhofer-Header.`).toBeVisible();
    }
  });
});

