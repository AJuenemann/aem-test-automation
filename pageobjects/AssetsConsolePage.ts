import { Page, Locator, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { getAemConfig, assertWithinPlayground } from '../config/env.js';

/**
 * Page Object für die Assets-Konsole (/assets.html). Schreiben nur in der
 * DAM-Spielwiese (AEM_DAM_PLAYGROUND_PATH), Pfad-Guard wie bei Seiten.
 *
 * Vorfall 18.11.2026 (docs/DEV-asset-geloescht-wiederhergestellt-20261118.md):
 * In der Kartenansicht traf die Auswahl per Hover eine fremde Karte. Deshalb:
 * - Tests arbeiten in einem eigenen Testordner, angelegt und gelöscht von uns.
 * - Ausgewählt wird nur in der Spaltenansicht (eindeutige Zeile je Eintrag).
 * - Vor dem Löschen muss genau der eigene Eintrag ausgewählt sein.
 */
export class AssetsConsolePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async open(folderPath: string): Promise<void> {
    await this.page.goto(`${getAemConfig().baseUrl}/assets.html${folderPath}`, { waitUntil: 'networkidle' });
    await expect(this.page.locator('coral-shell')).toBeVisible({ timeout: 20_000 });
  }

  item(assetPath: string): Locator {
    return this.page.locator(`[data-foundation-collection-item-id="${assetPath}"]`);
  }

  /** Schaltet die Konsole auf eine Ansicht um (z.B. „Spaltenansicht"). */
  private async switchView(label: 'Spaltenansicht' | 'Kartenansicht'): Promise<void> {
    const icon = label === 'Spaltenansicht' ? 'viewColumn' : 'viewCard';
    const cycle = this.page.locator('coral-cyclebutton:has(coral-cyclebutton-item[icon="viewColumn"])').first();
    if ((await cycle.locator('button').first().getAttribute('icon')) === icon) return;
    await cycle.locator('button').first().click();
    await this.page.locator(`coral-cyclebutton-item[icon="${icon}"]:visible, coral-selectlist-item:has-text("${label}"):visible`).first().click();
    await this.page.waitForLoadState('networkidle');
  }

  /** Öffnet den Elternordner in der Spaltenansicht und wählt `path` aus. */
  private async selectInColumnView(path: string): Promise<Locator> {
    await this.open(path.substring(0, path.lastIndexOf('/')));
    await this.switchView('Spaltenansicht');
    const row = this.page.locator(`coral-columnview-item[data-foundation-collection-item-id="${path}"]`);
    await expect(row).toBeVisible({ timeout: 20_000 });
    // Wie in der Sites-Konsole: Ein zu früher Klick setzt `selected`, die
    // Action-Bar erscheint aber nicht. Dann abwählen und erneut auswählen.
    const actionBar = this.page.locator('coral-actionbar-primary button[icon="more"]:visible');
    for (let attempt = 0; attempt < 4; attempt++) {
      if ((await row.getAttribute('selected')) === null) {
        await row.locator('coral-columnview-item-thumbnail').click();
      }
      const barShown = await actionBar.first().waitFor({ state: 'visible', timeout: 5000 }).then(() => true, () => false);
      if (barShown && (await this.onlySelected(path))) return row;
      if ((await row.getAttribute('selected')) !== null) {
        await row.locator('coral-columnview-item-thumbnail').click(); // abwählen
      }
      await this.page.waitForTimeout(1000);
    }
    throw new Error(`Auswahl von ${path} gelang nicht, Abbruch.`);
  }

  private async onlySelected(path: string): Promise<boolean> {
    const selected = await this.page
      .locator('coral-columnview-item[selected]')
      .evaluateAll((l) => l.map((e) => e.getAttribute('data-foundation-collection-item-id')));
    return selected.length === 1 && selected[0] === path;
  }

  /** Legt einen Ordner über „Erstellen" -> „Ordner" an. Gibt den Pfad zurück. */
  async createFolder(parentPath: string, name: string, title: string): Promise<string> {
    const folderPath = `${parentPath}/${name}`;
    assertWithinPlayground(folderPath);
    await this.open(parentPath);
    await this.page.locator('button[trackingelement="create"]:visible').first().click();
    await this.page.locator('coral-popover[open]').getByText('Ordner', { exact: true }).click();
    const dialog = this.page.locator('coral-dialog[open]');
    await dialog.locator('input[name="./jcr:content/jcr:title"]').fill(title);
    await dialog.locator('input[name=":name"]').fill(name);
    await dialog.getByRole('button', { name: 'Erstellen' }).click();
    await expect(dialog).toHaveCount(0, { timeout: 20_000 });
    const res = await this.page.request.get(`${getAemConfig().baseUrl}${folderPath}.json`);
    expect(res.status(), `Ordner ${folderPath} nicht angelegt`).toBe(200);
    return folderPath;
  }

  /**
   * Lädt eine Datei über „Erstellen" -> „Dateien" in einen Ordner hoch.
   * `fileName` wird der Asset-Name (Dateiauswahl mit Puffer).
   */
  async upload(folderPath: string, localFile: string, fileName: string, mimeType: string): Promise<string> {
    const assetPath = `${folderPath}/${fileName}`;
    assertWithinPlayground(assetPath);
    await this.open(folderPath);
    await this.page.locator('button[trackingelement="create"]:visible').first().click();
    const chooser = this.page.waitForEvent('filechooser');
    await this.page.locator('coral-popover[open]').getByText('Dateien', { exact: true }).click();
    await (await chooser).setFiles({ name: fileName, mimeType, buffer: readFileSync(localFile) });
    const dialog = this.page.locator('coral-dialog[open]');
    await expect(dialog).toContainText('Assets hochladen', { timeout: 15_000 });
    await dialog.getByRole('button', { name: 'Hochladen' }).click();
    await expect(this.item(assetPath)).toBeVisible({ timeout: 60_000 });
    return assetPath;
  }

  /**
   * Wartet, bis die Karte des Assets die Bildmaße zeigt. Die Maße schreibt
   * erst der Workflow „DAM Update Asset", die Prüfung belegt also auch ihn.
   * Nur im eigenen Testordner nutzen (dort ist es die einzige Karte).
   */
  async expectDimensions(assetPath: string, dimensions: string, timeoutMs = 120_000): Promise<void> {
    const folder = assetPath.substring(0, assetPath.lastIndexOf('/'));
    await expect
      .poll(
        async () => {
          await this.open(folder);
          await this.switchView('Kartenansicht');
          return (await this.item(assetPath).textContent().catch(() => '')) ?? '';
        },
        { timeout: timeoutMs, intervals: [5000] },
      )
      .toMatch(new RegExp(dimensions.replace(/ /g, '\\s*')));
  }

  /**
   * Verweis-Anzahl auf der Karte des Assets (Kartenansicht, Diag DEV 24.11.2026).
   * AEM ermittelt sie per Suche, sie erscheint verzögert: daher bis zum Wert abfragen.
   */
  async expectReferenceCount(assetPath: string, count: number, timeoutMs = 120_000): Promise<void> {
    const folder = assetPath.substring(0, assetPath.lastIndexOf('/'));
    await expect
      .poll(
        async () => {
          await this.open(folder);
          await this.switchView('Kartenansicht');
          return this.item(assetPath).first().locator('coral-card-property[title="Verweise"]').getAttribute('data-references').catch(() => null);
        },
        { message: `Verweise von ${assetPath} sind nicht ${count}.`, timeout: timeoutMs, intervals: [5000] },
      )
      .toBe(String(count));
  }

  /** Sucht über die Omnisearch der Konsole (Lupe im Header) und liefert, ob `assetPath` als Treffer erscheint. */
  async searchFinds(term: string, assetPath: string): Promise<boolean> {
    await this.open(getAemConfig().damPlaygroundPath);
    await this.page.locator('coral-shell-header button[icon="search"], button.granite-omnisearch-action, [icon="search"]:visible').first().click();
    const input = this.page
      .locator('input.granite-omnisearch-typeahead-input:visible, .granite-omnisearch-overlay input[type="search"]:visible, .granite-omnisearch-overlay input:visible')
      .first();
    await input.fill(term);
    await input.press('Enter');
    await this.page.waitForLoadState('networkidle');
    return this.page
      .locator(`[data-foundation-collection-item-id="${assetPath}"]:visible`)
      .first()
      .waitFor({ state: 'visible', timeout: 30_000 })
      .then(() => true, () => false);
  }

  /**
   * Löscht einen Eintrag (Ordner oder Asset) über die Spaltenansicht des
   * Elternordners. Bricht ab, wenn nicht genau dieser Eintrag ausgewählt ist.
   * Idempotent: fehlt der Eintrag, passiert nichts.
   */
  async deleteEntry(path: string): Promise<void> {
    assertWithinPlayground(path);
    const res = await this.page.request.get(`${getAemConfig().baseUrl}${path}.json`);
    if (res.status() === 404) return;
    const row = await this.selectInColumnView(path);
    // „Löschen" liegt im Overflow-Menü „•••" der Action-Bar (Diag 18.11.2026).
    await this.page.locator('coral-actionbar-primary button[icon="more"]:visible').click();
    const del = this.page.locator('coral-popover[open] button[trackingelement="delete"]');
    await expect(del).toBeVisible({ timeout: 10_000 });
    if (!(await this.onlySelected(path))) throw new Error(`Auswahl ist nicht ${path}, Abbruch ohne Löschen.`);
    await del.click();
    const confirm = this.page.locator('coral-dialog[open] button').filter({ hasText: /^(Löschen|Delete)$/ });
    await confirm.last().click();
    // Bei Inhalten mit Verweisen folgt „Löschen erzwingen". Auswahl ist geprüft.
    const force = this.page.locator('coral-dialog[open]').filter({ hasText: /Löschen erzwingen/ });
    await expect
      .poll(async () => (await row.count()) === 0 || (await force.isVisible()), { timeout: 20_000 })
      .toBe(true);
    if (await force.isVisible()) await force.locator('button').filter({ hasText: /^Löschen$/ }).click();
    await expect(row).toHaveCount(0, { timeout: 30_000 });
  }
}
