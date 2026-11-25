import { test, expect } from '../../fixtures/test-fixtures.js';
import { titleEn, describeEn } from '../../fixtures/titles.js';
import {
  readReference, missingReferenceMessage, collectNavLinks, hreflangOf, collectImages, imagePatterns,
  type NavLink, type HreflangPair, IMAGE_PAGES, IMAGE_WIDTHS, NAV_PAGES,
  FEEDS, collectFeed, diffFeed, type FeedState, EVENT_LISTS, collectEventList, diffEventList, type EventListState,
  SEARCH_TERMS, collectSearch, diffSearch, type SearchState,
  COURSE_TERMS, collectCourseSearch, DOWNLOAD_TERMS, collectDownloadSearch,
} from '../../fixtures/publish-snapshots.js';
import { getAemConfig } from '../../config/env.js';

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

  test('RSS-Feeds: Aufbau und Einträge sind unverändert', titleEn('RSS feeds: structure and entries are unchanged'), async ({ page, publishPage }) => {
    test.setTimeout(120_000);
    const base = publishPage.config().url;
    const ref = readReference<Record<string, FeedState>>('feeds');
    expect(ref, missingReferenceMessage('feeds')).not.toBeNull();
    const problems: string[] = [];
    for (const feed of FEEDS) problems.push(...diffFeed(feed, ref![feed], await collectFeed(page, base, feed)));
    expect(problems.slice(0, 25), `Abweichungen in den Feeds (${problems.length}).`).toEqual([]);
  });

  test('Event und Messe: Listen und Detailseite sind unverändert', titleEn('Events and trade fairs: lists and detail page are unchanged'), async ({ page, publishPage }) => {
    test.setTimeout(180_000);
    const base = publishPage.config().url;
    const ref = readReference<Record<string, EventListState>>('events');
    expect(ref, missingReferenceMessage('events')).not.toBeNull();
    const problems: string[] = [];
    for (const list of EVENT_LISTS) problems.push(...diffEventList(list, ref![list], await collectEventList(page, base, list)));
    expect(problems.slice(0, 25), `Abweichungen in den Listen (${problems.length}).`).toEqual([]);
  });

  test('Kurssuche: Trefferzahl und Spitzentreffer wie vorher', titleEn('Course search: hit count and top hits as before'), async ({ page, publishPage }) => {
    test.setTimeout(180_000);
    const base = publishPage.config().url;
    const ref = readReference<Record<string, SearchState>>('course-search');
    expect(ref, missingReferenceMessage('course-search')).not.toBeNull();
    const problems: string[] = [];
    for (const term of COURSE_TERMS) problems.push(...diffSearch(`Kurssuche: ${term || 'alle Kurse'}`, ref![term], await collectCourseSearch(page, base, term)));
    expect(problems, `Abweichungen bei der Kurssuche (${problems.length}).`).toEqual([]);
  });

  test('Downloadsuche: Trefferzahl und Spitzentreffer wie vorher', titleEn('Download search: hit count and top hits as before'), async ({ page, publishPage }) => {
    test.setTimeout(180_000);
    const base = publishPage.config().url;
    const ref = readReference<Record<string, SearchState>>('download-search');
    expect(ref, missingReferenceMessage('download-search')).not.toBeNull();
    const problems: string[] = [];
    for (const term of DOWNLOAD_TERMS) problems.push(...diffSearch(`Downloadsuche: ${term}`, ref![term], await collectDownloadSearch(page, base, term)));
    expect(problems, `Abweichungen bei der Downloadsuche (${problems.length}).`).toEqual([]);
  });

  // Die Enterprise Search ist auf DEV nicht eingerichtet (JET 25.11.2026; die Anfrage endet dort nach 136 s mit 504), daher nur TEST.
  test('Globale Suche: Trefferzahl und Spitzentreffer wie vorher', { tag: '@env:test', ...titleEn('Global search: hit count and top hits as before') }, async ({ page, publishPage }) => {
    test.skip(getAemConfig().env !== 'test', 'Die Enterprise Search ist nur auf TEST eingerichtet.');
    test.setTimeout(240_000);
    const base = publishPage.config().url;
    const ref = readReference<Record<string, SearchState>>('search');
    expect(ref, missingReferenceMessage('search')).not.toBeNull();
    const problems: string[] = [];
    for (const term of SEARCH_TERMS) problems.push(...diffSearch(term, ref![term], await collectSearch(page, base, term)));
    expect(problems, `Abweichungen bei der Suche (${problems.length}).`).toEqual([]);
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
