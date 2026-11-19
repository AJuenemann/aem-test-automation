import type { Page } from '@playwright/test';
import { test, expect } from '../fixtures/test-fixtures.js';
import { getAemConfig } from '../config/env.js';

/**
 * Smoketest: schnelle, rein lesende Prüfung, ob die Umgebung grundsätzlich lebt.
 * Läuft als eigenes Projekt "smoke" VOR allen übrigen AEM-Tests (Gate, siehe
 * playwright.config.ts): schlägt er fehl, überspringt Playwright den Rest.
 *
 * Umfang (abgestimmt): Author-Oberflächen laden ohne JS-Fehler, Publish liefert
 * die echte Website (`zv`) und die Fraunhofer-Fehlerseite aus, technische
 * Prüfungen (Bundles, Replication-Agents). Selektoren per Diag gegen DEV und
 * TEST verifiziert (16.11.2026).
 */

/** Login-Maske: Redirect hierhin heißt "nicht eingeloggt". */
const LOGIN_URL = /\/libs\/granite\/core\/content\/login/;

/**
 * JS-Fehler, die schon im Vorher-Stand auf DEV und TEST auftreten (Diag
 * 16.11.2026). Sie sind kein Upgrade-Befund und werden ignoriert.
 */
const KNOWN_JS_ERRORS: { path: string; message: RegExp; reason: string }[] = [
  { path: '/miscadmin', message: /reading 'Tracker'/, reason: 'Tools-Konsole, Vorher-Stand' },
  { path: '/editor.html/', message: /reading 'toLowerCase'/, reason: 'Page-Editor, Vorher-Stand (zv + samples)' },
];

/** Sammelt unbehandelte JS-Fehler (pageerror) der Seite. */
function collectPageErrors(page: Page): () => string[] {
  const errors: { url: string; message: string }[] = [];
  page.on('pageerror', (e) => errors.push({ url: page.url(), message: e.message }));
  return () =>
    errors
      .filter((e) => !KNOWN_JS_ERRORS.some((k) => e.url.includes(k.path) && k.message.test(e.message)))
      .map((e) => `${new URL(e.url).pathname}: ${e.message.split('\n')[0]}`);
}

/** Author-Oberflächen: Pfad + Element, das "fertig geladen" belegt. */
const CONSOLES: { title: string; path: () => string; ready: string }[] = [
  {
    title: 'Sites-Konsole',
    path: () => `/sites.html${getAemConfig().playgroundPath}`,
    ready: '.cq-siteadmin-admin-childpages .foundation-collection-item',
  },
  {
    title: 'Assets-Konsole',
    path: () => '/assets.html/content/dam',
    ready: '.cq-damadmin-admin-childpages .foundation-collection-item',
  },
  { title: 'Posteingang', path: () => '/aem/inbox', ready: 'table.cq-workflow-inbox-list' },
  { title: 'Tools (miscadmin)', path: () => '/miscadmin', ready: '.x-tree-node-el' },
  { title: 'Benutzerverwaltung (useradmin)', path: () => '/useradmin', ready: '.x-grid3-row' },
];

/** Echte Site (nur lesend: Editor + Publish) und eine garantiert fehlende Seite darunter. */
const PUBLISH_PAGE = '/content/zv/de';
const PUBLISH_MISSING_PAGE = '/content/zv/de/qa-seite-gibt-es-nicht';

test.describe('Smoketest', { tag: '@smoke' }, () => {
  for (const c of CONSOLES) {
    test(`${c.title} lädt ohne JS-Fehler`, async ({ page }) => {
      const jsErrors = collectPageErrors(page);
      await page.goto(`${getAemConfig().baseUrl}${c.path()}`, { waitUntil: 'networkidle' });
      await expect(page, 'Weiterleitung zur Login-Maske (nicht eingeloggt).').not.toHaveURL(LOGIN_URL);
      await expect(page.locator(c.ready).first(), `${c.title}: Inhalt nicht geladen.`).toBeVisible({
        timeout: 30_000,
      });
      expect(jsErrors(), `${c.title}: unerwartete JS-Fehler.`).toEqual([]);
    });
  }

  // Echte Site statt Samples: zv ist stabil und gebrandet. Nur öffnen, nichts ändern.
  test('Page-Editor lädt eine Seite mit Komponenten-Overlays', async ({ page, samplesComponent }) => {
    const jsErrors = collectPageErrors(page);
    await samplesComponent.open(PUBLISH_PAGE);
    expect(jsErrors(), 'Page-Editor: unerwartete JS-Fehler.').toEqual([]);
  });

  test('Publish liefert die Startseite der Fraunhofer-Website aus', async ({ page, publishPage }) => {
    const skip = publishPage.unavailableReason();
    test.skip(skip !== null, skip ?? '');
    const response = await page.goto(`${publishPage.config().url}${PUBLISH_PAGE}.html`, { waitUntil: 'networkidle' });
    expect(response?.status(), `${PUBLISH_PAGE}: falscher HTTP-Status.`).toBe(200);
    await expect(page.locator('.fhg-header'), 'Fraunhofer-Header fehlt.').toBeVisible();
    await expect(page.locator('.fhg-footer'), 'Fraunhofer-Footer fehlt.').toBeVisible();
  });

  test('Publish zeigt die Fraunhofer-Fehlerseite für fehlende Seiten', async ({ page, publishPage }) => {
    const skip = publishPage.unavailableReason();
    test.skip(skip !== null, skip ?? '');
    const response = await page.goto(`${publishPage.config().url}${PUBLISH_MISSING_PAGE}.html`, {
      waitUntil: 'networkidle',
    });
    expect(response?.status(), 'Fehlende Seite liefert nicht HTTP 404.').toBe(404);
    // Rohe Sling-Meldung ("Resource at … not found") statt Fraunhofer-Seite = Befund.
    await expect(page).toHaveTitle(/Fehlerseite 404/);
    await expect(page.locator('.fhg-header'), 'Fehlerseite ohne Fraunhofer-Header.').toBeVisible();
  });

  // Tags steuern Filter- und Suchergebnisse. Die Filterseite der Samples fragt
  // Samples:tag1/tag2 ab (JET), die Kategorien liegen unter categories/samples.
  test('Tag-Verwaltung lädt und enthält die Samples-Tags', async ({ page }) => {
    const jsErrors = collectPageErrors(page);
    const base = getAemConfig().baseUrl;
    await page.goto(`${base}/aem/tags.html/etc/tags/Samples`, { waitUntil: 'networkidle' });
    await expect(page, 'Weiterleitung zur Login-Maske (nicht eingeloggt).').not.toHaveURL(LOGIN_URL);
    for (const tag of ['tag1', 'tag2', 'tag3']) {
      await expect(
        page.locator(`coral-columnview-item[data-foundation-collection-item-id="/etc/tags/Samples/${tag}"]`),
        `Tag Samples:${tag} fehlt in der Tag-Verwaltung.`,
      ).toBeVisible({ timeout: 30_000 });
    }
    await page.goto(`${base}/aem/tags.html/etc/tags/categories/samples`, { waitUntil: 'networkidle' });
    await expect(
      page.locator('coral-columnview-item[data-foundation-collection-item-id="/etc/tags/categories/samples"]'),
      'Tag-Bereich categories/samples fehlt.',
    ).toBeVisible({ timeout: 30_000 });
    expect(jsErrors(), 'Tag-Verwaltung: unerwartete JS-Fehler.').toEqual([]);
  });

  // Technische Prüfung (wie ACL-Test): kein Redakteursweg, aber der häufigste
  // Totalausfall nach einem Upgrade.
  test('Alle OSGi-Bundles sind aktiv', async ({ page }) => {
    const res = await page.request.get(`${getAemConfig().baseUrl}/system/console/bundles.json`);
    expect(res.ok(), `bundles.json nicht erreichbar (HTTP ${res.status()}).`).toBe(true);
    const { data } = (await res.json()) as { data: { symbolicName: string; state: string }[] };
    // Fragmente haben keinen eigenen Lebenszyklus und sind nie "Active".
    const inactive = data.filter((b) => b.state !== 'Active' && b.state !== 'Fragment');
    expect(inactive.map((b) => `${b.symbolicName}: ${b.state}`), 'Nicht aktive Bundles.').toEqual([]);
  });

  // Technische Prüfung: die Author-Replication-Agents. Ein blockierter Agent
  // heißt, Veröffentlichungen kommen nicht auf Publish an (real auf DEV:
  // 10.–16.11.2026 HTTP 401, Agent-Passwort veraltet). Der Author-Status allein
  // zeigt das nicht, weil AEM "Veröffentlicht" schon beim Einreihen setzt;
  // REP-1 prüft die Zustellung zusätzlich auf Publish.
  test('Replication-Agents sind eingerichtet und nicht blockiert', async ({ page }) => {
    const base = `${getAemConfig().baseUrl}/etc/replication/agents.author`;
    const res = await page.request.get(`${base}.2.json`);
    expect(res.ok(), `Agent-Liste nicht lesbar (HTTP ${res.status()}).`).toBe(true);
    const agents = (await res.json()) as Record<string, { 'jcr:content'?: { enabled?: unknown; transportUri?: unknown } }>;
    const enabled = Object.entries(agents).filter(([, a]) => String(a?.['jcr:content']?.enabled) === 'true');
    const publishAgents = enabled.filter(([, a]) => String(a['jcr:content']?.transportUri).includes('/bin/receive'));
    expect(publishAgents.length, 'Kein aktivierter Publish-Agent.').toBeGreaterThan(0);

    const problems: string[] = [];
    for (const [id] of enabled) {
      const q = await page.request.get(`${base}/${id}/jcr:content.queue.json`);
      const { metaData, queue } = (await q.json()) as {
        metaData: { queueStatus: { isBlocked: boolean; isPaused: boolean } };
        queue: { time: number }[];
      };
      const { isBlocked, isPaused } = metaData.queueStatus;
      if (isBlocked || isPaused) {
        const oldest = queue.length ? new Date(Math.min(...queue.map((e) => e.time))).toISOString() : '-';
        problems.push(`${id}: ${isBlocked ? 'blockiert' : 'pausiert'}, ${queue.length} Einträge, ältester ${oldest}`);
      }
    }
    expect(problems, 'Replication-Agents mit Problemen.').toEqual([]);
  });
});
