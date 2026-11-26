import { Page, Locator, expect } from '@playwright/test';
import { getAemConfig } from '../config/env.js';

/**
 * Ein ausgelesenes Dialogfeld: Reiter-Label, Feld-Label/Name und aktueller Wert.
 */
export interface DialogField {
  /** Reiter (coral-tab), unter dem das Feld liegt. '' wenn der Dialog keine Reiter hat. */
  tab: string;
  /** Lesbares Feld-Label bzw. der Attributname, wenn kein Label gefunden wird. */
  label: string;
  /** Technischer Feldname (name-Attribut, z.B. "./jcr:title"), falls vorhanden. */
  name: string;
  /** Aktueller Wert (Textfeld/Textarea/Select/Checkbox-Zustand). */
  value: string;
  /** true, wenn der Wert leer ist (fachlicher Nachbesserungs-Befund). */
  empty: boolean;
}

/**
 * Struktur eines Komponenten-Konfig-Dialogs: die Reiter-Labels und alle Felder.
 * Dient als Referenz-Fixture (Vorher-Stand) und als Vergleichsbasis im Test.
 */
export interface DialogSnapshot {
  component: string;
  /** Titel im Dialogkopf — belegt, dass der richtige Dialog geöffnet wurde. */
  dialogTitle?: string;
  tabs: string[];
  fields: DialogField[];
}

/**
 * Page Object für die Komponenten-Beispielseiten (/content/samples) im
 * AEM-Author-Editor. Öffnet den Konfig-Dialog einer Komponente, iteriert über
 * ALLE Reiter und liest Felder + Werte aus.
 *
 * Zweck (JET-Antwort, Testtiefe b, erweitert): prüfen, dass der Dialog öffnet,
 * die Komponente korrekt lädt, alle Reiter vorhanden sind und die erwarteten
 * Felder korrekt befüllt sind (Überschriften etc.). Leere Felder werden
 * gemeldet.
 *
 * WICHTIG (AGENTS.md: keine geratenen Selektoren): Die hier verwendeten
 * Granite-Selektoren decken die gängigen Coral3-Dialoge ab, müssen aber beim
 * ersten echten Lauf gegen DEV/TEST je Komponente per Diag verifiziert werden
 * (siehe tests/components/dialog-capture.spec.ts). Danach ist die aus dem
 * Capture erzeugte Referenz-Fixture die Sollquelle.
 */
export class SamplesComponentPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  private baseUrl(): string {
    return getAemConfig().baseUrl;
  }

  /** Öffnet eine Samples-Seite im Editor (Lesezugriff; kein Schreib-Guard nötig). */
  async open(contentPath: string): Promise<void> {
    // Wie PageEditor: NICHT networkidle (Editor hält Dauerverbindungen),
    // sondern domcontentloaded + zustandsbasiert auf den Content-iFrame warten.
    await this.page.goto(`${this.baseUrl()}/editor.html${contentPath}.html`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(this.page.locator('#ContentFrame')).toBeVisible({ timeout: 30_000 });
    // Die Komponenten-Overlays legt der Editor erst nach dem iFrame-Load
    // asynchron an (gegen DEV beobachtet: teils > 2,5 s). Zustandsbasiert
    // warten, sonst findet die Selektion kein Overlay.
    await this.page
      .locator('.cq-Overlay--component')
      .first()
      .waitFor({ state: 'attached', timeout: 30_000 });
  }

  /**
   * Selektiert eine Komponente über ihr Editor-Overlay und öffnet deren
   * Konfigurations-Dialog über die Editable-Toolbar (Stift/Configure).
   * `component` ist der Overlay-title (Komponentenname).
   */
  async openConfigDialog(component: string, dialogTitle?: string): Promise<void> {
    const overlay = this.page.locator(`.cq-Overlay--component[title="${component}"]`).first();
    const toolbar = this.page.locator('#EditableToolbar');
    const configure = toolbar.locator('button[data-action="CONFIGURE"]').first();
    // Dialogtitel = Overlay-Titel ohne "[Stamm]" (gegen DEV verifiziert).
    // Weicht der Dialogtitel vom Overlay-Titel ab (z. B. „Verweis" öffnet „Referenzkomponente"), steht er in `dialogTitle`.
    const expectedTitle = dialogTitle ?? component.replace(/\s*\[Stamm\]\s*$/, '');

    // Klickpunkte in Reihenfolge. Die Ecke trifft Container (in deren Mitte
    // liegt ein Kind-Overlay obenauf: "Bereich" öffnete sonst "Tabelle"); die
    // Mitte trifft Komponenten, deren Ecke auf einem umgebenden Element liegt
    // ("Filter Newsroom"). Wie ein Redakteur: klicken, Dialog prüfen, sonst
    // schließen und anders klicken.
    const positions: Array<{ x: number; y: number } | undefined> = [{ x: 4, y: 4 }, undefined];
    let lastTitle = '';
    // Container-Overlays werden nach dem Laden noch positioniert und sind kurz
    // "not visible" (gegen DEV beobachtet: Formularcontainer) -> darauf warten.
    await overlay.scrollIntoViewIfNeeded().catch(() => undefined);
    await overlay.waitFor({ state: 'visible', timeout: 15_000 });
    for (const position of positions) {
      // Ins Bild scrollen: verschachtelte Overlays liegen sonst außerhalb des
      // Viewports und bleiben für hover "not visible" (Teaser).
      await overlay
        .evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
        .catch(() => undefined);
      await this.page.waitForTimeout(200);
      // Overlays sind div[role=button], die Playwright als "not enabled" sieht
      // -> force. Der Hover blendet die Editable-Toolbar ein.
      await overlay.hover({ force: true, position });
      await this.page.waitForTimeout(400);
      await overlay.click({ force: true, position });
      if (!(await configure.isVisible({ timeout: 5000 }).catch(() => false))) {
        continue; // getroffenes Element hat keinen Dialog -> nächster Klickpunkt
      }
      await configure.click();
      await expect(this.dialog()).toBeVisible({ timeout: 15_000 });
      lastTitle = await this.dialogTitle();
      if (lastTitle === expectedTitle) return;
      await this.closeDialog(); // falscher Dialog -> schließen, neu versuchen
    }
    throw new Error(
      `Konfig-Dialog von "${component}" nicht geöffnet ` +
        `(erwartet Titel "${expectedTitle}", zuletzt "${lastTitle || 'kein Dialog'}").`,
    );
  }

  /** Der geöffnete Konfig-Dialog (Coral-Dialog). */
  dialog(): Locator {
    return this.page.locator('coral-dialog[open], .cq-dialog[open], coral-dialog.is-open').first();
  }

  /** Labels aller Reiter (coral-tab) im Dialog, in Reihenfolge. */
  async tabLabels(): Promise<string[]> {
    const tabs = this.dialog().locator('coral-tab, [role="tab"]');
    const count = await tabs.count();
    const labels: string[] = [];
    for (let i = 0; i < count; i++) {
      const tab = tabs.nth(i);
      // Nur für den Redakteur sichtbare Reiter: Granite blendet bedingte Reiter
      // per Klasse "hide" aus (z.B. "Video Eigenschaften" ohne Video-Inhalt).
      if (!(await tab.isVisible().catch(() => false))) continue;
      const text = (await tab.innerText().catch(() => '')).trim();
      if (text !== '') labels.push(text);
    }
    return labels;
  }

  /**
   * Liest die gesamte Dialogstruktur aus: iteriert über alle Reiter (oder genau
   * einmal, wenn der Dialog keine Reiter hat) und sammelt pro Reiter die Felder
   * mit ihren aktuellen Werten.
   */
  async readSnapshot(component: string): Promise<DialogSnapshot> {
    const tabs = await this.tabLabels();
    const fields: DialogField[] = [];

    if (tabs.length === 0) {
      fields.push(...(await this.readFieldsOfActivePanel('')));
    } else {
      for (const tab of tabs) {
        await this.activateTab(tab);
        fields.push(...(await this.readFieldsOfActivePanel(tab)));
      }
    }

    return { component, dialogTitle: await this.dialogTitle(), tabs, fields };
  }

  /** Titel im Dialogkopf (z.B. "Tabelle", "Bereich"). */
  async dialogTitle(): Promise<string> {
    return (
      (await this.dialog()
        .locator('coral-dialog-header')
        .first()
        .innerText()
        .catch(() => '')) ?? ''
    ).trim();
  }

  /**
   * Klickt einen Reiter an und wartet kurz auf den Panelwechsel. Exakter Name
   * und nur sichtbare Reiter (getByRole schließt ausgeblendete aus), sonst
   * träfe "Text" auch "Text mit Asset" oder einen versteckten Dubletten-Reiter.
   */
  async activateTab(tabLabel: string): Promise<void> {
    await this.dialog().getByRole('tab', { name: tabLabel, exact: true }).first().click();
    await this.page.waitForTimeout(300);
  }

  /**
   * Liest alle sichtbaren Eingabefelder im aktuell aktiven Panel aus. Deckt
   * Textfelder, Textareas, Selects und Checkboxen ab (gängige Coral3-Felder).
   */
  private async readFieldsOfActivePanel(tab: string): Promise<DialogField[]> {
    const dialog = this.dialog();
    // Sichtbares, aktives Panel (coral-panel.is-selected) bevorzugen; sonst der
    // gesamte Dialog (dialogs ohne Panel-Struktur).
    const panel = dialog.locator('coral-panel.is-selected, coral-panel[selected]').first();
    const scope = (await panel.count()) ? panel : dialog;

    // div[name]: Fraunhofer-eigene Editoren ohne Eingabefeld (z.B. Tabelleneditor
    // "./tableData"); deren Wert ist der sichtbare Textinhalt.
    const controls = scope.locator(
      'input[name], textarea[name], coral-textfield[name] input, coral-select[name], ' +
        'input[is="coral-textfield"][name], coral-checkbox[name], div[name]',
    );
    const count = await controls.count();
    const out: DialogField[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < count; i++) {
      const el = controls.nth(i);
      if (!(await el.isVisible().catch(() => false))) continue;

      const name = (await el.getAttribute('name').catch(() => '')) ?? '';
      const label = await this.labelFor(el, name);
      const value = await this.valueOf(el);
      const dedupeKey = `${tab}::${name}::${label}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      out.push({ tab, label, name, value, empty: value.trim() === '' });
    }
    return out;
  }

  /** Ermittelt ein lesbares Label zu einem Feld (fieldwrapper label oder name). */
  private async labelFor(el: Locator, fallback: string): Promise<string> {
    const label = await el
      .evaluate((node) => {
        const wrapper = node.closest('.coral-Form-fieldwrapper, coral-panel, .cq-dialog');
        const lbl = wrapper?.querySelector('label.coral-Form-fieldlabel, label');
        return lbl?.textContent?.trim() ?? '';
      })
      .catch(() => '');
    return label !== '' ? label : fallback;
  }

  /** Liest den aktuellen Wert eines Controls (Text/Select/Checkbox). */
  private async valueOf(el: Locator): Promise<string> {
    return el
      .evaluate((node) => {
        const tag = node.tagName.toLowerCase();
        // Checkboxen: "unchecked" ist ein gültiger Wert, kein fehlender Inhalt
        // (sonst würde jeder nicht gesetzte Haken als leeres Feld gemeldet).
        if (tag === 'coral-checkbox') {
          return (node as HTMLInputElement).checked ? 'checked' : 'unchecked';
        }
        if (tag === 'coral-select') {
          // Nur der gewählte Eintrag (wie ihn der Redakteur sieht). textContent
          // enthielte alle Optionen; eine geänderte Optionsliste (z.B. Institute
          // auf TEST) würde sonst als Abweichung gemeldet.
          // Mehrfachauswahl (multiple): alle gewählten Einträge, sonst nur der erste.
          const sel = node as HTMLElement & { selectedItems?: Element[]; selectedItem?: Element | null };
          const items = sel.hasAttribute('multiple') ? (sel.selectedItems ?? []) : [sel.selectedItem].filter(Boolean);
          return items.map((i) => (i?.textContent ?? '').replace(/\s+/g, ' ').trim()).join(', ');
        }
        if (tag === 'div') {
          // Mehrfach-Leerraum normalisieren (Tabellenzellen, Zeilenumbrüche).
          return ((node as HTMLElement).innerText ?? '').replace(/\s+/g, ' ').trim();
        }
        const input = node as HTMLInputElement;
        if (input.type === 'checkbox') return input.checked ? 'checked' : 'unchecked';
        return input.value ?? '';
      })
      .catch(() => '');
  }

  /** Schließt den Dialog ohne zu speichern (Abbrechen/Escape). */
  async closeDialog(): Promise<void> {
    await this.page.keyboard.press('Escape').catch(() => undefined);
    await this.page.waitForTimeout(300);
  }
}
