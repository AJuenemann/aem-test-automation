import { test, expect } from '../../fixtures/test-fixtures.js';
import { titleEn, describeEn } from '../../fixtures/titles.js';
import { getAemConfig } from '../../config/env.js';

/**
 * Komponente redaktionell befüllen und bis Publish verfolgen (Spielwiese):
 * FAQ einfügen, darin einen „Textblock extern" einfügen, Dialog ausfüllen,
 * speichern, im Editor prüfen, veröffentlichen, auf Publish prüfen,
 * Veröffentlichung zurücknehmen.
 *
 * Bewusst andere Komponenten als COMP-1 (Verweis) und die 11 Samples-Dialoge.
 * FAQ und Textblock laden nach jeder Änderung die Seite neu (REFRESH_PAGE in
 * cq:editConfig). Danach baut der Editor die Overlays nicht zuverlässig neu
 * auf (Diag 18.11.2026), daher wird der Editor jeweils neu geöffnet.
 */
test.describe('Komponenten: Befüllen und veröffentlichen', { tag: '@level2-components', annotation: describeEn('Components: fill and publish') }, () => {
  test('FAQ mit Textblock befüllen, im Editor und auf Publish prüfen', titleEn('Fill an FAQ with a text block and verify it in the editor and on publish'), async ({
    page,
    sitesConsole,
    pageEditor,
    publishPage,
    makeTestPage,
    registerCleanup,
  }) => {
    test.setTimeout(300_000);
    const cfg = getAemConfig();
    const pageData = makeTestPage('faq-textblock');
    registerCleanup(pageData.path);
    const headline = `QA FAQ Frage ${pageData.name.slice(-8)}`;
    const summary = 'QA Antwort: Inhalt bleibt nach der Migration erhalten.';
    const faqParsys = `${pageData.path}/jcr:content/contentPar/faq/faqComponentParsys`;

    await sitesConsole.createPage({ parentPath: cfg.playgroundPath, name: pageData.name, title: pageData.title });

    await pageEditor.open(pageData.path);
    await pageEditor.insertComponent('FAQ');
    await pageEditor.open(pageData.path);
    await pageEditor.insertComponent('Textblock extern', { parsysPath: faqParsys });
    await pageEditor.open(pageData.path);
    await pageEditor.configureComponent(`${faqParsys}/textblock`, { './headline': headline, './summary': summary });

    // Editor: gespeicherter Inhalt wird nach dem Neuladen angezeigt.
    await pageEditor.open(pageData.path);
    await expect(pageEditor.contentFrame().getByText(headline)).toBeVisible({ timeout: 30_000 });
    await expect(pageEditor.contentFrame().getByText(summary)).toBeVisible();

    const noPublish = publishPage.unavailableReason();
    test.skip(Boolean(noPublish), `Publish nicht geprüft: ${noPublish}`);

    await sitesConsole.activatePage(pageData.path);
    const publishUrl = `${publishPage.config().url}${pageData.path}.html`;
    await expect
      .poll(
        async () => {
          const res = await page.request.get(`${publishUrl}?qa-nocache=${Date.now()}`).catch(() => null);
          return res && res.ok() ? await res.text() : '';
        },
        { message: `Inhalt kommt nicht auf Publish an (${publishUrl}).`, timeout: 60_000, intervals: [2_000, 5_000] },
      )
      .toContain(headline);
    const html = await (await page.request.get(`${publishUrl}?qa-nocache=${Date.now()}`)).text();
    expect(html).toContain(summary);

    // Aufräumen auf Publish: Veröffentlichung zurücknehmen (Seite löscht der Teardown).
    await sitesConsole.deactivatePage(pageData.path);
  });
});
