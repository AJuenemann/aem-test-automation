import { Page, Locator, expect } from '@playwright/test';
import { getAemConfig, assertWithinPlayground } from '../config/env.js';

/**
 * Page Object für die AEM Sites-Konsole (/sites.html).
 * Kapselt Navigation sowie Erstellen, Finden, Öffnen und Löschen von Seiten.
 *
 * Alle schreibenden Operationen verlaufen über den Pfad-Guard und sind damit
 * auf die konfigurierte Spielwiese (AEM_PLAYGROUND_PATH) beschränkt.
 */
export class SitesConsolePage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  private baseUrl(): string {
    return getAemConfig().baseUrl;
  }

  /** Öffnet die Sites-Konsole für den angegebenen Inhaltspfad. */
  async open(contentPath: string): Promise<void> {
    // networkidle statt domcontentloaded: AEMs Columnview bindet ihre JS-Handler
    // (u.a. die Selektionslogik, die die Action-Bar einblendet) erst nach dem
    // asynchronen Nachladen. Zu frühes Klicken setzt zwar das selected-Attribut,
    // triggert aber nicht den Selektionsmodus. Verifiziert gegen TEST.
    await this.page.goto(`${this.baseUrl()}/sites.html${contentPath}`, {
      waitUntil: 'networkidle',
    });
    await expect(this.page.locator('coral-shell, .granite-shell, #granite-shell')).toBeVisible({
      timeout: 20_000,
    });
  }

  /**
   * Erstellt eine Seite via Sites-Konsolen-UI unterhalb von `parentPath`.
   * Nutzt die Standard-Vorlagenauswahl. Gibt den vollständigen Seitenpfad zurück.
   */
  async createPage(params: {
    parentPath: string;
    name: string;
    title: string;
    templateHint?: string;
  }): Promise<string> {
    const { parentPath, name, title, templateHint } = params;
    const targetPath = `${parentPath}/${name}`;
    // Scope-Durchsetzung: nur innerhalb der Spielwiese schreiben.
    assertWithinPlayground(targetPath);

    await this.open(parentPath);

    // "Erstellen" -> "Seite". Gegen TEST verifiziert (Diag-Dump): Der Eintrag ist
    // ein `a[role=menuitem, is=coral-anchorlist-item]`. Entscheidend ist der
    // SCOPE: es gibt mehrere coral-anchorlist im DOM (auch in geschlossenen
    // Popovers mit display=block), die Playwright als "sichtbar" zählt. Nur das
    // tatsächlich offene Popover (`coral-popover[open]`, aria-hidden=false) ist
    // das echte Menü. Ohne diesen Scope trifft .first() einen versteckten
    // Dubletten-Eintrag und das waitFor visible läuft in den Timeout.
    const openPopover = this.page.locator('coral-popover[open]');
    // Per Tastatur geöffnet fehlt den Einträgen `role=menuitem` (Diag 18.11.2026),
    // daher zusätzlich über das Coral-Element suchen.
    const seiteItem = openPopover
      .locator('a[is="coral-anchorlist-item"], [role="menuitem"]')
      .filter({ hasText: /^\s*(Seite|Page)\s*$/ })
      .first();
    // Unter Last öffnet die träge TEST-Instanz das Create-Popover verzögert
    // (dokumentierter Umgebungs-Flake, siehe AGENTS.md). Mehr Versuche mit
    // kurzer Pause dazwischen; ein evtl. teiloffenes Popover vor dem erneuten
    // "Erstellen"-Klick mit Escape schließen, sonst toggelt der Klick es zu.
    const ATTEMPTS = 5;
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      if (attempt > 0) {
        await this.page.keyboard.press('Escape').catch(() => undefined);
        await this.page.waitForTimeout(800);
      }
      try {
        // Kurzer Klick-Timeout, danach Tastatur-Fallback (siehe clickCreateMenu).
        await this.clickCreateMenu(5000);
        await seiteItem.waitFor({ state: 'visible', timeout: 6000 });
        break;
      } catch {
        if (attempt === ATTEMPTS - 1) {
          throw new Error('Create-Menü: Eintrag "Seite" nicht erschienen.');
        }
      }
    }
    await seiteItem.click();

    // Vorlagen-Auswahl (Create-Page-Wizard). Erste verfügbare Vorlage wählen,
    // optional per Hinweistext filtern.
    const wizard = this.page.locator('.cq-siteadmin-admin-createpage, coral-wizardview');
    await expect(wizard).toBeVisible({ timeout: 20_000 });

    const template = templateHint
      ? wizard.locator('coral-card, .foundation-collection-item', { hasText: templateHint }).first()
      : wizard.locator('coral-card, .foundation-collection-item').first();
    await template.click();

    await this.clickWizardNext();

    // Properties: Titel und Name setzen.
    const titleField = this.page.locator(
      'input[name="./jcr:title"], input[name="pageTitle"], coral-textfield[name="./jcr:title"] input',
    ).first();
    await titleField.fill(title);

    const nameField = this.page.locator('input[name="pageName"], input[name="./pageName"]').first();
    if (await nameField.count()) {
      await nameField.fill(name);
    }

    // Erstellen bestätigen und auf die Server-Antwort warten. Ohne das navigierte
    // der Test unter Last weiter, bevor die Seite existierte (404 im Visual-Test,
    // Trace 16.11.2026: POST createpagewizard noch ohne Antwort).
    const created = this.page.waitForResponse(
      (r) => r.request().method() === 'POST' && r.url().includes('/createpagewizard/'),
      { timeout: 60_000 },
    );
    await this.clickWizardCreate();
    const response = await created;
    if (!response.ok()) {
      throw new Error(`Seite anlegen fehlgeschlagen: HTTP ${response.status()} für ${targetPath}.`);
    }

    // Erfolgsdialog schließen ("Fertig"/"Öffnen" vorhanden).
    const doneButton = this.page
      .locator('coral-dialog button, .coral-Button', { hasText: /^(Fertig|Done)$/ })
      .first();
    if (await doneButton.count()) {
      await doneButton.click().catch(() => undefined);
    }

    return targetPath;
  }

  /** Liefert einen Locator für die Seitenkachel/Zeile anhand des Pfads. */
  pageItem(contentPath: string): Locator {
    return this.page.locator(
      `[data-foundation-collection-item-id="${contentPath}"], ` +
        `coral-card[data-foundation-collection-item-id="${contentPath}"]`,
    );
  }

  /**
   * Öffnet die Konsole am Parent und lädt bei Bedarf neu, bis das (ggf. frisch
   * angelegte) Item in der Spaltenansicht erscheint. Gibt true zurück, wenn
   * gefunden.
   */
  private async openUntilItem(contentPath: string, attempts = 3): Promise<boolean> {
    const parent = contentPath.substring(0, contentPath.lastIndexOf('/'));
    for (let i = 0; i < attempts; i++) {
      await this.open(parent);
      if ((await this.pageItem(contentPath).count()) > 0) {
        return true;
      }
      await this.page.waitForTimeout(1500);
    }
    return false;
  }

  /** Prüft, ob eine Seite in der aktuellen Konsolenansicht existiert. */
  async expectPageVisible(contentPath: string): Promise<void> {
    const found = await this.openUntilItem(contentPath);
    expect(found, `Seite ${contentPath} nicht in der Konsole gefunden.`).toBe(true);
    await expect(this.pageItem(contentPath)).toBeVisible({ timeout: 20_000 });
  }

  /** Prüft, ob eine Seite NICHT mehr existiert. */
  async expectPageAbsent(contentPath: string): Promise<void> {
    const parent = contentPath.substring(0, contentPath.lastIndexOf('/'));
    await this.open(parent);
    await expect(this.pageItem(contentPath)).toHaveCount(0, { timeout: 20_000 });
  }

  /**
   * Löscht eine Seite via Sites-Konsole über das Action-Menü ("..." -> Löschen).
   * Echte Redakteursgeste. Robust gegen "bereits gelöscht" (idempotent).
   *
   * Alternativ steht der Backspace-Shortcut zur Verfügung (siehe deletePageViaKeyboard).
   */
  async deletePage(contentPath: string): Promise<void> {
    assertWithinPlayground(contentPath);

    const item = this.pageItem(contentPath);
    if (!(await this.openUntilItem(contentPath))) {
      return; // nicht (mehr) vorhanden -> idempotent
    }

    await this.selectItem(contentPath);
    await this.assertOnlySelected(contentPath);

    // Action-Menü "..." öffnen und "Löschen" (menuitem im Popover) klicken.
    await this.openActionOverflow();
    await this.page.getByRole('menuitem', { name: /Löschen|Delete/ }).first().click();

    await this.confirmDeleteDialog(item);
  }

  /**
   * Löscht eine Seite über den dokumentierten Tastatur-Shortcut (Backspace).
   * Zweite valide Redakteursgeste; separat testbar.
   */
  async deletePageViaKeyboard(contentPath: string): Promise<void> {
    assertWithinPlayground(contentPath);
    const item = this.pageItem(contentPath);
    if (!(await this.openUntilItem(contentPath))) {
      return;
    }
    await this.selectItem(contentPath);
    await this.assertOnlySelected(contentPath);
    await this.page.keyboard.press('Backspace');
    await this.confirmDeleteDialog(item);
  }

  /**
   * Bricht ab, wenn nicht genau `contentPath` ausgewählt ist. Sicherung vor dem
   * Löschen, weil „Löschen erzwingen" auch Unterseiten entfernt (Vorfall in der
   * DAM 18.11.2026: falsche Karte ausgewählt).
   */
  private async assertOnlySelected(contentPath: string): Promise<void> {
    const selected = await this.page
      .locator('coral-columnview-item[selected]')
      .evaluateAll((l) => l.map((e) => e.getAttribute('data-foundation-collection-item-id')));
    if (selected.length !== 1 || selected[0] !== contentPath) {
      throw new Error(`Löschen: Auswahl ist ${JSON.stringify(selected)} statt ${contentPath}, Abbruch ohne Löschen.`);
    }
  }

  /** Bestätigt den Löschen-Dialog und wartet, bis das Item verschwindet. */
  private async confirmDeleteDialog(item: Locator): Promise<void> {
    const dialog = this.page.locator('coral-dialog[open]').first();
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    const confirm = dialog
      .locator('button')
      .filter({ hasText: /Löschen|Delete|Archivieren/ })
      .last();
    await confirm.click();
    // Hat die Seite Unterseiten, folgt ein zweiter Dialog „Löschen erzwingen"
    // (Diag 18.11.2026). Nur Testseiten der Spielwiese kommen hier an (Guard).
    const force = this.page
      .locator('coral-dialog[open] button')
      .filter({ hasText: /Löschen erzwingen|Force Delete/ });
    // Warten, bis die Seite weg ist oder der zweite Dialog erscheint (bis 20 s).
    await expect
      .poll(async () => (await item.count()) === 0 || (await force.isVisible()), { timeout: 20_000 })
      .toBe(true);
    if (await force.isVisible()) await force.click();

    // Auf Abschluss warten: Item verschwindet.
    await expect(item).toHaveCount(0, { timeout: 20_000 });
  }

  /**
   * Setzt den Seitentitel über die Page-Properties-Ansicht. Läuft wie alle
   * Schreiboperationen durch den Pfad-Guard.
   */
  async setTitle(contentPath: string, title: string): Promise<void> {
    await this.setProperties(contentPath, { './jcr:title': title });
  }

  /** Öffnet „Eigenschaften" einer Seite über die Action-Bar (kein Deep-Link). */
  private async openProperties(contentPath: string): Promise<void> {
    if (!(await this.openUntilItem(contentPath))) {
      throw new Error(`Eigenschaften: Seite ${contentPath} nicht in der Konsole gefunden.`);
    }
    await this.selectItem(contentPath);
    await this.page.locator('button[trackingelement="properties"]:visible').first().click();
    await this.page.waitForURL(/properties\.html/, { timeout: 20_000 });
    await this.page.waitForLoadState('networkidle');
  }

  /** Textfeld der Seiteneigenschaften per Feldname (z.B. `./navTitle`). */
  private propertyField(name: string): Locator {
    return this.page.locator(`input[name="${name}"], textarea[name="${name}"]`).first();
  }

  /**
   * Liest Textfelder der Seiteneigenschaften (Reiter „Allgemein"). Schließt die
   * Ansicht mit „Abbrechen", ohne zu speichern.
   */
  async readProperties(contentPath: string, names: string[]): Promise<Record<string, string>> {
    await this.openProperties(contentPath);
    const values: Record<string, string> = {};
    for (const name of names) {
      await expect(this.propertyField(name)).toBeVisible({ timeout: 20_000 });
      values[name] = await this.propertyField(name).inputValue();
    }
    await this.page.getByRole('button', { name: /^(Abbrechen|Cancel)$/ }).first().click();
    await this.page.waitForURL(/\/sites\.html/, { timeout: 20_000 }).catch(() => undefined);
    return values;
  }

  /**
   * Setzt Textfelder der Seiteneigenschaften (Reiter „Allgemein") und speichert
   * mit „Speichern & schließen". Läuft durch den Pfad-Guard.
   */
  async setProperties(contentPath: string, values: Record<string, string>): Promise<void> {
    assertWithinPlayground(contentPath);
    await this.openProperties(contentPath);
    for (const [name, value] of Object.entries(values)) {
      await expect(this.propertyField(name)).toBeVisible({ timeout: 20_000 });
      await this.propertyField(name).fill(value);
    }
    await this.savePropertiesAndClose();
  }

  /** Tag-Feld (`./cq:tags`) der Seiteneigenschaften. */
  private tagField(): Locator {
    return this.page.locator('foundation-autocomplete[name="./cq:tags"]');
  }

  /**
   * Setzt einen Tag über das Tag-Feld der Seiteneigenschaften: Titel tippen,
   * Vorschlag mit der Tag-ID wählen (z.B. `Samples:tag1`), speichern.
   * Gegen DEV per Diag verifiziert (18.11.2026).
   */
  async addTag(contentPath: string, query: string, tagId: string): Promise<void> {
    assertWithinPlayground(contentPath);
    await this.openProperties(contentPath);
    await this.tagField().locator('input[is="coral-textfield"]').fill(query);
    const suggestion = this.page.locator(`button[value="${tagId}"]:visible`);
    await expect(suggestion, `Kein Vorschlag für Tag ${tagId}.`).toBeVisible({ timeout: 15_000 });
    await suggestion.click();
    await expect(this.tagField().locator(`coral-tag[value="${tagId}"]`)).toBeVisible({ timeout: 10_000 });
    await this.savePropertiesAndClose();
  }

  /** Liest die gesetzten Tag-IDs aus den Seiteneigenschaften (ohne zu speichern). */
  async readTags(contentPath: string): Promise<string[]> {
    await this.openProperties(contentPath);
    await expect(this.tagField()).toBeVisible({ timeout: 20_000 });
    const tags = await this.tagField()
      .locator('coral-tag')
      .evaluateAll((l) => l.map((e) => e.getAttribute('value') ?? ''));
    await this.page.getByRole('button', { name: /^(Abbrechen|Cancel)$/ }).first().click();
    await this.page.waitForURL(/\/sites\.html/, { timeout: 20_000 }).catch(() => undefined);
    return tags;
  }

  /** „Speichern & schließen" in den Seiteneigenschaften. */
  private async savePropertiesAndClose(): Promise<void> {
    await this.page
      .locator('button:has-text("Speichern & schließen"), button:has-text("Save & Close"), #shell-propertiespage-doneactivator')
      .first()
      .click();
    // "Speichern & schließen" löst einen Redirect zurück zur Konsole aus.
    // Dessen Abschluss abwarten, damit ein folgendes open() nicht mit einer
    // laufenden Navigation kollidiert.
    await this.page.waitForURL(/\/sites\.html/, { timeout: 20_000 }).catch(() => undefined);
    await this.page.waitForLoadState('domcontentloaded').catch(() => undefined);
  }

  /**
   * Aktiviert (veröffentlicht) eine Seite über das Action-Bar-Menü der
   * Sites-Konsole. Löst die Replikation aus.
   *
   * Hinweis: Ob tatsächlich auf eine Publish-Instanz repliziert wird, hängt von
   * der Umgebung ab. In TEST ohne angebundene Publish-Instanz wird lediglich der
   * Statuswechsel/Trigger im Author geprüft (siehe README, offener Punkt).
   */
  // Hinweis: Aktivieren nutzt den direkten "Quick Publish"-Button, Deaktivieren
  // den "Veröffentlichung verwalten"-Wizard - zwei valide, aber unterschiedliche
  // Redakteurswege. Der Wizard-Weg zum Aktivieren ist bewusst nicht abgedeckt.
  async activatePage(contentPath: string): Promise<void> {
    assertWithinPlayground(contentPath);
    if (!(await this.openUntilItem(contentPath))) {
      throw new Error(`activatePage: Seite ${contentPath} nicht in der Konsole gefunden.`);
    }
    await this.selectItem(contentPath);

    // "Quick Publish" ist direkt in der Action-Bar sichtbar und öffnet einen
    // Bestätigungsdialog ("Die Seite und ihre Verweise werden veröffentlicht").
    await this.page.locator('button[trackingelement="quick publish"]:visible').first().click();
    await this.page.getByRole('button', { name: /^Veröffentlichen$/ }).click();
    await this.page.waitForTimeout(2000); // Replikation anstoßen lassen
  }

  /**
   * Deaktiviert (nimmt zurück) eine Seite über den Manage-Publication-Wizard
   * ("..." -> Veröffentlichung verwalten -> Veröffentlichung rückgängig).
   */
  async deactivatePage(contentPath: string): Promise<void> {
    assertWithinPlayground(contentPath);
    if (!(await this.openUntilItem(contentPath))) {
      throw new Error(`deactivatePage: Seite ${contentPath} nicht in der Konsole gefunden.`);
    }
    await this.selectItem(contentPath);

    await this.openActionOverflow();
    await this.page.getByRole('menuitem', { name: /Veröffentlichung verwalten/ }).click();
    await this.page.waitForURL(/managepublicationwizard/, { timeout: 20_000 });

    // Wizard Schritt 1: Option "Veröffentlichung rückgängig machen" wählen,
    // dann "Weiter".
    await this.page.getByText(/Veröffentlichung rückgängig/i).first().click();
    await this.page.getByRole('button', { name: /^(Weiter|Next)$/ }).click();
    await this.page.waitForTimeout(1000);
    // Schritt 2: Abschluss-Button "Veröffentlichung rückgängig..." klicken.
    await this.page
      .getByRole('button', { name: /Veröffentlichung rückgängig/i })
      .first()
      .click();
    await this.page.waitForTimeout(2000);
  }

  /**
   * Liefert den im Author sichtbaren Publikationsstatus aus der Vorschau-Spalte
   * der Sites-Konsole ("Veröffentlicht" / "Nicht veröffentlicht").
   */
  async getPublicationStatus(contentPath: string): Promise<string> {
    if (!(await this.openUntilItem(contentPath))) {
      return '(Seite nicht gefunden)';
    }
    await this.selectItem(contentPath);
    // Die Vorschau-Spalte listet Metadaten inkl. "Veröffentlicht <Wert>".
    const previewText = await this.page
      .locator('coral-columnview-preview, [class*="preview"]')
      .first()
      .innerText()
      .catch(() => '');
    return /nicht veröffentlicht|not published/i.test(previewText)
      ? 'Nicht veröffentlicht'
      : /veröffentlicht|published/i.test(previewText)
        ? 'Veröffentlicht'
        : '(unbekannt)';
  }

  /**
   * Schaltet die linke Rail der Konsole auf die Zeitachse (Timeline) um und
   * öffnet das Aktionsmenü (chevronUp neben dem Kommentarfeld). Vorbedingung:
   * eine Seite ist selektiert.
   */
  private async openTimelineActionMenu(): Promise<void> {
    const chevron = this.page.locator('coral-icon[icon="chevronUp"]').first();

    // Timeline ggf. aktivieren. Die Rail merkt sich ihren Zustand, daher nur
    // umschalten, wenn das chevronUp-Icon (Timeline-Panel) noch nicht da ist.
    if (!(await chevron.isVisible().catch(() => false))) {
      // Rail-Umschalter (coral-cyclebutton) öffnen - unabhängig vom aktuellen
      // Label (kann "Nur Inhalt" oder bereits "Timeline" sein).
      await this.page
        .locator('coral-cyclebutton.granite-toggleable-control > button, coral-cyclebutton.granite-toggleable-control [is="coral-button"]')
        .first()
        .click();
      await this.page.waitForTimeout(500);
      await this.page
        .locator('coral-selectlist-item:has-text("Timeline"), coral-cyclebutton-item:has-text("Timeline")')
        .first()
        .click();
      await expect(chevron).toBeVisible({ timeout: 15_000 });
    }

    // Aktionsmenü aufklappen (coral-icon ist nicht "enabled" -> force-Klick).
    // Der force-Klick aufs coral-icon ist mehrdeutig und klappt das Menü unter
    // Last nicht immer beim ersten Mal auf. Daher bis zu 3x klicken und jeweils
    // zustandsbasiert auf "Als Version speichern" warten (kein fester Sleep).
    const saveButton = this.page.getByRole('button', { name: /Als Version speichern/i });
    for (let attempt = 0; attempt < 3; attempt++) {
      // Nach der Selektion lädt die Rail die Timeline neu; chevronUp ist kurz unsichtbar.
      await expect(chevron).toBeVisible({ timeout: 15_000 });
      await chevron.click({ force: true });
      try {
        await expect(saveButton).toBeVisible({ timeout: 5000 });
        return;
      } catch {
        if (attempt === 2) {
          throw new Error('Timeline-Aktionsmenü: "Als Version speichern" nicht erschienen.');
        }
      }
    }
  }

  /**
   * Erstellt eine Version der Seite über die Zeitachse der Konsole
   * (Timeline -> Aktionsmenü -> "Als Version speichern", optional mit Kommentar).
   */
  async createVersion(contentPath: string, label: string): Promise<void> {
    assertWithinPlayground(contentPath);
    if (!(await this.openUntilItem(contentPath))) {
      throw new Error(`createVersion: Seite ${contentPath} nicht gefunden.`);
    }
    await this.selectItem(contentPath);
    await this.openTimelineActionMenu();

    // "Als Version speichern" öffnet das Formular "Neue Version erstellen"
    // (Label + Kommentar + Erstellen).
    await this.page.getByRole('button', { name: /Als Version speichern/i }).click();
    const labelField = this.page.locator('.cq-common-admin-timeline input[name="label"], coral-panel input[placeholder], input[name="label"]').first();
    await expect(labelField).toBeVisible({ timeout: 10_000 });
    await labelField.fill(label);
    // Bestätigen mit "Erstellen".
    await this.page.getByRole('button', { name: /^Erstellen$/ }).click();
    await this.page.waitForTimeout(2500);
  }

  /**
   * Stellt die zuletzt gespeicherte Version wieder her
   * (Timeline -> Aktionsmenü -> "Version wiederherstellen").
   */
  /**
   * Stellt eine benannte Version wieder her. Verifiziert gegen TEST: in der
   * Timeline den Versionseintrag (Label) anklicken; dieser klappt auf und bietet
   * "Auf diese Version zurück". (Nicht der Bulk-"Version wiederherstellen"-Weg,
   * der ganze Unterbäume meint.)
   */
  async restoreVersion(contentPath: string): Promise<void> {
    assertWithinPlayground(contentPath);
    if (!(await this.openUntilItem(contentPath))) {
      throw new Error(`restoreVersion: Seite ${contentPath} nicht gefunden.`);
    }
    await this.selectItem(contentPath);
    // Timeline aktivieren (ohne das Aktionsmenü aufzuklappen).
    const chevron = this.page.locator('coral-icon[icon="chevronUp"]').first();
    if (!(await chevron.isVisible().catch(() => false))) {
      await this.page
        .locator('coral-cyclebutton.granite-toggleable-control > button')
        .first()
        .click();
      await this.page.waitForTimeout(500);
      await this.page.locator('coral-selectlist-item:has-text("Timeline")').first().click();
      await expect(chevron).toBeVisible({ timeout: 15_000 });
    }

    // Versionseintrag in der Timeline anklicken -> klappt auf.
    // "Neue Version 1.0" ist der Versionseintrag; "Neue Version erstellen" (das
    // Formular) wird per exaktem Versions-Label ausgeschlossen.
    await this.page
      .getByText(/Neue Version \d/i)
      .first()
      .click();
    await this.page.waitForTimeout(800);
    // "Auf diese Version zurück" bestätigt den Restore.
    await this.page.getByRole('button', { name: /Auf diese Version zurück/i }).click();
    await this.page.waitForTimeout(500);
    // Etwaigen Bestätigungsdialog akzeptieren.
    const dialog = this.page.locator('coral-dialog[open]').first();
    if (await dialog.count()) {
      await dialog
        .getByRole('button', { name: /Wiederherstellen|Zurück|Restore|OK|Ja/i })
        .first()
        .click()
        .catch(() => undefined);
    }
    await this.page.waitForTimeout(2500);
  }

  /**
   * Öffnet das Formular "Baum wiederherstellen" (Timeline -> Aktionsmenü) für
   * eine Seite und liefert es zurück. Führt nichts aus. Gegen DEV verifiziert:
   * Ordner ohne Seite (z.B. /content/fhgtest) haben keine Timeline, daher eine
   * Seite selektieren.
   */
  async openRestoreTreeForm(contentPath: string): Promise<Locator> {
    if (!(await this.openUntilItem(contentPath))) {
      throw new Error(`openRestoreTreeForm: Seite ${contentPath} nicht gefunden.`);
    }
    await this.selectItem(contentPath);
    await this.openTimelineActionMenu();
    await this.page.locator('button.cq-siteadmin-admin-restoretree:visible').click();
    const form = this.page.locator('form.cq-sites-restoretree-form');
    await expect(form).toBeVisible({ timeout: 15_000 });
    return form;
  }

  /**
   * Kopiert eine Seite und fügt sie im selben Ordner wieder ein (Action-Bar
   * „Kopieren", Auswahl aufheben, „Einfügen"). AEM hängt an den Namen eine
   * Ziffer an (Diag 18.11.2026: `<name>1`). Gibt den Pfad der Kopie zurück.
   */
  async copyPageInPlace(contentPath: string): Promise<string> {
    assertWithinPlayground(contentPath);
    const copyPath = `${contentPath}1`;
    assertWithinPlayground(copyPath);
    if (!(await this.openUntilItem(contentPath))) {
      throw new Error(`copyPageInPlace: Seite ${contentPath} nicht gefunden.`);
    }
    await this.selectItem(contentPath);
    // Die Auswahl lädt die Spalten-Vorschau nach; die Action-Bar steht schon vorher.
    // „Kopieren" in diesem Fenster ließ die Konsole in die Seite springen, „Einfügen"
    // zielte dann auf die Seite selbst (Diag TEST 19.11.2026: „Homepage not allowed below").
    await expect(this.page.locator('coral-columnview-preview')).toBeVisible({ timeout: 15_000 });
    await this.page.locator('button[trackingelement="copy"]:visible').click();
    await this.page.keyboard.press('Escape'); // Auswahl aufheben, dann erscheint „Einfügen"
    const paste = this.page.locator('button[trackingelement="paste"]:visible');
    await expect(paste).toBeVisible({ timeout: 10_000 });
    await paste.click();
    await expect(this.pageItem(copyPath)).toBeVisible({ timeout: 20_000 });
    return copyPath;
  }

  /**
   * Verschiebt und/oder benennt eine Seite über den Wizard „Verschieben"
   * (Schritt 1 Umbenennen, Schritt 2 Ziel wählen). Das Ziel muss explizit
   * ausgewählt werden, sonst meldet AEM Erfolg ohne etwas zu tun (Diag
   * 18.11.2026: Job „0 von 0"). Der Vorgang läuft als Hintergrundjob.
   * Gibt den neuen Pfad zurück.
   */
  async movePage(contentPath: string, params: { targetParent: string; newName?: string }): Promise<string> {
    const name = params.newName ?? contentPath.substring(contentPath.lastIndexOf('/') + 1);
    const targetPath = `${params.targetParent}/${name}`;
    assertWithinPlayground(contentPath);
    assertWithinPlayground(targetPath);
    if (!(await this.openUntilItem(contentPath))) {
      throw new Error(`movePage: Seite ${contentPath} nicht gefunden.`);
    }
    await this.selectItem(contentPath);
    await this.page.locator('button[trackingelement="move"]:visible').click();
    await this.page.waitForURL(/movepagewizard/, { timeout: 20_000 });
    await this.page.waitForLoadState('networkidle');
    const nameField = this.page.locator('input[name="name"]');
    await expect(nameField).toBeVisible({ timeout: 20_000 });
    if (params.newName) await nameField.fill(params.newName);
    await this.page.getByRole('button', { name: /^(Weiter|Next)$/ }).click();
    const target = this.page.locator(
      `coral-columnview-item[data-foundation-collection-item-id="${params.targetParent}"]`,
    );
    await expect(target).toBeVisible({ timeout: 20_000 });
    await this.page.waitForLoadState('networkidle');
    // Die Auswahl setzt das versteckte Feld destPath. Ohne gültiges destPath
    // schickte AEM den Job mit Ziel /content ab (Diag 18.11.2026). Daher vor dem
    // Absenden prüfen, dass genau das gewünschte Ziel in der Spielwiese gilt.
    const destPath = this.page.locator('input[type="hidden"][name="destPath"]');
    for (let attempt = 0; attempt < 3; attempt++) {
      // Klick toggelt die Auswahl: nur klicken, wenn das Ziel noch nicht ausgewählt ist.
      if ((await target.getAttribute('selected')) === null) {
        await target.locator('coral-columnview-item-thumbnail').click();
      }
      try {
        await expect(destPath).toHaveValue(params.targetParent, { timeout: 5000 });
        break;
      } catch {
        if (attempt === 2) {
          throw new Error(`movePage: Ziel ${params.targetParent} ließ sich nicht auswählen (destPath).`);
        }
      }
    }
    assertWithinPlayground(`${await destPath.inputValue()}/${name}`);
    await this.page.getByRole('button', { name: /^(Verschieben|Move)$/ }).click();
    // „Jetzt/Später" -> Fortfahren, danach Hinweis auf den Hintergrundjob -> OK.
    await this.page.locator('coral-dialog[open]').getByRole('button', { name: /^(Fortfahren|Continue)$/ }).click();
    await this.page.locator('coral-dialog[open]').getByRole('button', { name: /^OK$/ }).click();
    await this.page.waitForURL(/\/sites\.html/, { timeout: 30_000 });
    return targetPath;
  }

  /**
   * Wartet, bis eine Seite erscheint (Hintergrundjobs wie „Verschieben" brauchen
   * auf DEV ~15 s). Lädt die Konsole dazu mehrfach neu.
   */
  async waitForPage(contentPath: string, timeoutMs = 90_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.openUntilItem(contentPath, 1)) return;
      await this.page.waitForTimeout(3000);
    }
    throw new Error(`Seite ${contentPath} nach ${timeoutMs / 1000} s nicht in der Konsole.`);
  }

  // --- interne UI-Helfer -------------------------------------------------

  /** Breite des "Mehr"-Buttons; >0 bedeutet, die Selektions-Action-Bar ist aktiv. */
  private actionBarMoreWidth(): Promise<number> {
    return this.page
      .locator('button[icon="more"]')
      .first()
      .evaluate((el) => Math.round(el.getBoundingClientRect().width))
      .catch(() => 0);
  }

  /**
   * Öffnet das "..."-Overflow-Menü der Action-Bar. Es gibt mehrere "more"-
   * Buttons im DOM (teils off-screen); nur den sichtbaren nehmen und auf
   * Klickbarkeit warten (vermeidet Flakiness).
   */
  private async openActionOverflow(): Promise<void> {
    const moreBtn = this.page.locator('button[icon="more"]:visible').first();
    await expect(moreBtn).toBeVisible({ timeout: 10_000 });
    await moreBtn.click();
  }

  /**
   * Selektiert eine Seite in der Spaltenansicht zuverlässig. Ein Klick aufs
   * Thumbnail setzt die Auswahl; die Action-Bar erscheint aber nur, wenn AEMs
   * Handler gebunden sind (siehe open() -> networkidle). Nach dem Klick wird
   * daher zustandsbasiert auf die Action-Bar gewartet und bei Bedarf wiederholt.
   */
  private async selectItem(contentPath: string): Promise<void> {
    const item = this.pageItem(contentPath);
    const thumb = item.locator('coral-columnview-item-thumbnail').first();

    for (let attempt = 0; attempt < 4; attempt++) {
      await thumb.click();
      try {
        await expect
          .poll(() => this.actionBarMoreWidth(), { timeout: 5000, intervals: [250, 500] })
          .toBeGreaterThan(0);
        return;
      } catch {
        await item.focus().catch(() => undefined);
        await this.page.waitForTimeout(500);
      }
    }
    throw new Error(`Selektion von ${contentPath}: Action-Bar erschien nicht.`);
  }

  private async clickCreateMenu(timeout?: number): Promise<void> {
    // In der Sites-Konsole existiert "Erstellen" mehrfach im DOM (u.a. eine
    // versteckte Variante für Mehrfachauswahl). `:visible` erzwingt den
    // tatsächlich sichtbaren Action-Bar-Button.
    const button = this.page
      .locator('button:has-text("Erstellen"):visible, button:has-text("Create"):visible')
      .first();
    try {
      await button.click({ timeout });
    } catch {
      // Diag 18.11.2026: Nach einmal geöffnetem und geschlossenem Menü bleibt das
      // Popover unsichtbar (opacity 0, display block) über dem Button liegen und
      // fängt Mausklicks ab. Tastatur (Fokus + Enter) öffnet das Menü trotzdem.
      await button.focus();
      await this.page.keyboard.press('Enter');
    }
  }

  private async clickWizardNext(): Promise<void> {
    await this.page
      .locator(
        '.cq-siteadmin-admin-createpage-wizard-next:visible, button:has-text("Weiter"):visible, button:has-text("Next"):visible',
      )
      .first()
      .click();
  }

  private async clickWizardCreate(): Promise<void> {
    await this.page
      .locator(
        '.cq-siteadmin-admin-createpage-wizard-create:visible, button:has-text("Erstellen"):visible, button:has-text("Create"):visible',
      )
      .first()
      .click();
  }
}
