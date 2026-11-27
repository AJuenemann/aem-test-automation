import { test } from '../../fixtures/test-fixtures.js';
import { titleEn, describeEn } from '../../fixtures/titles.js';
import {
  CAPTURE_MODE, writeReference, readReference, collectNavLinks, findHreflangPairs, collectImages, imagePatterns,
  IMAGE_PAGES, IMAGE_WIDTHS, NAV_PAGES, FEEDS, collectFeed, EVENT_LISTS, collectEventList,
  SEARCH_CASES, searchKey, collectSearch, extendReference, COURSE_TERMS, collectCourseSearch, DOWNLOAD_TERMS, collectDownloadSearch,
  WALL_PAGES, collectWall, type FeedState, type EventListState, type SearchState, type WallState,
} from '../../fixtures/publish-snapshots.js';
import { getAemConfig } from '../../config/env.js';

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

  test('RSS-Feeds erfassen', titleEn('Capture the RSS feeds'), async ({ page, publishPage }) => {
    const base = publishPage.config().url;
    const ref: Record<string, FeedState> = {};
    for (const feed of FEEDS) {
      ref[feed] = await collectFeed(page, base, feed);
      if (ref[feed].status !== 200 || !ref[feed].wellFormed) throw new Error(`Feed ${feed}: HTTP ${ref[feed].status}, wohlgeformt ${ref[feed].wellFormed}. Nicht als Vorher-Stand geeignet.`);
    }
    writeReference('feeds', ref);
  });

  test('Event- und Messelisten erfassen', titleEn('Capture the event and trade fair lists'), async ({ page, publishPage }) => {
    const base = publishPage.config().url;
    const ref: Record<string, EventListState> = {};
    for (const list of EVENT_LISTS) {
      ref[list] = await collectEventList(page, base, list);
      if (!ref[list].items.length || !ref[list].detail.text) throw new Error(`Liste ${list}: ${ref[list].items.length} Einträge, Detailtext ${ref[list].detail.text ? 'da' : 'leer'}. Nicht als Vorher-Stand geeignet.`);
    }
    writeReference('events', ref);
  });

  test('Suchtreffer erfassen', titleEn('Capture the search results'), async ({ page, publishPage }) => {
    test.skip(getAemConfig().env !== 'test', 'Die Enterprise Search ist nur auf TEST eingerichtet (auf DEV nicht, JET 25.11.2026).');
    test.setTimeout(240_000);
    const base = publishPage.config().url;
    // Vorhandene Begriffe bleiben unverändert (Vorher-Stand), nur neue Fälle werden ergänzt.
    const existing = readReference<Record<string, SearchState>>('search') ?? {};
    const ref: Record<string, SearchState> = {};
    for (const c of SEARCH_CASES.filter((x) => !(searchKey(x) in existing))) {
      const key = searchKey(c);
      ref[key] = await collectSearch(page, base, c);
      if (ref[key].total === 0 || ref[key].top.length < 10) throw new Error(`Suche "${key}": ${ref[key].total} Treffer, ${ref[key].top.length} auf der ersten Seite. Nicht als Vorher-Stand geeignet.`);
    }
    globalThis.console.log(`[CAPTURE] Suche: ergänzt ${extendReference('search', ref).join(', ') || 'nichts'}`);
  });

  test('Social Media Wall erfassen', titleEn('Capture the social media wall'), async ({ page, publishPage }) => {
    const base = publishPage.config().url;
    const ref: Record<string, WallState> = {};
    for (const p of WALL_PAGES) {
      ref[p] = await collectWall(page.request, base, p);
      if (!ref[p].pageHasWall) throw new Error(`Seite ${p} zeigt keine Wall. Nicht als Vorher-Stand geeignet.`);
    }
    writeReference('walls', ref);
  });

  test('Kurssuche erfassen', titleEn('Capture the course search'), async ({ page, publishPage }) => {
    test.setTimeout(180_000);
    const base = publishPage.config().url;
    const ref: Record<string, SearchState> = {};
    for (const term of COURSE_TERMS) {
      ref[term] = await collectCourseSearch(page, base, term);
      if (ref[term].total === 0 || !ref[term].top.length) throw new Error(`Kurssuche "${term}": ${ref[term].total} Treffer. Nicht als Vorher-Stand geeignet.`);
    }
    writeReference('course-search', ref);
  });

  test('Downloadsuche erfassen', titleEn('Capture the download search'), async ({ page, publishPage }) => {
    test.setTimeout(180_000);
    const base = publishPage.config().url;
    const ref: Record<string, SearchState> = {};
    for (const term of DOWNLOAD_TERMS) {
      ref[term] = await collectDownloadSearch(page, base, term);
      if (ref[term].total === 0 || !ref[term].top.length) throw new Error(`Downloadsuche "${term}": ${ref[term].total} Treffer. Nicht als Vorher-Stand geeignet.`);
    }
    writeReference('download-search', ref);
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
