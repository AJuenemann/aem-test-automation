import { test, expect } from '../../fixtures/test-fixtures.js';
import { getAemConfig } from '../../config/env.js';

/**
 * MVP Task 4 - Komponenten-Lebenszyklus im Page-Editor (Option A):
 * Komponente einfügen -> ist sichtbar -> entfernen -> ist weg.
 *
 * Bewusst OHNE tiefes Bearbeiten des Komponentendialogs: die Fraunhofer-Vorlage
 * hat keine generische Text-Komponente, und jede Komponente hat eigene Felder.
 * Das komponentenspezifische Editieren folgt, sobald die fachliche
 * Komponenten-Priorisierung geklärt ist (offener Punkt laut Projektdokumenten).
 *
 * Verwendete Komponente konfigurierbar über AEM_TEST_COMPONENT (Default: Verweis),
 * da sie in der getesteten Vorlage verfügbar sein muss.
 */
const COMPONENT = process.env.AEM_TEST_COMPONENT?.trim() || 'Verweis';

test.describe('AEM-Basis: Komponente einfügen und entfernen', { tag: '@level1' }, () => {
  test('Komponente hinzufügen und wieder entfernen', async ({
    sitesConsole,
    pageEditor,
    makeTestPage,
    registerCleanup,
  }) => {
    // Mehrstufiger Flow (Konsole + Editor + Insert + Delete, je mit Retries)
    // braucht unter Last mehr als die Standard-30s. Analog zur Versionierung.
    test.setTimeout(120_000);
    const cfg = getAemConfig();
    const pageData = makeTestPage('komponente-einfuegen-entfernen');
    registerCleanup(pageData.path);

    // Vorbedingung: Seite anlegen.
    await sitesConsole.createPage({
      parentPath: cfg.playgroundPath,
      name: pageData.name,
      title: pageData.title,
    });

    // Seite im Editor öffnen.
    await pageEditor.open(pageData.path);

    // --- Einfügen ---
    await pageEditor.insertComponent(COMPONENT);
    await expect(pageEditor.componentOverlay(COMPONENT)).toBeVisible();

    // --- Entfernen ---
    await pageEditor.deleteComponent(COMPONENT);
    await expect(pageEditor.componentOverlay(COMPONENT)).toHaveCount(0);
  });
});
