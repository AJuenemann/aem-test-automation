import { test, expect } from '../../fixtures/test-fixtures.js';
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

test.describe('Regression: Baum wiederherstellen (Timeline)', { tag: '@regression' }, () => {
  test('Formular ueber die Timeline erreichbar und abbrechbar', async ({ sitesConsole }) => {
    test.setTimeout(90_000);
    const pagePath = `${getAemConfig().playgroundPath}${RESTORE_PAGE}`;

    const form = await sitesConsole.openRestoreTreeForm(pagePath);
    await expect(form, 'Formular-Titel fehlt.').toContainText(/Baum unter .+ wiederherstellen/);
    await expect(form.getByRole('button', { name: 'Wiederherstellen', exact: true })).toBeVisible();

    await form.getByRole('button', { name: 'Abbrechen', exact: true }).click();
    await expect(form, 'Formular schliesst nach Abbrechen nicht.').toBeHidden({ timeout: 10_000 });
  });
});
