import { test, expect } from '../../fixtures/test-fixtures.js';
import { titleEn, describeEn } from '../../fixtures/titles.js';
import {
  readReference, missingReferenceMessage, collectNavLinks, hreflangOf, collectImages, imagePatterns,
  type NavLink, type HreflangPair, IMAGE_PAGES, IMAGE_WIDTHS, NAV_PAGES,
} from '../../fixtures/publish-snapshots.js';

/**
 * Publish-Seiten wie vorher: Navigation, Sprachverweise und Bilder gegen den Vorher-Stand
 * (`fixtures/references/<AEM_ENV>/`, erfasst mit `npm run capture-references` vor dem Upgrade).
 * Rein lesend auf Publish, ohne Login.
 */
test.describe('Regression: Publish-Seiten wie vorher (Navigation, Sprachverweise, Bilder)', { tag: '@regression', annotation: describeEn('Regression: publish pages as before (navigation, language links, images)') }, () => {
  test.beforeEach(({ publishPage }) => {
    const skip = publishPage.unavailableReason();
    test.skip(skip !== null, skip ?? '');
  });

  test('Navigation: Links sind unverändert und erreichbar', titleEn('Navigation: links are unchanged and reachable'), async ({ page, publishPage }) => {
    test.setTimeout(180_000);
    const base = publishPage.config().url;
    const ref = readReference<Record<'de' | 'en', NavLink[]>>('navigation');
    expect(ref, missingReferenceMessage('navigation')).not.toBeNull();
    const problems: string[] = [];
    const targets = new Set<string>();
    for (const [lang, contentPath] of Object.entries(NAV_PAGES) as [keyof typeof NAV_PAGES, string][]) {
      const actual = await collectNavLinks(page, base, contentPath);
      const was = new Set(ref![lang].map((l) => l.href));
      const now = new Set(actual.map((l) => l.href));
      for (const h of was) if (!now.has(h)) problems.push(`${lang}: Link fehlt: ${h}`);
      for (const h of now) if (!was.has(h)) problems.push(`${lang}: neuer Link: ${h}`);
      actual.filter((l) => l.href.startsWith('/')).forEach((l) => targets.add(l.href));
    }
    // Erreichbarkeit aller internen Ziele (je Ziel einmal), mit begrenzter Gleichzeitigkeit.
    const list = [...targets];
    for (let i = 0; i < list.length; i += 8) {
      await Promise.all(list.slice(i, i + 8).map(async (href) => {
        const res = await page.request.get(`${base}${href}`, { failOnStatusCode: false });
        if (res.status() !== 200) problems.push(`HTTP ${res.status()}: ${href}`);
      }));
    }
    expect(problems.slice(0, 25), `Abweichungen in der Navigation (${problems.length}).`).toEqual([]);
  });

  test('Hreflang: weitere Seitenpaare verweisen gegenseitig aufeinander', titleEn('Hreflang: further page pairs point to each other'), async ({ page, publishPage }) => {
    test.setTimeout(120_000);
    const base = publishPage.config().url;
    const pairs = readReference<HreflangPair[]>('hreflang-pairs');
    expect(pairs, missingReferenceMessage('hreflang-pairs')).not.toBeNull();
    const problems: string[] = [];
    for (const { de, en } of pairs!) {
      const deRes = await page.request.get(`${base}${de}`, { failOnStatusCode: false });
      if (deRes.status() !== 200) { problems.push(`${de}: HTTP ${deRes.status()}`); continue; }
      const enLink = hreflangOf(await deRes.text()).en;
      if (enLink !== en) problems.push(`${de}: hreflang en ist ${enLink ?? 'nicht vorhanden'}, erwartet ${en}`);
      const enRes = await page.request.get(`${base}${en}`, { failOnStatusCode: false });
      if (enRes.status() !== 200) { problems.push(`${en}: HTTP ${enRes.status()}`); continue; }
      const enHtml = await enRes.text();
      const back = hreflangOf(enHtml).de;
      if (back !== de) problems.push(`${en}: hreflang de ist ${back ?? 'nicht vorhanden'}, erwartet ${de}`);
      if (!/<html[^>]*\blang="en/i.test(enHtml)) problems.push(`${en}: html lang ist nicht en`);
    }
    expect(problems, `Hreflang-Abweichungen bei ${pairs!.length} Seitenpaaren.`).toEqual([]);
  });

  test('Bilder: laden in drei Fenstergrößen, scharf und unverändert', titleEn('Images: load at three window sizes, sharp and unchanged'), async ({ page, publishPage }) => {
    test.setTimeout(180_000);
    const base = publishPage.config().url;
    const ref = readReference<Record<string, string[]>>('images');
    expect(ref, missingReferenceMessage('images')).not.toBeNull();
    const problems: string[] = [];
    for (const contentPath of IMAGE_PAGES) {
      for (const width of IMAGE_WIDTHS) {
        const where = `${contentPath} bei ${width} px`;
        const images = await collectImages(page, base, contentPath, width);
        expect(images.length, `${where}: keine sichtbaren Bilder.`).toBeGreaterThan(0);
        images.filter((i) => i.broken).forEach((i) => problems.push(`${where}: Bild lädt nicht: ${i.key}`));
        images.filter((i) => i.soft).forEach((i) => problems.push(`${where}: Bild kleiner als die Anzeige: ${i.key}`));
        const was = new Set(ref![`${contentPath}@${width}`] ?? []);
        const now = new Set(imagePatterns(images));
        for (const k of was) if (!now.has(k)) problems.push(`${where}: Bild fehlt oder anders ausgeliefert: ${k}`);
        for (const k of now) if (!was.has(k)) problems.push(`${where}: neues Bild oder neue Rendition: ${k}`);
      }
    }
    expect(problems.slice(0, 25), `Abweichungen bei den Bildern (${problems.length}).`).toEqual([]);
  });
});
