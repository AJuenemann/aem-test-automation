import { Page, expect } from '@playwright/test';
import { getPublishConfig, PublishConfig } from '../config/env.js';

/**
 * Page Object für die AEM Publish-Instanz.
 *
 * Grundlage der visuellen Regression: Laut JET-Antwort ist die visuelle
 * Regression nur auf der Publish-Seite relevant (fertig gerenderte Webseiten).
 * Die Publish-URL kommt aus AEM_PUBLISH_URL (Fallback: Ableitung aus der
 * Author-URL, author->publish1). Ist keine URL verfügbar, liefert
 * `availability()` den Grund, damit der Test sich sauber per test.skip
 * ausklinken kann (statt als Funktionsfehler zu scheitern).
 *
 * Publish ist nicht eingeloggt/öffentlich — hier wird KEIN storageState
 * gebraucht; die Seiten werden anonym gerendert.
 */
export class PublishPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /** Publish-Konfiguration (URL + ggf. Skip-Grund). */
  config(): PublishConfig {
    return getPublishConfig();
  }

  /**
   * Liefert null, wenn Publish verfügbar ist, sonst den Skip-Grund.
   * Nutzung im Test: `test.skip(publish.unavailableReason() !== null, reason)`.
   */
  unavailableReason(): string | null {
    const cfg = this.config();
    return cfg.url === '' ? cfg.reason : null;
  }

  /**
   * Öffnet die gerenderte Publish-Seite zum angegebenen Inhaltspfad.
   * `contentPath` ohne `.html` (wird angehängt). networkidle, weil Publish
   * (anders als der Author-Editor) keine Dauerverbindungen hält.
   */
  async openRendered(contentPath: string): Promise<void> {
    const cfg = this.config();
    if (cfg.url === '') {
      throw new Error(`PublishPage: keine Publish-URL verfügbar (${cfg.reason}).`);
    }
    await this.page.goto(`${cfg.url}${contentPath}.html`, { waitUntil: 'networkidle' });
    // Grundgerüst muss da sein, bevor ein Screenshot sinnvoll ist.
    await expect(this.page.locator('body')).toBeVisible({ timeout: 20_000 });
    // Hover-Artefakte aus dem Screenshot halten.
    await this.page.mouse.move(-1, -1);
  }
}
