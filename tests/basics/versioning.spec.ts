import { test, expect } from '../../fixtures/test-fixtures.js';
import { getAemConfig } from '../../config/env.js';

/**
 * MVP Task 5 - Versionierung: Version erstellen und wiederherstellen.
 *
 * Ablauf:
 *  1. Seite anlegen, Text A setzen.
 *  2. Version "v1" speichern.
 *  3. Text auf B ändern.
 *  4. Version "v1" wiederherstellen -> Inhalt muss wieder A sein (Rollback).
 */
test.describe('AEM-Basis: Versionierung', { tag: '@level1' }, () => {
  test('Version erstellen und wiederherstellen', async ({
    sitesConsole,
    pageEditor,
    makeTestPage,
    registerCleanup,
  }) => {
    // Mehrstufiger Flow (Konsole + Editor + Timeline) braucht mehr Zeit.
    test.setTimeout(120_000);
    const cfg = getAemConfig();
    const pageData = makeTestPage('versionierung');
    registerCleanup(pageData.path);

    const component = process.env.AEM_TEST_COMPONENT?.trim() || 'Verweis';

    // 1) Seite anlegen (Ausgangszustand: ohne Zusatzkomponente).
    await sitesConsole.createPage({
      parentPath: cfg.playgroundPath,
      name: pageData.name,
      title: pageData.title,
    });

    // 2) Version des Ausgangszustands speichern (über die Zeitachse der Konsole).
    await sitesConsole.createVersion(pageData.path, 'v1');

    // 3) Seite verändern: Komponente im Editor einfügen.
    await pageEditor.open(pageData.path);
    await pageEditor.insertComponent(component);
    await expect(pageEditor.componentOverlay(component)).toBeVisible();

    // 4) Version wiederherstellen -> Komponente muss wieder weg sein (Rollback).
    await sitesConsole.restoreVersion(pageData.path);
    await pageEditor.open(pageData.path);
    await expect(pageEditor.componentOverlay(component)).toHaveCount(0, { timeout: 20_000 });
  });
});
