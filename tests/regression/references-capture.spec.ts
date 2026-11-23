import { test } from '../../fixtures/test-fixtures.js';
import { titleEn, describeEn } from '../../fixtures/titles.js';
import {
  CAPTURE_MODE, writeReference, collectNavLinks, findHreflangPairs, collectImages, imagePatterns,
  IMAGE_PAGES, IMAGE_WIDTHS, NAV_PAGES,
} from '../../fixtures/publish-snapshots.js';

/**
 * Erfasst den Vorher-Stand der Publish-Seiten (Navigation, Hreflang-Paare, Bilder) als Referenz-Dateien unter
 * `fixtures/references/<AEM_ENV>/`. Nur vor dem Upgrade ausführen: `CAPTURE_REFERENCES=1 npm run capture-references`.
 * Eine vorhandene Referenz wird nicht überschrieben (Schutz des Vorher-Stands), nur mit CAPTURE_REFERENCES=overwrite.
 *
 * Tag @tooling: Werkzeug, kein Testfall, im Cockpit ausgeblendet.
 */
test.describe('Regression: Referenzen erfassen (Vorher-Stand)', { tag: ['@tooling', '@regression'], annotation: describeEn('Regression: capture references (before state)') }, () => {
  test.skip(!CAPTURE_MODE, 'Erfassung nur mit CAPTURE_REFERENCES=1 (erzeugt den Vorher-Stand).');

  test.beforeEach(({ publishPage }) => {
    const skip = publishPage.unavailableReason();
    test.skip(skip !== null, skip ?? '');
  });

  test('Navigation erfassen', titleEn('Capture the navigation'), async ({ page, publishPage }) => {
    const base = publishPage.config().url;
    const ref: Record<string, unknown> = {};
    for (const [lang, contentPath] of Object.entries(NAV_PAGES)) ref[lang] = await collectNavLinks(page, base, contentPath);
    writeReference('navigation', ref);
  });

  test('Hreflang-Seitenpaare erfassen', titleEn('Capture the hreflang page pairs'), async ({ page, publishPage }) => {
    const pairs = await findHreflangPairs(page.request, publishPage.config().url);
    if (pairs.length < 5) throw new Error(`Nur ${pairs.length} Seitenpaare gefunden. Inhalt der Umgebung prüfen.`);
    writeReference('hreflang-pairs', pairs);
  });

  test('Bilder erfassen', titleEn('Capture the images'), async ({ page, publishPage }) => {
    const base = publishPage.config().url;
    const ref: Record<string, string[]> = {};
    for (const contentPath of IMAGE_PAGES) {
      for (const width of IMAGE_WIDTHS) {
        ref[`${contentPath}@${width}`] = imagePatterns(await collectImages(page, base, contentPath, width));
      }
    }
    writeReference('images', ref);
  });
});
