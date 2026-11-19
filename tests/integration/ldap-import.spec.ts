import { test, expect } from '../../fixtures/test-fixtures.js';
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
// @env:test macht die Umgebungs-Einschränkung für die Web-UI sichtbar (dort
// werden nicht passende Umgebungen ausgegraut). Die harte Absicherung bleibt
// der test.skip unten (greift auch bei CLI-/CI-Läufen, die die UI umgehen).
test.describe('Integration: LDAP-/Visitenkarten-Import', { tag: ['@integration', '@env:test'] }, () => {
  test('Import ist startbar: Kontakt suchen, in Spielwiese importieren, bereinigen', async ({
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
});
