import { test, expect } from '../../fixtures/test-fixtures.js';
import { titleEn, describeEn } from '../../fixtures/titles.js';
import { getAemConfig } from '../../config/env.js';
import type { Page } from '@playwright/test';

/**
 * Navigation aktualisiert sich: Testseite mit
 * Unterseite veröffentlichen, Navigationstitel der Unterseite ändern und erneut
 * veröffentlichen. Auf Publish muss das Hauptmenü der Testseite den neuen Titel
 * zeigen. Geprüft wird wie ein Besucher, ohne Cache-Umgehung: Vor Publish sitzt
 * ein Apache (Dispatcher), die Änderung muss den Zwischenspeicher erreichen.
 * Am Ende werden beide Seiten deaktiviert; der Teardown löscht sie.
 *
 * Hauptmenü: `ul.fhg-mainmenu`, Link mit dem Navigationstitel (Diag DEV 24.11.2026).
 */

/** Wartezeit, bis Publish die Änderung zeigt (Agent, Dispatcher-Flush). */
const PUBLISH_TIMEOUT = 180_000;

async function menuLabel(page: Page, url: string, childHref: string): Promise<string> {
  await page.goto(url, { waitUntil: 'networkidle' });
  return (await page.locator(`ul.fhg-mainmenu a[href$="${childHref}"]:visible`).first().textContent({ timeout: 5_000 }).catch(() => ''))?.trim() ?? '';
}

test.describe('Regression: Navigation nach Änderung', { tag: '@regression', annotation: describeEn('Regression: navigation after a change') }, () => {
  test('Geänderter Navigationstitel erscheint auf Publish im Hauptmenü', titleEn('A changed navigation title appears in the main menu on publish'), async ({
    page,
    sitesConsole,
    publishPage,
    makeTestPage,
    registerCleanup,
  }) => {
    const noPublish = publishPage.unavailableReason();
    test.skip(Boolean(noPublish), `Publish nicht geprüft: ${noPublish}`);
    test.setTimeout(600_000);
    const cfg = getAemConfig();
    const parent = makeTestPage('navigation-aendern');
    registerCleanup(parent.path);
    const suffix = parent.name.slice(-8);
    const before = `QA Nav vorher ${suffix}`;
    const after = `QA Nav nachher ${suffix}`;
    const parentUrl = `${publishPage.config().url}${parent.path}.html`;

    await sitesConsole.createPage({ parentPath: cfg.playgroundPath, name: parent.name, title: parent.title });
    const child = await sitesConsole.createPage({ parentPath: parent.path, name: 'kind', title: 'QA Unterseite' });
    const childHref = `${child}.html`;
    await sitesConsole.expectPageVisible(child);
    try {
      await sitesConsole.setProperties(child, { './navTitle': before });
      await sitesConsole.activatePage(parent.path);
      await sitesConsole.activatePage(child);
      await expect
        .poll(() => menuLabel(page, parentUrl, childHref), { message: 'Unterseite fehlt im Hauptmenü auf Publish.', timeout: PUBLISH_TIMEOUT, intervals: [5_000] })
        .toBe(before);

      await sitesConsole.setProperties(child, { './navTitle': after });
      await sitesConsole.activatePage(child);
      await expect
        .poll(() => menuLabel(page, parentUrl, childHref), { message: 'Hauptmenü zeigt den neuen Navigationstitel nicht (Zwischenspeicher?).', timeout: PUBLISH_TIMEOUT, intervals: [5_000] })
        .toBe(after);
    } finally {
      await sitesConsole.deactivatePage(child).catch(() => undefined);
      await sitesConsole.deactivatePage(parent.path).catch(() => undefined);
    }
  });
});
