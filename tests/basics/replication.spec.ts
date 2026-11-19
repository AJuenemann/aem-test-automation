import { test, expect } from '../../fixtures/test-fixtures.js';
import { getAemConfig } from '../../config/env.js';
import type { APIRequestContext } from '@playwright/test';

/**
 * MVP Task 6 - Author-Workflow: Aktivieren/Deaktivieren (Replication).
 *
 * Ablauf: Seite anlegen -> aktivieren -> Status prüfen -> auf Publish
 * erreichbar -> deaktivieren -> Status prüfen -> auf Publish verschwunden.
 *
 * Warum Publish mitprüfen: AEM setzt "Veröffentlicht" im Author schon beim
 * Einreihen in die Warteschlange. Auf DEV hing die Zustellung vom 10. bis
 * 16.11.2026 (HTTP 401), der Author-Status war trotzdem grün. Ohne Publish-URL
 * prüft der Test nur den Author-Status (Hinweis im Report).
 */

/** Wartezeit, bis Publish die Änderung ausliefert (Agent + ggf. Dispatcher-Flush). */
const PUBLISH_TIMEOUT = 60_000;

/** HTTP-Status der Seite auf Publish; Query-Parameter umgeht den Dispatcher-Cache. */
async function publishStatus(request: APIRequestContext, url: string): Promise<number> {
  const res = await request.get(`${url}?qa-nocache=${Date.now()}`, { maxRedirects: 0 }).catch(() => null);
  return res?.status() ?? 0;
}

test.describe('AEM-Basis: Replication (Aktivieren/Deaktivieren)', { tag: '@level1' }, () => {
  test('Seite aktivieren und wieder deaktivieren', async ({
    page,
    sitesConsole,
    publishPage,
    makeTestPage,
    registerCleanup,
  }) => {
    // Mehrstufiger Konsolen-Flow (anlegen + aktivieren + 2x Status +
    // deaktivieren, je mit Navigation/Retries) braucht unter Last mehr als die
    // Standard-30s. Analog zu versioning/component-edit. Unter Last lief der
    // Flow real ~53s in den 30s-Timeout (dokumentierter Umgebungs-Flake).
    // Dazu bis zu 2x PUBLISH_TIMEOUT für die Zustellung auf Publish.
    test.setTimeout(240_000);
    const cfg = getAemConfig();
    const pageData = makeTestPage('replication');
    registerCleanup(pageData.path);

    const noPublish = publishPage.unavailableReason();
    if (noPublish) {
      test.info().annotations.push({ type: 'Hinweis', description: `Publish nicht geprüft: ${noPublish}` });
    }
    const publishUrl = `${publishPage.config().url}${pageData.path}.html`;

    await sitesConsole.createPage({
      parentPath: cfg.playgroundPath,
      name: pageData.name,
      title: pageData.title,
    });

    // --- Aktivieren ---
    await sitesConsole.activatePage(pageData.path);
    const afterActivate = await sitesConsole.getPublicationStatus(pageData.path);
    expect(afterActivate).toMatch(/veröffentlicht|published/i);
    if (!noPublish) {
      await expect
        .poll(() => publishStatus(page.request, publishUrl), {
          message: `Seite kommt nicht auf Publish an (${publishUrl}). Replication-Agent prüfen.`,
          timeout: PUBLISH_TIMEOUT,
          intervals: [1_000, 2_000, 5_000],
        })
        .toBe(200);
    }

    // --- Deaktivieren ---
    await sitesConsole.deactivatePage(pageData.path);
    const afterDeactivate = await sitesConsole.getPublicationStatus(pageData.path);
    expect(afterDeactivate).toMatch(/nicht veröffentlicht|not published|unpublished/i);
    if (!noPublish) {
      await expect
        .poll(() => publishStatus(page.request, publishUrl), {
          message: `Seite bleibt nach dem Deaktivieren auf Publish erreichbar (${publishUrl}).`,
          timeout: PUBLISH_TIMEOUT,
          intervals: [1_000, 2_000, 5_000],
        })
        .toBe(404);
    }
  });
});
