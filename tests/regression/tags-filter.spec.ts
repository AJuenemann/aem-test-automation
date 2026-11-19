import { test, expect } from '../../fixtures/test-fixtures.js';
import { titleEn, describeEn } from '../../fixtures/titles.js';
import { getAemConfig } from '../../config/env.js';

/**
 * Tags im Suchergebnis: Die Filterseite der Samples zeigt Seiten, deren
 * `cq:tags` zur Filterabfrage passen. Am 17.11.2026 war sie auf TEST leer,
 * weil die Tags im Author fehlten (docs/TEST-tags-wiederhergestellt-20261117.md).
 * Der Bildvergleich (COMP-VIS) meldet so etwas nur als Bildabweichung, dieser
 * Test benennt die Ursache. Nur lesend, auf Publish.
 */
const FILTER_PAGE = '/filterpage/filterpage_v2';

test.describe('Regression: Tags im Suchergebnis (Publish)', { tag: '@regression', annotation: describeEn('Regression: tags in search results (publish)') }, () => {
  test('Filterseite liefert getaggte Treffer', titleEn('Filter page returns tagged results'), async ({ page, publishPage }) => {
    const skip = publishPage.unavailableReason();
    test.skip(skip !== null, skip ?? '');
    const url = `${publishPage.config().url}${getAemConfig().samplesRoot}${FILTER_PAGE}.html`;
    const response = await page.goto(url, { waitUntil: 'networkidle' });
    expect(response?.status(), `${url}: falscher HTTP-Status.`).toBe(200);
    // Treffer rendert der Server (Diag 18.11.2026: DEV 7 Treffer).
    const hits = page.locator('.filterpage-results .filterpage-results--item');
    expect(
      await hits.count(),
      '0 Treffer auf der Filterseite. cq:tags der Samples-Seiten (Author) und die ' +
        'veröffentlichten Tags /etc/tags/Samples prüfen.',
    ).toBeGreaterThan(0);
  });
});
