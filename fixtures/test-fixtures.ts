import { test as base, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { getAemConfig, assertWithinPlayground } from '../config/env.js';
import { SitesConsolePage } from '../pageobjects/SitesConsolePage.js';
import { PageEditor } from '../pageobjects/PageEditor.js';
import { PublishPage } from '../pageobjects/PublishPage.js';
import { SamplesComponentPage } from '../pageobjects/SamplesComponentPage.js';
import { LdapImportPage } from '../pageobjects/LdapImportPage.js';
import { OverlayChecks } from '../pageobjects/OverlayChecks.js';
import { AssetsConsolePage } from '../pageobjects/AssetsConsolePage.js';

/**
 * Beschreibt eine automatisch generierte, eindeutige Testseite.
 */
export interface TestPage {
  /** Nur der Knotenname (z.B. "level1-seiten-crud-20261110-153045-a1b2"). */
  name: string;
  /** Vollständiger Inhaltspfad unterhalb der Spielwiese. */
  path: string;
  /** Lesbarer Seitentitel. */
  title: string;
}

/**
 * Bekannte Test-Level (aus den Playwright-Tags, ohne führendes @). Sie bilden
 * das Namenspräfix der Testseiten und sind das Erkennungsmuster des Aufräum-
 * Tasks. Facetten-Tags wie `visual` sind KEIN Level.
 */
export const TEST_LEVELS = [
  'smoke',
  'level1',
  'level2-components',
  'integration',
  'regression',
  'unit',
] as const;
export type TestLevel = (typeof TEST_LEVELS)[number];

interface Fixtures {
  sitesConsole: SitesConsolePage;
  pageEditor: PageEditor;
  publishPage: PublishPage;
  samplesComponent: SamplesComponentPage;
  ldapImport: LdapImportPage;
  overlayChecks: OverlayChecks;
  assetsConsole: AssetsConsolePage;
  /**
   * Generiert eindeutige Seitendaten unterhalb der Spielwiese (ohne sie
   * anzulegen). Der Knotenname folgt dem Schema
   *   <level>-<testslug>-<JJJJMMTT>-<HHMMSS>-<uuid4>
   * Das Level wird aus dem Test-Tag abgeleitet; fehlt ein bekannter Level-Tag,
   * wird bewusst KEIN Ersatz erzeugt, sondern ein Fehler geworfen.
   *
   * @param slug Kurzer, sprechender Testname (z.B. "seiten-crud").
   */
  makeTestPage: (slug: string) => TestPage;
  /**
   * Registriert einen Pfad zum automatischen Cleanup nach dem Test.
   * Der Pfad muss innerhalb der Spielwiese liegen (Guard).
   */
  registerCleanup: (contentPath: string) => void;
}

/** Normalisiert einen Slug auf AEM-taugliche Knotennamen-Zeichen (a-z0-9-). */
function normalizeSlug(raw: string): string {
  const slug = raw
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug === '') {
    throw new Error('makeTestPage: slug ergibt nach Normalisierung keinen gültigen Namen.');
  }
  return slug;
}

/** Zeitstempel in Ortszeit als JJJJMMTT-HHMMSS. */
function localTimestamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  const time = `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `${date}-${time}`;
}

/**
 * Bestimmt das Test-Level aus den Tags des laufenden Tests. Kein Fallback:
 * ohne bekannten Level-Tag wird ein Fehler geworfen (verhindert namenlose,
 * nicht zuordenbare Testrückstände).
 */
export function levelFromTags(tags: string[]): TestLevel {
  const normalized = tags.map((t) => t.replace(/^@/, ''));
  const level = TEST_LEVELS.find((l) => normalized.includes(l));
  if (!level) {
    throw new Error(
      `makeTestPage: kein Test-Level-Tag gefunden. Der Test muss genau einen ` +
        `Level-Tag tragen (${TEST_LEVELS.map((l) => '@' + l).join(', ')}).`,
    );
  }
  return level;
}

export const test = base.extend<Fixtures>({
  sitesConsole: async ({ page }, use) => {
    await use(new SitesConsolePage(page));
  },

  pageEditor: async ({ page }, use) => {
    await use(new PageEditor(page));
  },

  publishPage: async ({ page }, use) => {
    await use(new PublishPage(page));
  },

  samplesComponent: async ({ page }, use) => {
    await use(new SamplesComponentPage(page));
  },

  ldapImport: async ({ page }, use) => {
    await use(new LdapImportPage(page));
  },

  overlayChecks: async ({ page }, use) => {
    await use(new OverlayChecks(page));
  },
  assetsConsole: async ({ page }, use) => {
    await use(new AssetsConsolePage(page));
  },

  // eslint-disable-next-line no-empty-pattern
  makeTestPage: async ({}, use, testInfo) => {
    const cfg = getAemConfig();
    const level = levelFromTags(testInfo.tags);
    const factory = (slug: string): TestPage => {
      const safeSlug = normalizeSlug(slug);
      const suffix = randomUUID().split('-')[0];
      const name = `${level}-${safeSlug}-${localTimestamp()}-${suffix}`;
      const path = `${cfg.playgroundPath}/${name}`;
      assertWithinPlayground(path); // doppelte Absicherung
      return { name, path, title: `${level} ${safeSlug} ${suffix}` };
    };
    await use(factory);
  },

  registerCleanup: async ({ page }, use) => {
    const toDelete: string[] = [];
    const register = (contentPath: string): void => {
      assertWithinPlayground(contentPath);
      toDelete.push(contentPath);
    };

    await use(register);

    // Teardown: in umgekehrter Reihenfolge aufräumen, robust gegen Fehler.
    const sites = new SitesConsolePage(page);
    const failed: string[] = [];
    for (const path of toDelete.reverse()) {
      try {
        await sites.deletePage(path);
      } catch (err) {
        // Cleanup darf den Testlauf nicht zum Absturz bringen; nur protokollieren.
        failed.push(path);
        globalThis.console.warn(`Cleanup für ${path} fehlgeschlagen: ${(err as Error).message}`);
      }
    }
    // Aggregiertes Signal: stummes Lecken von Testseiten vermeiden.
    if (failed.length > 0) {
      globalThis.console.warn(
        `WARN: ${failed.length} Testseite(n) nicht aufgeräumt (ggf. manuell löschen): ` +
          failed.join(', '),
      );
    }
  },
});

export { expect };
