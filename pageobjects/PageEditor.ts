import { Page, FrameLocator, Locator, expect } from '@playwright/test';
import { getAemConfig } from '../config/env.js';

/**
 * Page Object für den AEM Page-Editor (/editor.html).
 *
 * Besonderheit: Der eigentliche Seiteninhalt wird in einem iFrame
 * (#ContentFrame) gerendert. Interaktionen mit Komponenten laufen daher über
 * `contentFrame()` (frameLocator), die Editor-Chrome-Elemente (Toolbar,
 * Seitenleisten) liegen im Hauptdokument.
 */
export class PageEditor {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  private baseUrl(): string {
    return getAemConfig().baseUrl;
  }

  /** Öffnet eine Seite im Editor. */
  async open(contentPath: string): Promise<void> {
    // NICHT networkidle: der Editor hält Dauerverbindungen (Autosave-Polling/
    // Heartbeat), sodass das Netzwerk nie 500ms ruhig wird -> goto läuft in den
    // Timeout (unter Last verifiziert). Stattdessen domcontentloaded navigieren
    // und zustandsbasiert auf den Content-iFrame warten (gegen TEST verifiziert:
    // ContentFrame nach ~1,4s sichtbar).
    await this.page.goto(`${this.baseUrl()}/editor.html${contentPath}.html`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(this.contentFrameRoot()).toBeVisible({ timeout: 30_000 });
  }

  /**
   * Öffnet die gerenderte Seitenansicht (ohne Editor-Chrome) über
   * `?wcmmode=disabled`. Grundlage für die visuelle Regression, da hier das
   * tatsächliche Besucher-Rendering sichtbar ist.
   */
  async openRendered(contentPath: string): Promise<void> {
    const response = await this.page.goto(`${this.baseUrl()}${contentPath}.html?wcmmode=disabled`, {
      waitUntil: 'networkidle',
    });
    // Klarer Fehler statt eines irreführenden Screenshot-Diffs gegen eine Sling-Fehlerseite.
    if (response && !response.ok()) {
      throw new Error(`Gerenderte Seite ${contentPath} liefert HTTP ${response.status()} (Seite fehlt oder Fehler).`);
    }
  }

  /** Der iFrame, in dem der Seiteninhalt gerendert wird. */
  contentFrame(): FrameLocator {
    return this.page.frameLocator('#ContentFrame');
  }

  private contentFrameRoot(): Locator {
    return this.page.locator('#ContentFrame');
  }

  /**
   * Fügt eine Komponente über den Platzhalter "Komponente hierher ziehen" und
   * den Komponentenbrowser ein. `componentHint` filtert die Komponente in der
   * Auswahl (z.B. "Text").
   */
  /**
   * Fügt eine Komponente in den generischen Parsys ein. Verifizierter Flow
   * gegen TEST:
   *  1. Platzhalter-Overlay ("Komponenten hierher ziehen") anklicken -> der
   *     "+"-Button (icon="add") erscheint.
   *  2. "+" klicken -> Insert-Dialog mit Komponentenliste öffnet sich.
   *  3. Komponente per Name wählen.
   *
   * Hinweis: Die konkrete Vorlage bestimmt, welche Komponenten verfügbar sind
   * (AEM_TEST_COMPONENT konfiguriert den Namen). Eine generische "Text"-
   * Komponente existiert in der Fraunhofer-Vorlage nicht.
   */
  async insertComponent(componentName: string, opts: { parsysPath?: string } = {}): Promise<void> {
    // HAUPT-Parsys gezielt treffen (nicht das Bühnen-Parsys). Gegen TEST
    // verifiziert: Die Seite hat zwei Platzhalter — Bühne (data-path .../stage/
    // stageParsys/*) und Haupt-Inhalt (data-path .../contentPar/*, Text
    // "Komponenten hierher ziehen"). Im Bühnen-Parsys ist "Verweis" nicht
    // verfügbar -> Insert-Suche bleibt leer. Daher den contentPar-Platzhalter
    // bevorzugen; Fallback auf den benannten "Komponenten"-Platzhalter, zuletzt
    // irgendeinen sichtbaren (robust gegen Vorlagen ohne contentPar).
    const mainParsys = this.page.locator('.cq-Overlay--placeholder[data-path*="/contentPar/"]').first();
    // Zuerst auf den contentPar-Platzhalter WARTEN (die Overlay-Schicht lädt
    // asynchron). Früher wich der Code sofort auf einen Fallback aus, wenn
    // contentPar noch 0 war -> dann landete der Insert im Bühnen-Parsys
    // (stageParsys), wo "Verweis" fehlt. Gegen TEST verifiziert: contentPar ist
    // der richtige Zielbereich.
    let target = mainParsys;
    if (opts.parsysPath) {
      // Gezielter Container, z.B. der innere Parsys einer FAQ.
      target = this.page.locator(`.cq-Overlay--placeholder[data-path="${opts.parsysPath}/*"]`);
      await expect(target).toBeVisible({ timeout: 30_000 });
    } else try {
      await expect(mainParsys).toBeVisible({ timeout: 20_000 });
    } catch {
      // Vorlage ohne contentPar: Fallback auf benannten/ersten Platzhalter.
      const named = this.page.locator(
        '.cq-Overlay--placeholder[data-text*="Komponenten" i], .cq-Overlay--placeholder[data-text*="component" i]',
      );
      target = (await named.count()) ? named.first() : this.page.locator('.cq-Overlay--placeholder').first();
      await expect(target).toBeVisible({ timeout: 10_000 });
    }
    // Overlay ist ein div[role=button] ("not enabled" für Playwright):
    // hover()+click({force}) statt Koordinaten-Klick. Hover blendet die
    // Aktionen des Platzhalters ein.
    await target.hover({ force: true });
    await target.click({ force: true });

    // "+"-Button (icon="add") erscheint auf dem aktivierten Platzhalter.
    const plus = this.page.locator('button[icon="add"]:visible').first();
    await plus.click({ timeout: 10_000 });

    // Insert-Dialog mit Komponentenliste.
    const dialog = this.page.locator('coral-dialog[open]').first();
    await expect(dialog).toBeVisible({ timeout: 15_000 });

    // Komponente per Suchfeld filtern (falls vorhanden), dann wählen.
    const search = dialog.locator('input[type="search"], input[is="coral-textfield"]').first();
    if (await search.count()) {
      await search.fill(componentName);
    }
    // Zustandsbasiert auf den gefilterten Eintrag warten, bevor geklickt wird.
    // Fester Sleep reicht unter Last nicht: die Liste wird nach dem Tippen
    // asynchron neu gefüllt; ein zu früher Klick traf eine noch leere Liste
    // (gegen TEST verifiziert: "Verweis" existiert und ist genau 1 Treffer).
    const item = dialog
      .locator('coral-selectlist-item', { hasText: componentName })
      .first();
    await expect(item).toBeVisible({ timeout: 15_000 });
    await item.click();

    // Warten, bis die Komponente als Overlay erscheint.
    await expect(this.componentOverlay(componentName)).toBeVisible({ timeout: 15_000 });
  }

  /**
   * Öffnet den Konfigurationsdialog einer Komponente (Overlay per Pfad), füllt
   * Felder per Name (z.B. `./headline`) und schließt mit „Fertig".
   */
  async configureComponent(componentPath: string, values: Record<string, string>): Promise<void> {
    const overlay = this.page.locator(`.cq-Overlay--component[data-path="${componentPath}"]`);
    await expect(overlay).toBeVisible({ timeout: 30_000 });
    const configure = this.page.locator('#EditableToolbar button[data-action="CONFIGURE"]');
    for (let attempt = 0; attempt < 3 && !(await configure.isVisible()); attempt++) {
      await overlay.hover({ force: true });
      await overlay.click({ force: true });
      await configure.waitFor({ state: 'visible', timeout: 3000 }).catch(() => undefined);
    }
    await configure.click();
    const dialog = this.page.locator('coral-dialog[open]');
    await expect(dialog).toBeVisible({ timeout: 20_000 });
    for (const [name, value] of Object.entries(values)) {
      const field = dialog.locator(`input[name="${name}"], textarea[name="${name}"]`).first();
      await expect(field).toBeVisible({ timeout: 15_000 });
      await field.fill(value);
    }
    await dialog.getByRole('button', { name: /^(Fertig|Done)$/ }).click();
    await expect(dialog).toHaveCount(0, { timeout: 20_000 });
  }

  /** Overlay einer eingefügten Komponente im Editor (Hauptdokument). */
  componentOverlay(componentName: string): Locator {
    return this.page.locator(`.cq-Overlay--component[title="${componentName}"]`).first();
  }

  /**
   * Entfernt eine Komponente über ihre Editable-Toolbar (Lösch-Aktion).
   * Schließt zuvor etwaige offene Dialoge, damit das Overlay klickbar ist.
   */
  async deleteComponent(componentName: string): Promise<void> {
    // Etwaige offene Dialoge schließen (manche Komponenten öffnen nach Insert
    // direkt ihren Konfigurationsdialog).
    const openDialog = this.page.locator('coral-dialog[open]').first();
    if (await openDialog.count()) {
      await this.page.keyboard.press('Escape').catch(() => undefined);
      await this.page.waitForTimeout(500);
    }

    // Komponente selektieren: Das Overlay ist ein div[role=button], das
    // Playwright als "not enabled" einstuft. hover()+click({force}) ist der
    // stabile, elementbasierte Weg (kein Koordinaten-Klick). Der Hover ist
    // nötig, damit AEM die Editable-Toolbar einblendet (verifiziert gegen TEST).
    const overlay = this.componentOverlay(componentName);
    const toolbar = this.page.locator('#EditableToolbar');

    // Hover + force-Klick blendet die Editable-Toolbar ein. Bis zu 3x versuchen,
    // bis die Toolbar sichtbar ist (verifiziert gegen TEST: Hover ist nötig).
    for (let attempt = 0; attempt < 3; attempt++) {
      await overlay.hover({ force: true });
      await this.page.waitForTimeout(400);
      await overlay.click({ force: true });
      await this.page.waitForTimeout(600);
      const visible = await toolbar.evaluate((el) => (el as HTMLElement).offsetParent !== null).catch(() => false);
      if (visible) break;
    }

    // Lösch-Aktion in der Editable-Toolbar.
    const deleteAction = toolbar.locator('button[data-action="DELETE"]').first();
    await expect(deleteAction).toBeVisible({ timeout: 10_000 });
    await deleteAction.click();

    // Bestätigungsdialog "...ausgewählten Komponenten zu löschen" mit
    // [Abbrechen, Löschen]. Gezielt den bestätigenden "Löschen"-Button klicken
    // (exakter Text, nicht die Dialog-Überschrift).
    const dialog = this.page.locator('coral-dialog[open]').first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await dialog.getByRole('button', { name: /^(Löschen|Delete)$/ }).first().click();

    await expect(overlay).toHaveCount(0, { timeout: 15_000 });
  }
}
