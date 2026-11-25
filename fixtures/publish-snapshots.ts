import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { APIRequestContext, Page } from '@playwright/test';
import { getAemConfig } from '../config/env.js';

/**
 * Referenzen der Publish-Seiten (Vorher-Stand) und ihre Erfassung: Navigation, Sprachverweise (Hreflang)
 * und Bilder. Eine JSON je Umgebung und Thema unter `fixtures/references/<AEM_ENV>/<name>.json`.
 *
 * Der Vorher-Stand entsteht auf DEV und TEST, solange dort die alte Software läuft. Nach dem Upgrade darf er
 * nicht neu erzeugt werden: `writeReference` überschreibt keine vorhandene Datei, außer mit
 * `CAPTURE_REFERENCES=overwrite` (bewusste Entscheidung).
 */
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'references');

export const CAPTURE_MODE = process.env.CAPTURE_REFERENCES ?? '';

export const referenceFile = (name: string): string => path.join(ROOT, getAemConfig().env, `${name}.json`);

export function readReference<T>(name: string): T | null {
  const file = referenceFile(name);
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf-8')) as T) : null;
}

/** Fehlertext, wenn die Referenz fehlt (Test schlägt dann klar fehl statt grün zu bleiben). */
export const missingReferenceMessage = (name: string): string =>
  `Referenz "${name}" fehlt für AEM_ENV=${getAemConfig().env}. Vorher-Stand erfassen: ` +
  `CAPTURE_REFERENCES=1 npm run capture-references (nur vor dem Upgrade).`;

export function writeReference(name: string, data: unknown): void {
  const file = referenceFile(name);
  if (fs.existsSync(file) && CAPTURE_MODE !== 'overwrite') {
    throw new Error(
      `Referenz ${path.relative(process.cwd(), file)} existiert schon und ist der Vorher-Stand. ` +
        `Nicht überschreiben. Nur bewusst mit CAPTURE_REFERENCES=overwrite.`,
    );
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

// --- Navigation -----------------------------------------------------------------------------

export interface NavLink {
  href: string;
  text: string;
}

/** Interne Links als Pfad (ohne Host, Query, Anker), externe als volle URL ohne Query und Anker. */
export function normalizeHref(href: string, base: string): string {
  const url = new URL(href, base);
  return url.origin === new URL(base).origin ? url.pathname : `${url.origin}${url.pathname}`;
}

/** Alle Links in den `<nav>`-Bereichen der Seite, je Ziel einmal, sortiert. */
export async function collectNavLinks(page: Page, base: string, contentPath: string): Promise<NavLink[]> {
  await page.goto(`${base}${contentPath}.html`, { waitUntil: 'networkidle' });
  const raw = await page.evaluate(() =>
    Array.from(document.querySelectorAll('nav a[href]')).map((a) => ({
      href: a.getAttribute('href') ?? '',
      text: ((a as HTMLElement).innerText || a.textContent || '').replace(/\s+/g, ' ').trim(),
    })),
  );
  const byHref = new Map<string, NavLink>();
  for (const { href, text } of raw) {
    if (!href || href.startsWith('#') || /^(mailto|tel|javascript):/i.test(href)) continue;
    const key = normalizeHref(href, base);
    if (!byHref.has(key)) byHref.set(key, { href: key, text });
  }
  return [...byHref.values()].sort((a, b) => a.href.localeCompare(b.href));
}

// --- Hreflang -------------------------------------------------------------------------------

/** Sprache -> Pfad aus den `<link rel="alternate" hreflang>`-Tags (der Host ist der Externalizer-Host, daher nur der Pfad). */
export function hreflangOf(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/rel="alternate"/i.test(tag)) continue;
    const lang = /hreflang="([^"]+)"/i.exec(tag)?.[1];
    const href = /href="([^"]+)"/i.exec(tag)?.[1];
    if (lang && href) out[lang] = new URL(href, 'http://x').pathname;
  }
  return out;
}

export interface HreflangPair {
  de: string;
  en: string;
}

async function html(request: APIRequestContext, url: string): Promise<{ status: number; body: string }> {
  const res = await request.get(url, { failOnStatusCode: false });
  return { status: res.status(), body: res.ok() ? await res.text() : '' };
}

/**
 * Sucht Seitenpaare (Deutsch/Englisch) auf `zv`: Breitensuche ab der deutschen Startseite über die Links im HTML,
 * die ersten `max` Seiten mit englischem Hreflang. Deterministisch bei gleichem Inhalt.
 */
export async function findHreflangPairs(request: APIRequestContext, base: string, max = 12): Promise<HreflangPair[]> {
  const queue = ['/content/zv/de.html'];
  const seen = new Set(queue);
  const pairs: HreflangPair[] = [];
  for (let i = 0; i < queue.length && i < 80 && pairs.length < max; i++) {
    const { status, body } = await html(request, `${base}${queue[i]}`);
    if (status !== 200) continue;
    const en = hreflangOf(body).en;
    if (en && i > 0) pairs.push({ de: queue[i], en });
    for (const m of body.matchAll(/href="(\/content\/zv\/de\/[^"#?]+\.html)"/g)) {
      if (!seen.has(m[1])) { seen.add(m[1]); queue.push(m[1]); }
    }
  }
  return pairs;
}

// --- Bilder ---------------------------------------------------------------------------------

export interface ImageState {
  /** Pfad ohne Host und ohne Änderungszeitstempel, dazu die tatsächliche Bildbreite (für Meldungen). */
  key: string;
  /**
   * Vergleichsschlüssel: Bei Bildern der Adaptive-Image-Servlets (`….img.<Rendition>.jpg`) nur Rendition und Breite,
   * sonst Pfad und Breite. Rotierende Slider zeigen je nach Zeitpunkt andere Bilder, die Renditionen bleiben gleich.
   */
  pattern: string;
  broken: boolean;
  /** Bild kleiner als die Anzeige (unscharf). */
  soft: boolean;
}

/** Sichtbare Bilder der Seite bei einer Fensterbreite, nach dem Nachladen (Lazy Loading). */
export async function collectImages(page: Page, base: string, contentPath: string, width: number): Promise<ImageState[]> {
  await page.setViewportSize({ width, height: 800 });
  await page.goto(`${base}${contentPath}.html`, { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(800);
  const raw = await page.evaluate(() =>
    Array.from(document.images)
      .filter((i) => i.offsetParent !== null && i.clientWidth > 40)
      .map((i) => ({
        src: i.currentSrc || i.src,
        nat: i.naturalWidth,
        shown: i.clientWidth,
        ok: i.complete && i.naturalWidth > 0,
        svg: /\.svg(\?|$)/i.test(i.currentSrc || i.src),
      })),
  );
  return raw
    .map((i) => {
      const pathname = new URL(i.src, base).pathname.replace(/\/\d{10,}(?=\/|$)/g, '');
      const rendition = /\.img\.([a-z0-9_-]+)\.[a-z]+(?:\/|$)/i.exec(pathname)?.[1];
      return {
        key: `${pathname}|${i.nat}`,
        pattern: `${rendition ? `img.${rendition}` : pathname}|${i.nat}`,
        broken: !i.ok,
        soft: i.ok && !i.svg && i.nat < i.shown * 0.9,
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** Sortierte, einmalige Vergleichsschlüssel der Bilder (Format der Referenz). */
export const imagePatterns = (images: ImageState[]): string[] => [...new Set(images.map((i) => i.pattern))].sort();

// --- RSS-Feeds ------------------------------------------------------------------------------

export const FEEDS = ['/content/zv/de/rss/presse.rss', '/content/zv/de/rss/veranstaltungen.rss'];

export interface FeedItem {
  title: string;
  link: string;
  guid: string;
  pubDate: string;
  /** Länge der rohen Beschreibung und ihr Text ohne Tags: fängt geänderte HTML-Verarbeitung ab. */
  descLength: number;
  descText: string;
}

export interface FeedState {
  status: number;
  contentType: string;
  /** XML lässt sich parsen (wie im Feed-Reader). */
  wellFormed: boolean;
  channel: Record<string, string>;
  items: FeedItem[];
}

const CHANNEL_FIELDS = ['title', 'description', 'link', 'language', 'category', 'managingEditor', 'copyright', 'ttl'];

const unescapeXml = (s: string): string =>
  s.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');

const rawTag = (xml: string, name: string): string => new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml)?.[1] ?? '';

const plain = (s: string): string => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

/** Liest Kanal und Einträge eines RSS-Feeds (ohne XML-Bibliothek, die Wohlgeformtheit prüft der Browser). */
export function parseFeed(xml: string): Pick<FeedState, 'channel' | 'items'> {
  const head = xml.split('<item>')[0];
  const channel: Record<string, string> = {};
  for (const f of CHANNEL_FIELDS) channel[f] = plain(unescapeXml(rawTag(head, f)));
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, body]) => {
    const rawDesc = rawTag(body, 'description');
    return {
      title: plain(unescapeXml(rawTag(body, 'title'))),
      link: plain(unescapeXml(rawTag(body, 'link'))),
      guid: plain(unescapeXml(rawTag(body, 'guid'))),
      pubDate: plain(unescapeXml(rawTag(body, 'pubDate'))),
      descLength: rawDesc.length,
      descText: unescapeXml(plain(unescapeXml(rawDesc))).slice(0, 120), // Tags entfernen, dann HTML-Entities wie im Leser
    };
  });
  return { channel, items };
}

export async function collectFeed(page: Page, base: string, feedPath: string): Promise<FeedState> {
  const res = await page.request.get(`${base}${feedPath}`, { failOnStatusCode: false });
  const xml = res.ok() ? await res.text() : '';
  const wellFormed = xml
    ? await page.evaluate((x) => new DOMParser().parseFromString(x, 'application/xml').getElementsByTagName('parsererror').length === 0, xml)
    : false;
  return { status: res.status(), contentType: res.headers()['content-type'] ?? '', wellFormed, ...parseFeed(xml) };
}

/** Abweichungen eines Feeds vom Vorher-Stand, lesbar formuliert. */
export function diffFeed(name: string, was: FeedState, now: FeedState): string[] {
  const out: string[] = [];
  if (now.status !== 200) return [`${name}: HTTP ${now.status}`];
  if (!now.wellFormed) out.push(`${name}: XML nicht wohlgeformt`);
  if (now.contentType !== was.contentType) out.push(`${name}: Content-Type ${now.contentType}, vorher ${was.contentType}`);
  for (const f of CHANNEL_FIELDS) if (now.channel[f] !== was.channel[f]) out.push(`${name}: Kanal ${f} ist "${now.channel[f]}", vorher "${was.channel[f]}"`);
  if (now.items.length !== was.items.length) out.push(`${name}: ${now.items.length} Einträge, vorher ${was.items.length}`);
  was.items.forEach((w, i) => {
    const n = now.items[i];
    if (!n) return;
    for (const k of Object.keys(w) as (keyof FeedItem)[]) if (n[k] !== w[k]) out.push(`${name}: Eintrag ${i + 1} ${k} ist "${n[k]}", vorher "${w[k]}"`);
  });
  return out;
}

// --- Event- und Messelisten -----------------------------------------------------------------

export const EVENT_LISTS = ['/content/zv/de/veranstaltungen-messen/veranstaltungen', '/content/zv/de/veranstaltungen-messen/messen'];

export interface EventItem {
  href: string;
  title: string;
  place: string;
  date: string;
}

export interface EventListState {
  /** Erste Seite der Liste in Anzeigereihenfolge. */
  items: EventItem[];
  /** Detailseite des Eintrags mit dem spätesten Ende (bleibt am längsten in der Liste), der einen Detailblock zeigt. */
  detail: { href: string; text: string };
}

const MONTHS: Record<string, number> = { januar: 0, februar: 1, märz: 2, april: 3, mai: 4, juni: 5, juli: 6, august: 7, september: 8, oktober: 9, november: 10, dezember: 11 };

/** Ende des Zeitraums aus „24. November 2026 - 25. November 2026" (letzte Datumsangabe), sonst null. */
export function endOf(dateText: string): Date | null {
  const all = [...dateText.matchAll(/(\d{1,2})\.\s*([A-Za-zäöüÄÖÜ]+)\s+(\d{4})/g)];
  const m = all.at(-1);
  const month = m ? MONTHS[m[2].toLowerCase()] : undefined;
  return m && month !== undefined ? new Date(Number(m[3]), month, Number(m[1]), 23, 59) : null;
}

export async function collectEventList(page: Page, base: string, listPath: string): Promise<EventListState> {
  await page.goto(`${base}${listPath}.html`, { waitUntil: 'networkidle' });
  const items: EventItem[] = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.filterpage-results .filterpage-results--item')).map((li) => {
      const a = li.querySelector('h3 a');
      const t = (sel: string) => ((li.querySelector(sel) as HTMLElement | null)?.innerText ?? '').replace(/\s+/g, ' ').trim();
      return { href: a ? new URL(a.getAttribute('href') ?? '', location.href).pathname : '', title: ((a as HTMLElement | null)?.innerText ?? '').replace(/\s+/g, ' ').trim(), place: t('.place'), date: t('.date') };
    }),
  );
  // Detailseite des Eintrags mit dem spätesten Ende, der einen Detailblock hat (manche Einträge leiten weiter).
  const byEnd = [...items].sort((x, y) => (endOf(y.date)?.getTime() ?? 0) - (endOf(x.date)?.getTime() ?? 0));
  for (const candidate of byEnd.slice(0, 4)) {
    const text = await eventDetailText(page, base, candidate.href);
    if (text) return { items, detail: { href: candidate.href, text } };
  }
  return { items, detail: { href: '', text: '' } };
}

export async function eventDetailText(page: Page, base: string, href: string): Promise<string> {
  await page.goto(`${base}${href}`, { waitUntil: 'networkidle' });
  return page.evaluate(() => ((document.querySelector('.fhg-event-details') as HTMLElement | null)?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 600));
}

/** Abweichungen einer Liste vom Vorher-Stand. Einträge, deren Zeitraum inzwischen vorbei ist, dürfen aus der Liste fallen. */
export function diffEventList(name: string, was: EventListState, now: EventListState, today = new Date()): string[] {
  const out: string[] = [];
  if (!now.items.length) return [`${name}: Liste ist leer`];
  const byHref = new Map(now.items.map((i) => [i.href, i]));
  for (const w of was.items) {
    const n = byHref.get(w.href);
    const end = endOf(w.date);
    if (!n) { if (!end || end >= today) out.push(`${name}: Eintrag fehlt: ${w.title} (${w.href})`); continue; }
    for (const k of ['title', 'place', 'date'] as const) if (n[k] !== w[k]) out.push(`${name}: ${w.href} ${k} ist "${n[k]}", vorher "${w[k]}"`);
  }
  const was2 = new Set(was.items.map((i) => i.href));
  for (const n of now.items) if (!was2.has(n.href)) out.push(`${name}: neuer Eintrag: ${n.title} (${n.href})`);
  if (now.detail.href === was.detail.href && now.detail.text !== was.detail.text) out.push(`${name}: Detailseite ${was.detail.href} zeigt anderen Text`);
  return out;
}

// --- Globale Suche --------------------------------------------------------------------------

/** Typische Begriffe: häufig, selten, Umlaut. Vorläufige Auswahl, bis Fraunhofer Begriffe nennt (Testplan Kapitel 12, Nr. 6). */
export const SEARCH_TERMS = ['Energie', 'Quantencomputer', 'Müller'];

export interface SearchState {
  total: number;
  /** Erste Trefferseite (10 Treffer) in Reihenfolge. */
  top: { href: string; title: string }[];
}

/**
 * Ergebnisseite der globalen Suche, wie sie das Suchformular der Startseite aufruft (GET mit `queryString`).
 * Die Treffer lädt die Seite per Skript vom Such-Dienst nach, daher auf die Überschrift „N Ergebnisse für …" warten.
 */
export async function collectSearch(page: Page, base: string, term: string): Promise<SearchState> {
  const url = `${base}/content/zv/de/suche.html?_charset_=UTF-8&numberResults=10&page=1&lang=de&queryString=${encodeURIComponent(term)}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // Erst die Überschrift mit der Trefferzahl (vorher steht dort ein leerer Platzhalter), dann die Liste.
  const heading = page.locator('.search-results h2', { hasText: /\d+\s+Ergebnis/ }).first();
  await heading.waitFor({ state: 'visible', timeout: 60_000 });
  await page.locator('.search-results ul.articles-list > li').first().waitFor({ state: 'attached', timeout: 30_000 });
  const total = Number(/([\d.]+)\s+Ergebnis/.exec(await heading.innerText())?.[1]?.replace(/\./g, '') ?? 0);
  const top = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.search-results ul.articles-list > li')).map((li) => {
      const a = li.querySelector('a');
      return { href: a?.getAttribute('href') ?? '', title: ((a as HTMLElement | null)?.innerText ?? '').replace(/\s+/g, ' ').trim() };
    }),
  );
  return { total, top };
}

/**
 * Suchtreffer wie vorher. Der Such-Index wird außerhalb von AEM gepflegt und wächst mit der Zeit, deshalb gilt eine
 * Toleranz: Gesamtzahl höchstens 10 % weniger als vorher, mindestens 7 der 10 vorherigen Spitzentreffer wieder unter
 * den ersten 10. // shortcut: feste Schwellen, nach dem Upgrade mit echten Abweichungen nachschärfen
 */
export function diffSearch(term: string, was: SearchState, now: SearchState): string[] {
  const out: string[] = [];
  if (now.total === 0 || !now.top.length) return [`Suche "${term}": keine Treffer (vorher ${was.total})`];
  if (now.total < was.total * 0.9) out.push(`Suche "${term}": ${now.total} Treffer, vorher ${was.total}`);
  const nowHrefs = new Set(now.top.map((t) => t.href));
  const missing = was.top.filter((t) => !nowHrefs.has(t.href));
  if (was.top.length - missing.length < Math.min(7, was.top.length)) {
    out.push(`Suche "${term}": nur ${was.top.length - missing.length} der ${was.top.length} Spitzentreffer wie vorher, es fehlen: ${missing.map((m) => m.title).join('; ')}`);
  }
  return out;
}

/** Seiten und Fensterbreiten der Bildprüfung. */
export const IMAGE_PAGES = ['/content/zv/de', '/content/zv/de/fuer-kunden-und-partner'];
export const IMAGE_WIDTHS = [375, 768, 1280];
/** Seiten der Navigationsprüfung (deutsche und englische Startseite). */
export const NAV_PAGES = { de: '/content/zv/de', en: '/content/zv/en' } as const;
