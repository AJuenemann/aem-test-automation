import path from 'node:path';
import { test, expect } from '../../fixtures/test-fixtures.js';
import { titleEn, describeEn } from '../../fixtures/titles.js';
import { getAemConfig } from '../../config/env.js';

/**
 * MVP Task 7 - Einfache visuelle Regression.
 *
 * Legt eine Seite an und vergleicht die gerenderte Ansicht gegen eine Baseline.
 * Baselines sind pro AEM_ENV getrennt (snapshotPathTemplate in
 * playwright.config.ts), sodass alt vs. neu über die Basis-URL verglichen
 * werden kann.
 *
 * Konsistente Baselines erfordern dieselbe Ausführungsumgebung (lokal vs. CI).
 * In CI daher im Playwright-Docker-Image erzeugen (siehe README).
 *
 * shortcut: Baseline nur der leeren Seite - fängt kaum echte Rendering-
 * Regressionen. Sobald die Komponenten-Priorisierung steht, Baseline mit einer
 * inhaltlich gefüllten Seite erzeugen.
 */
const stylePath = path.join(import.meta.dirname, 'screenshot.css');

test.describe('Komponenten: Visuelle Regression (Testseite)', { tag: ['@level2-components', '@visual'], annotation: describeEn('Components: visual regression (test page)') }, () => {
  test('Gerenderte Seite entspricht Baseline', titleEn('Rendered page matches baseline'), async ({
    sitesConsole,
    pageEditor,
    makeTestPage,
    registerCleanup,
  }) => {
    // Seite anlegen + gerenderte Ansicht aufnehmen: mehrstufig, unter Last
    // > 30s. Konsistent mit den übrigen UI-Flows.
    test.setTimeout(120_000);
    const cfg = getAemConfig();
    const pageData = makeTestPage('visuelle-regression');
    registerCleanup(pageData.path);

    await sitesConsole.createPage({
      parentPath: cfg.playgroundPath,
      name: pageData.name,
      title: pageData.title,
    });
    await pageEditor.openRendered(pageData.path);
    // Maus aus der Ecke bewegen, um Hover-Effekte im Screenshot zu vermeiden.
    await pageEditor.page.mouse.move(-1, -1);

    await expect(pageEditor.page).toHaveScreenshot('rendered-page.png', {
      fullPage: true,
      stylePath,
    });
  });
});
