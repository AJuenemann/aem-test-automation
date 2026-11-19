import { test, expect } from '../../fixtures/test-fixtures.js';
import { getAemConfig } from '../../config/env.js';

/**
 * MVP Task 3 - Seiten-CRUD unter der Spielwiese (/content/fhgtest):
 * Anlegen -> Öffnen -> Titel/Property bearbeiten -> Löschen.
 *
 * Alle Operationen laufen ausschließlich unterhalb von AEM_PLAYGROUND_PATH;
 * der Pfad-Guard in den Page Objects / Fixtures erzwingt das technisch.
 */
test.describe('AEM-Basis: Seiten-CRUD', { tag: '@level1' }, () => {
  test('Seite anlegen, bearbeiten und löschen', async ({
    sitesConsole,
    makeTestPage,
    registerCleanup,
  }) => {
    const cfg = getAemConfig();
    const pageData = makeTestPage('seiten-crud');
    // Für den Fall eines Fehlschlags vor dem expliziten Löschen: Cleanup sichern.
    registerCleanup(pageData.path);

    // --- Create ---
    const createdPath = await sitesConsole.createPage({
      parentPath: cfg.playgroundPath,
      name: pageData.name,
      title: pageData.title,
    });
    expect(createdPath).toBe(pageData.path);

    // --- Read / Open ---
    await sitesConsole.expectPageVisible(pageData.path);

    // --- Update (Titel ändern, Schreibweg mit Pfad-Guard) ---
    await sitesConsole.setTitle(pageData.path, `${pageData.title} (geändert)`);

    // --- Delete (Weg 1: Action-Menü "..." -> Löschen) ---
    await sitesConsole.deletePage(pageData.path);
    await sitesConsole.expectPageAbsent(pageData.path);
  });

  test('Seite löschen über Tastatur-Shortcut (Backspace)', async ({
    sitesConsole,
    makeTestPage,
    registerCleanup,
  }) => {
    const cfg = getAemConfig();
    const pageData = makeTestPage('seiten-loeschen-backspace');
    registerCleanup(pageData.path);

    await sitesConsole.createPage({
      parentPath: cfg.playgroundPath,
      name: pageData.name,
      title: pageData.title,
    });
    await sitesConsole.expectPageVisible(pageData.path);

    // --- Delete (Weg 2: dokumentierter Backspace-Shortcut) ---
    await sitesConsole.deletePageViaKeyboard(pageData.path);
    await sitesConsole.expectPageAbsent(pageData.path);
  });
});
