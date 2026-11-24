import { test, expect } from '../../fixtures/test-fixtures.js';
import { titleEn, describeEn } from '../../fixtures/titles.js';
import { getAemConfig } from '../../config/env.js';
/**
 * Overlay-Regression (JET-Antwort zu 7., Punkt 5): die "Baum
 * wiederherstellen"-Funktion ist ueber die Timeline im Sites-Admin erreichbar.
 *
 * NICHT destruktiv: der Test oeffnet das Formular, prueft Inhalt und bricht ab.
 * Es wird KEINE Wiederherstellung ausgefuehrt. Selektiert wird eine Seite der
 * Spielwiese (Ordner ohne Seite haben keine Timeline). Gegen DEV verifiziert.
 */
const RESTORE_PAGE = process.env.AEM_RESTORE_TREE_PAGE?.trim() || '/de';

test.describe('Regression: Baum wiederherstellen (Timeline)', { tag: '@regression', annotation: describeEn('Regression: restore tree (timeline)') }, () => {
  test('Formular ueber die Timeline erreichbar und abbrechbar', titleEn('The form can be reached and cancelled via the timeline'), async ({ sitesConsole }) => {
    test.setTimeout(90_000);
    const pagePath = `${getAemConfig().playgroundPath}${RESTORE_PAGE}`;

    const form = await sitesConsole.openRestoreTreeForm(pagePath);
    await expect(form, 'Formular-Titel fehlt.').toContainText(/Baum unter .+ wiederherstellen/);
    await expect(form.getByRole('button', { name: 'Wiederherstellen', exact: true })).toBeVisible();

    await form.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    await expect(form, 'Formular schliesst nach Abbrechen nicht.').toBeHidden({ timeout: 10_000 });
  });

  test('Geloeschte Unterseite wird zum Zeitpunkt davor wiederhergestellt', titleEn('A deleted child page is restored to the point in time before deletion'), async ({ sitesConsole, makeTestPage, registerCleanup, page }) => {
    // Der Zeitpunkt hat Minutengenauigkeit: Kind vor der vollen Minute anlegen, danach löschen, auf die volle Minute zurücksetzen.
    test.setTimeout(360_000);
    const cfg = getAemConfig();
    const parent = makeTestPage('baum-wiederherstellen');
    registerCleanup(parent.path);
    await sitesConsole.createPage({ parentPath: cfg.playgroundPath, name: parent.name, title: parent.title });
    const child = await sitesConsole.createPage({ parentPath: parent.path, name: 'kind', title: 'QA Kind' });
    await sitesConsole.expectPageVisible(child);
    // Baum wiederherstellen arbeitet mit Versionen: Redaktionsseiten haben sie (Aktivieren, Speichern), frische Testseiten nicht.
    await sitesConsole.createVersion(child, 'vor-loeschen');

    // Zeitpunkt = Minute B nach dem Anlegen; gelöscht wird erst nach Ablauf von B. Jede Sekunde in B liegt dazwischen.
    const point = new Date(Math.ceil((Date.now() + 1_000) / 60_000) * 60_000);
    await page.waitForTimeout(point.getTime() + 61_000 - Date.now()); // shortcut: bis zu 2 min Wartezeit, nötig wegen Minutengenauigkeit des Datumsfelds
    const stamp = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(point)
      .reduce((m, p) => ({ ...m, [p.type]: p.value }), {} as Record<string, string>);
    const text = `${stamp.day}. ${stamp.month} ${stamp.year} ${stamp.hour}:${stamp.minute}`;

    await sitesConsole.deletePage(child);
    await sitesConsole.expectPageAbsent(child);

    const form = await sitesConsole.openRestoreTreeForm(parent.path);
    const dateInput = form.locator('coral-datepicker input[type="text"]');
    await dateInput.fill(text);
    await dateInput.press('Tab');
    await expect(form.locator('input[type="hidden"][name="date"]'), 'Zeitpunkt nicht übernommen.').toHaveValue(new RegExp(`T${stamp.hour}:${stamp.minute}:`));
    // Nach Erfolg leitet das Formular selbst in die Konsole um; erst danach weiter navigieren.
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'POST' && r.url().includes('/bin/wcmcommand'), { timeout: 60_000 }),
      page.waitForURL(`**/sites.html${parent.path}`, { waitUntil: 'networkidle', timeout: 60_000 }),
      form.getByRole('button', { name: 'Wiederherstellen', exact: true }).click(),
    ]);
    expect(response.ok(), `Wiederherstellen fehlgeschlagen: HTTP ${response.status()}.`).toBe(true);

    await sitesConsole.waitForPage(child);
  });
});
