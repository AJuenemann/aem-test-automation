import { test, expect } from '../../fixtures/test-fixtures.js';

/**
 * Sprachversionen (Publish, nur lesend) an einem echten Seitenpaar der
 * Fraunhofer-Website: /content/zv/de/datenschutzerklaerung <-> /content/zv/en/data-protection-policy.
 * Per Diag gegen DEV und TEST verifiziert (17.11.2026):
 *  - Sprachwahl: Link "English"/"Deutsch" im Header führt zur Gegenseite.
 *  - Hreflang: <link rel="alternate" hreflang="en|de"> verweist gegenseitig.
 * Die Samples-Seiten haben keine Sprachverknüpfung, daher zv.
 */
const PAIRS = [
  { lang: 'de', path: '/content/zv/de/datenschutzerklaerung', switchTo: 'English' },
  { lang: 'en', path: '/content/zv/en/data-protection-policy', switchTo: 'Deutsch' },
] as const;

test.describe('Regression: Sprachversionen (Publish)', { tag: '@regression' }, () => {
  test.beforeEach(({ publishPage }) => {
    const skip = publishPage.unavailableReason();
    test.skip(skip !== null, skip ?? '');
  });

  for (const [i, from] of PAIRS.entries()) {
    const to = PAIRS[1 - i];
    test(`Sprachwahl "${from.switchTo}" öffnet die ${to.lang}-Gegenseite`, async ({ page, publishPage }) => {
      const base = publishPage.config().url;
      await page.goto(`${base}${from.path}.html`, { waitUntil: 'domcontentloaded' });
      await page.locator('header').getByRole('link', { name: from.switchTo, exact: true }).filter({ visible: true }).first().click();
      await expect(page, 'Sprachwahl führt nicht zur Gegenseite (z.B. Startseite oder 404).').toHaveURL(`${base}${to.path}.html`);
      await expect(page.locator('html')).toHaveAttribute('lang', to.lang);
      await expect(page.locator('.fhg-header'), 'Gegenseite ohne Fraunhofer-Header (Fehlerseite?).').toBeVisible();
    });
  }

  test('Hreflang: de- und en-Fassung verweisen gegenseitig aufeinander', async ({ page, publishPage }) => {
    const base = publishPage.config().url;
    for (const [i, from] of PAIRS.entries()) {
      const to = PAIRS[1 - i];
      const res = await page.goto(`${base}${from.path}.html`, { waitUntil: 'domcontentloaded' });
      expect(res?.status(), `${from.path}: falscher HTTP-Status.`).toBe(200);
      const href = await page.locator(`link[rel="alternate"][hreflang="${to.lang}"]`).getAttribute('href');
      // Host ist der externe Name (www.fraunhofer.de), daher nur den Pfad vergleichen.
      expect(href ? new URL(href).pathname : null, `${from.path}: hreflang="${to.lang}" fehlt oder zeigt falsch.`).toBe(`${to.path}.html`);
    }
  });
});
