import { test, expect } from '@playwright/test';
import { parseFeed, diffFeed, endOf, diffEventList, diffSearch, diffWall, type FeedState, type EventListState, type SearchState } from '../../fixtures/publish-snapshots.js';

/** Reine Logik der Feed- und Listenvergleiche (ohne AEM). */
test.describe('Publish-Referenzen: Feeds und Event-Listen (Logik)', { tag: '@unit' }, () => {
  const xml = `<?xml version="1.0"?><rss><channel><title>Presse</title><language>de</language><ttl>5</ttl>
    <image><title>Logo</title></image>
    <item><title><![CDATA[Strom & Wärme]]></title><link>https://x/a</link><guid>g1</guid><description>&lt;p&gt;Text &amp;amp; mehr&lt;/p&gt;</description><pubDate>02 Nov 2026 00:00:00 GMT</pubDate></item>
    <item><title>Zweiter</title><link>https://x/b</link><guid>g2</guid><description></description><pubDate>01 Nov 2026 00:00:00 GMT</pubDate></item></channel></rss>`;

  test('Feed: Kanal und Einträge werden gelesen, CDATA und maskiertes HTML aufgelöst', () => {
    const f = parseFeed(xml);
    expect(f.channel.title).toBe('Presse'); // nicht der Titel im image-Block
    expect(f.channel.ttl).toBe('5');
    expect(f.items).toHaveLength(2);
    expect(f.items[0].title).toBe('Strom & Wärme');
    expect(f.items[0].descText).toBe('Text & mehr');
  });

  test('Feed: Abweichungen werden benannt, Gleichheit meldet nichts', () => {
    const base: FeedState = { status: 200, contentType: 'text/xml', wellFormed: true, ...parseFeed(xml) };
    expect(diffFeed('f', base, structuredClone(base))).toEqual([]);
    const changed = structuredClone(base);
    changed.items[1].title = 'Anders';
    changed.items.pop();
    changed.contentType = 'text/html';
    const problems = diffFeed('f', base, changed).join('\n');
    expect(problems).toContain('Content-Type');
    expect(problems).toContain('1 Einträge, vorher 2');
    expect(diffFeed('f', base, { ...base, status: 500 })).toEqual(['f: HTTP 500']);
  });

  test('Datum: Ende des Zeitraums, auch bei einem einzelnen Tag und ohne Datum', () => {
    expect(endOf('24. November 2026 - 25. November 2026')?.getDate()).toBe(25);
    expect(endOf('11. Januar 2027')?.getMonth()).toBe(0);
    expect(endOf('März 2027')).toBeNull();
  });

  test('Wall: Abweichung bei Status, Länge und Seite wird benannt', () => {
    const was = { pageHasWall: true, status: 200, length: 0 };
    expect(diffWall('w', was, { ...was })).toEqual([]);
    const problems = diffWall('w', was, { pageHasWall: false, status: 500, length: 1200 }).join('\n');
    expect(problems).toContain('zeigt nicht mehr die Wall');
    expect(problems).toContain('HTTP 500, vorher 200');
    expect(problems).toContain('1200 Byte, vorher 0');
  });

  test('Suche: Toleranz bei Trefferzahl und Spitzentreffern', () => {
    const hits = (n: number) => Array.from({ length: 10 }, (_, i) => ({ href: `/h${i + n}`, title: `T${i + n}` }));
    const was: SearchState = { total: 1000, top: hits(0) };
    expect(diffSearch('x', was, { total: 1500, top: hits(0) })).toEqual([]); // wächst: in Ordnung
    expect(diffSearch('x', was, { total: 950, top: hits(3) })).toEqual([]); // 7 von 10 gleich
    expect(diffSearch('x', was, { total: 850, top: hits(0) })[0]).toContain('850 Treffer, vorher 1000');
    expect(diffSearch('x', was, { total: 1000, top: hits(4) })[0]).toContain('nur 6 der 10 Spitzentreffer');
    expect(diffSearch('x', was, { total: 0, top: [] })[0]).toContain('keine Treffer');
    // Wartezeit: erst mehr als doppelt so lange und mindestens 5 s mehr ist spürbar; ohne Vorher-Messung keine Prüfung.
    const timed: SearchState = { ...was, durationMs: 2000 };
    expect(diffSearch('x', timed, { ...was, durationMs: 6900 })).toEqual([]);
    expect(diffSearch('x', timed, { ...was, durationMs: 7100 })[0]).toContain('7.1 s bis zur Trefferliste, vorher 2 s');
    expect(diffSearch('x', was, { ...was, durationMs: 60_000 })).toEqual([]);
  });

  test('Liste: vergangene Einträge dürfen fehlen, laufende nicht, neue und geänderte werden gemeldet', () => {
    const item = (href: string, date: string) => ({ href, title: href, place: 'Ort', date });
    const was: EventListState = { items: [item('/alt', '1. Januar 2020'), item('/laufend', '1. Januar 2099'), item('/gleich', '2. Januar 2099')], detail: { href: '/laufend', text: 'A' } };
    const now: EventListState = { items: [item('/gleich', '2. Januar 2099'), item('/neu', '3. Januar 2099')], detail: { href: '/laufend', text: 'A' } };
    const problems = diffEventList('l', was, now, new Date('2026-11-24')).join('\n');
    expect(problems).toContain('Eintrag fehlt: /laufend');
    expect(problems).not.toContain('/alt');
    // Ein Eintrag (/alt) ist abgelaufen, daher darf genau ein neuer nachrücken: /neu wird nicht gemeldet.
    expect(problems).not.toContain('neuer Eintrag: /neu');
    const two = { ...now, items: [...now.items, item('/neu2', '4. Januar 2099')] };
    expect(diffEventList('l', was, two, new Date('2026-11-24')).join('\n')).toContain('neuer Eintrag: /neu2');
    // Endet ein Eintrag heute, darf er schon fehlen.
    const today: EventListState = { items: [item('/heute', '26. November 2026')], detail: { href: '', text: '' } };
    expect(diffEventList('l', today, { items: [item('/x', '1. Januar 2099')], detail: { href: '', text: '' } }, new Date('2026-11-26T12:00:00'))).toEqual([]);
    expect(diffEventList('l', was, { ...now, items: [] }, new Date('2026-11-24'))).toEqual(['l: Liste ist leer']);
  });
});
