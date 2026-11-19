import { Page, Locator, expect } from '@playwright/test';

/**
 * Page Object fuer die Fraunhofer-Overlay-Regressionstests (JET-Antwort zu 7.).
 *
 * Geprueft werden die konkret genutzten Overlays:
 *  - Asset-Finder-Suchen "Visitenkarten" und "Externe Links",
 *  - Asset-Feld (Drag & Drop aus dem Asset-Finder) im Download-Dialog.
 * Baum-Wiederherstellen liegt in der Konsole: SitesConsolePage.openRestoreTreeForm.
 *
 * Selektoren per Diag gegen DEV verifiziert (11/2026).
 */
export class OverlayChecks {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Öffnet den Asset-Finder (Seitenbedienfeld, Reiter "Assets"), wählt in der
   * Typauswahl den Fraunhofer-Eintrag (z.B. "Visitenkarten", "Externe Links")
   * und liefert die data-path-Werte der Ergebniskarten (leer = keine Treffer).
   * Gegen DEV verifiziert (Diag 16.11.2026): die Fraunhofer-Suchen sind Einträge
   * von coral-select[name="assetfilter_type_selector"], keine eigenen Tabs.
   */
  async assetFinderSearch(typeLabel: string): Promise<string[]> {
    const sidePanel = this.page.locator('#SidePanel');
    const opened = await sidePanel
      .evaluate((el) => el.classList.contains('sidepanel-opened'))
      .catch(() => false);
    if (!opened) {
      await this.page.locator('#sidepanel-toggle-button').click();
    }
    await sidePanel.getByRole('tab', { name: 'Assets' }).click().catch(() => undefined);

    const cards = sidePanel.locator('.editor-Card-asset[data-path]');
    const readPaths = () => cards.evaluateAll((els) => els.map((el) => el.getAttribute('data-path') ?? ''));
    // Vorher sichtbare Treffer (Standardtyp "Bilder") merken: nach der Auswahl
    // stehen sie kurz noch da, bis die neue Liste geladen ist.
    await cards.first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined);
    const before = new Set(await readPaths());

    const typeSelect = sidePanel.locator('coral-select[name="assetfilter_type_selector"]');
    await typeSelect.locator('button').first().click();
    await typeSelect.locator('coral-selectlist-item', { hasText: typeLabel }).first().click();

    // Zustandsbasiert warten, bis die Ergebnisliste neu geladen ist (erster
    // Treffer ist keiner der vorherigen). Danach die neue Liste liefern.
    await expect
      .poll(async () => {
        const now = await readPaths();
        return now.length > 0 && !before.has(now[0]);
      }, { timeout: 20_000 })
      .toBe(true)
      .catch(() => undefined);
    return readPaths();
  }

  /** Öffnet das Seitenbedienfeld (Asset-Finder), falls noch zu. */
  async openSidePanel(): Promise<void> {
    const opened = await this.page
      .locator('#SidePanel')
      .evaluate((el) => el.classList.contains('sidepanel-opened'))
      .catch(() => false);
    if (!opened) {
      await this.page.locator('#sidepanel-toggle-button').click();
    }
    await this.assetCards().first().waitFor({ state: 'visible', timeout: 20_000 });
  }

  /** Ergebniskarten im Asset-Finder (ziehbar, mit DAM-Pfad in data-path). */
  assetCards(): Locator {
    return this.page.locator('#SidePanel .editor-Card-asset[data-path]');
  }

  /** Asset-Feld (coral-fileupload) im offenen Konfig-Dialog. */
  private assetField(): Locator {
    return this.page.locator('coral-dialog[open] coral-fileupload').first();
  }

  /**
   * Aktuell referenziertes Asset des Felds (verstecktes ./fileReference; leer =
   * kein Asset). Gegen DEV verifiziert: spiegelt Entfernen/Setzen/Ersetzen exakt.
   */
  async fileReference(): Promise<string> {
    return this.page
      .locator('coral-dialog[open] input[name="./fileReference"]')
      .first()
      .inputValue({ timeout: 5_000 });
  }

  /** Entfernt das Asset über den Button Entfernen im Asset-Feld. */
  async clearAssetField(): Promise<void> {
    await this.assetField().getByRole('button', { name: 'Entfernen' }).click();
    await expect.poll(() => this.fileReference(), { timeout: 10_000 }).toBe('');
  }

  /**
   * Zieht die n-te Karte aus dem Asset-Finder per Drag & Drop in das Asset-Feld
   * (Redakteursweg). Gibt den DAM-Pfad der gezogenen Karte zurück.
   * Vorbedingung: Seitenbedienfeld war VOR dem Dialog geöffnet (bei offenem
   * Dialog blockiert der modale Hintergrund den Bedienfeld-Schalter).
   */
  async dragAssetIntoField(index: number): Promise<string> {
    const card = this.assetCards().nth(index);
    const assetPath = (await card.getAttribute('data-path')) ?? '';
    await card.dragTo(this.assetField());
    await expect.poll(() => this.fileReference(), { timeout: 10_000 }).toBe(assetPath);
    return assetPath;
  }
}
