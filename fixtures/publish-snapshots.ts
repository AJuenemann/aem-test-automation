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

/** Seiten und Fensterbreiten der Bildprüfung. */
export const IMAGE_PAGES = ['/content/zv/de', '/content/zv/de/fuer-kunden-und-partner'];
export const IMAGE_WIDTHS = [375, 768, 1280];
/** Seiten der Navigationsprüfung (deutsche und englische Startseite). */
export const NAV_PAGES = { de: '/content/zv/de', en: '/content/zv/en' } as const;
