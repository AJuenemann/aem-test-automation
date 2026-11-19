import { Page, Locator, expect } from '@playwright/test';
import { getAemConfig, assertWithinPlayground } from '../config/env.js';

/**
 * Page Object fuer den Fraunhofer-LDAP-Visitenkartenimport (JET zu 5./6.).
 *
 * Redakteursweg (gegen TEST verifiziert, 11/2026):
 *  1. Tools (/miscadmin) -> fraunhofer/adminpages -> "LDAP Business Card Import"
 *     selektieren und doppelklicken. Die Importseite oeffnet in einem NEUEN Tab
 *     (/etc/fraunhofer/adminpages/ldap-business-card-import.html).
 *  2. Suchfelder firstname/lastname, Button "Search", Treffer als .x-grid3-row.
 *  3. Gruenes Plus (img.x-action-col-icon) -> Dialog mit Feld "path"
 *     (Default /content/businesscards/<Institut>/<name>) und "Import"/"Abbrechen".
 *
 * LDAP ist nur in TEST angebunden.
 */
const TOOL_NODE = 'LDAP Business Card Import';

export class LdapImportPage {
  readonly page: Page;
  /** Tab der Importseite, gesetzt durch openFromTools(). */
  private importTab: Page | null = null;

  constructor(page: Page) {
    this.page = page;
  }

  private tab(): Page {
    if (!this.importTab) throw new Error('LdapImportPage: erst openFromTools() aufrufen.');
    return this.importTab;
  }

  /** Öffnet die Importseite per Doppelklick im Tools-Baum (wie ein Redakteur). */
  async openFromTools(): Promise<void> {
    const node = this.page.locator('.x-tree-node-el', { hasText: TOOL_NODE }).first().locator('a.x-tree-node-anchor span').first();
    // Der Baum klappt den Hash-Pfad asynchron auf; unter Last gelegentlich nicht -> einmal neu laden.
    for (let attempt = 0; ; attempt++) {
      await this.page.goto(`${getAemConfig().baseUrl}/miscadmin#/etc/fraunhofer/adminpages`, { waitUntil: 'networkidle' });
      try {
        await node.waitFor({ state: 'visible', timeout: 30_000 });
        break;
      } catch (err) {
        if (attempt === 1) throw err;
      }
    }
    // Erst selektieren und Laden abwarten: der Klick rendert den Knoten neu, ein
    // sofortiger Doppelklick landet sonst auf dem alten Element und öffnet nichts.
    await node.click();
    await this.page.waitForLoadState('networkidle');
    const popup = this.page.context().waitForEvent('page', { timeout: 15_000 });
    await node.dblclick();
    this.importTab = await popup;
    await this.importTab.waitForLoadState('networkidle');
    await expect(this.importTab.locator('input[name="firstname"]')).toBeVisible({ timeout: 30_000 });
  }

  /** Sucht per Vorname, liefert die Trefferzeilen. */
  async searchByFirstName(firstName: string): Promise<Locator> {
    const t = this.tab();
    await t.locator('input[name="firstname"]').fill(firstName);
    await t.getByRole('button', { name: 'Search' }).click();
    const rows = t.locator('.x-grid3-row');
    await rows.first().waitFor({ state: 'visible', timeout: 30_000 });
    return rows;
  }

  /** Öffnet über das Plus-Icon den Import-Dialog der Zeile und liefert ihn. */
  async openImportDialog(row: Locator): Promise<Locator> {
    await row.locator('img.x-action-col-icon').click();
    const dialog = this.tab().locator('.x-window:visible', { hasText: 'Business card import of' }).first();
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    return dialog;
  }

  /**
   * Setzt den Zielpfad (nur Spielwiese), startet den Import und liefert den
   * Seitenpfad der Karte aus der Erfolgsmeldung ('… successfully imported to
   * "<pfad>/jcr:content/businesscard"'). Gelöscht wird nur dieser.
   */
  async importTo(dialog: Locator, targetPath: string): Promise<string> {
    assertWithinPlayground(targetPath);
    await dialog.locator('input[name="path"]').fill(targetPath);
    await dialog.getByRole('button', { name: 'Import', exact: true }).click();
    const t = this.tab();
    const success = t.getByText(/successfully imported to/).first();
    const failure = t.getByText(/Server side error|Validation failed/).first();
    await expect(success.or(failure), 'Keine Rückmeldung zum Import.').toBeVisible({ timeout: 60_000 });
    const text = (await success.textContent().catch(() => null)) ?? '';
    const imported = /imported to "([^"]+)"/.exec(text)?.[1];
    if (!imported) {
      throw new Error(`Import fehlgeschlagen: ${(await failure.textContent().catch(() => '')) || text}`);
    }
    // Gemeldet wird die Komponente (…/<karte>/jcr:content/businesscard); die Karte ist die Seite davor.
    return imported.split('/jcr:content')[0];
  }

  /** Schließt den Import-Tab. */
  async close(): Promise<void> {
    await this.importTab?.close();
    this.importTab = null;
  }

  /** Für Diagnose/Rückmeldung: sichtbare Meldungsfenster im Import-Tab. */
  async visibleMessages(): Promise<string[]> {
    return this.tab().locator('.x-window:visible').allInnerTexts();
  }
}
