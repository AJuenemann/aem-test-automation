import { test, expect } from '../../fixtures/test-fixtures.js';
import { titleEn, describeEn } from '../../fixtures/titles.js';
import { getAemConfig } from '../../config/env.js';
/**
 * LDAP-/Visitenkarten-Import (JET-Antwort zu 5. und 6.).
 *
 * Scope (abgestimmt): ersten Treffer der Kontaktsuche in die
 * Visitenkarten-Spielwiese (/content/businesscards/fhgtest) importieren und
 * danach wieder bereinigen. Das Zielfeld erzwingt /content/businesscards/...,
 * daher nicht /content/fhgtest.
 *
 * Einstieg (von FHG genannt, gegen TEST verifiziert): Tools -> fraunhofer ->
 * adminpages -> "LDAP Business Card Import" (Doppelklick, oeffnet neuen Tab).
 *
 * NUR TEST: LDAP ist in DEV dauerhaft nicht angebunden. Suchbegriff (Vorname)
 * via LDAP_SEARCH_QUERY ueberschreibbar.
 */
const SEARCH_QUERY = process.env.LDAP_SEARCH_QUERY?.trim() || 'Max';
// @env:test macht die Umgebungs-Einschränkung für das Cockpit sichtbar (dort
// werden nicht passende Umgebungen ausgegraut). Die harte Absicherung bleibt
// der test.skip unten (greift auch bei CLI-/CI-Läufen, die die UI umgehen).
test.describe('Integration: LDAP-/Visitenkarten-Import', { tag: ['@integration', '@env:test'], annotation: describeEn('Integration: LDAP/business card import') }, () => {
  test('Import ist startbar: Kontakt suchen, in Spielwiese importieren, bereinigen', titleEn('Import can be started: find a contact, import into the playground, clean up'), async ({
    ldapImport,
    sitesConsole,
    makeTestPage,
    registerCleanup,
  }) => {
    test.skip(getAemConfig().env !== 'test', 'LDAP ist nur in TEST angebunden.');
    test.setTimeout(180_000);
    const target = `${getAemConfig().businesscardPlaygroundPath}/${makeTestPage('ldap-import').name}`;

    await ldapImport.openFromTools();

    const rows = await ldapImport.searchByFirstName(SEARCH_QUERY);
    expect(await rows.count(), `Suche "${SEARCH_QUERY}" lieferte keine Treffer.`).toBeGreaterThan(0);

    const dialog = await ldapImport.openImportDialog(rows.first());
    await expect(dialog.locator('input[name="path"]'), 'Zielpfad ist nicht vorbelegt.').toHaveValue(/^\/content\/businesscards\//);

    const imported = await ldapImport.importTo(dialog, target);
    registerCleanup(imported); // Guard: nur innerhalb der Spielwiesen
    await ldapImport.close();

    // Nachweis über die UI: die Visitenkarte liegt jetzt in der Spielwiese.
    await sitesConsole.expectPageVisible(imported);
  });

  // Karte anzeigen und finden. Weg per Diag gegen TEST (24.11.2026): Karte im Asset-Finder
  // („Visitenkarten") auf die Komponente „Visitenkarten" in der „Visitenkarten-Übersicht" ziehen.
  test('Importierte Karte im Asset-Finder finden, in eine Seite einsetzen und Daten prüfen', titleEn('Find the imported card in the asset finder, place it on a page and check its data'), async ({
    page,
    ldapImport,
    sitesConsole,
    pageEditor,
    overlayChecks,
    makeTestPage,
    registerCleanup,
  }) => {
    test.skip(getAemConfig().env !== 'test', 'LDAP ist nur in TEST angebunden.');
    test.setTimeout(300_000);
    const cfg = getAemConfig();
    const target = `${cfg.businesscardPlaygroundPath}/${makeTestPage('ldap-karte').name}`;
    const pageData = makeTestPage('ldap-karte-seite');
    registerCleanup(pageData.path);

    await ldapImport.openFromTools();
    const row = (await ldapImport.searchByFirstName(SEARCH_QUERY)).first();
    const person = await ldapImport.rowData(row);
    expect(person.lastname, 'Treffer ohne Nachnamen.').not.toBe('');
    const imported = await ldapImport.importTo(await ldapImport.openImportDialog(row), target);
    registerCleanup(imported);
    await ldapImport.close();

    await sitesConsole.createPage({ parentPath: cfg.playgroundPath, name: pageData.name, title: pageData.title });
    await pageEditor.open(pageData.path);
    await pageEditor.insertComponent('Visitenkarten-Übersicht');
    await pageEditor.open(pageData.path);
    const include = page.locator('.cq-Overlay--component[title="Visitenkarten"]').first();
    await include.waitFor({ state: 'attached', timeout: 30_000 });

    const cards = await overlayChecks.assetFinderSearch('Visitenkarten');
    expect(cards, 'Importierte Karte fehlt im Asset-Finder unter „Visitenkarten".').toContain(imported);
    const card = page.locator(`#SidePanel .editor-Card-asset[data-path="${imported}"]`);
    await expect(card).toContainText(`${person.firstname} ${person.lastname}`);
    // Drop-Ziel für Visitenkarten am Overlay. Das Bedienfeld verschiebt die Overlays: erst ruhige Position abwarten.
    const dropZone = page.locator('.cq-Overlay-subdroptarget[data-asset-accept*="businesscard"]').first();
    let box = '';
    await expect
      .poll(async () => {
        const now = JSON.stringify(await dropZone.boundingBox());
        const stable = now === box && now !== 'null';
        box = now;
        return stable;
      }, { timeout: 15_000, intervals: [500] })
      .toBe(true);
    const saved = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('businesscardinclude'), { timeout: 30_000 });
    await card.dragTo(dropZone, { force: true }); // Overlay ist div[role=button], für Playwright "not enabled"
    expect((await saved).ok(), 'Editor speichert die Karte nicht.').toBe(true);

    // Darstellung wie für Besucher (ohne Editor): Name und Institut aus LDAP, Telefonnummer vorhanden.
    await expect
      .poll(async () => {
        await pageEditor.openRendered(pageData.path);
        return page.locator('body').innerText();
      }, { message: 'Visitenkarte erscheint nicht auf der Seite.', timeout: 60_000, intervals: [3_000] })
      .toContain(`${person.firstname} ${person.lastname}`);
    const body = await page.locator('body').innerText();
    expect(body, 'Institut fehlt auf der Karte.').toContain(person.institute);
    expect(body, 'Telefonnummer fehlt auf der Karte.').toMatch(/\+\d{2}[\d\s-]{6,}/);
  });
});
