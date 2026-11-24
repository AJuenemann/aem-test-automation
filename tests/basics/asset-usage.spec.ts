import { test, expect } from '../../fixtures/test-fixtures.js';
import { titleEn, describeEn } from '../../fixtures/titles.js';
import { getAemConfig } from '../../config/env.js';

/**
 * Asset-Verwaltung: Bild hochladen, in einer
 * Testseite verwenden, Verweis-Anzahl in der Assets-Konsole, Asset über die Suche
 * finden. Danach Testseite und Testordner löschen (verwendetes Asset: „Löschen
 * erzwingen" wird bestätigt, die Auswahl ist vorher geprüft).
 *
 * Verwendet wird „Breites Bild" in einem „Bereich": Im Haupt-Parsys der Testseite
 * gibt es keine Komponente mit Asset-Feld (Diag DEV 24.11.2026).
 */
test.describe('AEM-Basis: Asset verwenden und finden', { tag: '@level1', annotation: describeEn('AEM core: use and find an asset') }, () => {
  test('Bild in einer Seite verwenden, Verweise zählen und über die Suche finden', titleEn('Use an image on a page, count its references and find it via search'), async ({
    assetsConsole,
    sitesConsole,
    pageEditor,
    samplesComponent,
    overlayChecks,
    makeTestPage,
    registerCleanup,
  }) => {
    test.setTimeout(420_000);
    const cfg = getAemConfig();
    const folder = makeTestPage('asset-verwenden');
    const folderPath = `${cfg.damPlaygroundPath}/${folder.name}`;
    // Eindeutiger Dateiname: Suche und Asset-Finder treffen genau dieses Asset.
    const fileName = `${folder.name}.png`;
    const pageData = makeTestPage('asset-verwenden-seite');
    registerCleanup(pageData.path);
    const sectionParsys = `${pageData.path}/jcr:content/contentPar/sectioncomponent/sectionParsys`;
    try {
      await assetsConsole.createFolder(cfg.damPlaygroundPath, folder.name, folder.title);
      const assetPath = await assetsConsole.upload(folderPath, 'fixtures/assets/qa-upload.png', fileName, 'image/png');
      await assetsConsole.expectReferenceCount(assetPath, 0);

      // Verwenden: Bereich > Breites Bild, Asset aus dem Asset-Finder ins Bildfeld ziehen, speichern.
      await sitesConsole.createPage({ parentPath: cfg.playgroundPath, name: pageData.name, title: pageData.title });
      await pageEditor.open(pageData.path);
      await pageEditor.insertComponent('Bereich');
      await pageEditor.open(pageData.path);
      await pageEditor.insertComponent('Breites Bild', { parsysPath: sectionParsys });
      await pageEditor.open(pageData.path);
      await overlayChecks.openSidePanel(); // vor dem Dialog, sonst blockiert der modale Hintergrund
      const card = await overlayChecks.findAssetCard(folder.name, assetPath);
      await samplesComponent.openConfigDialog('Breites Bild');
      await samplesComponent.activateTab('Bild');
      const dialog = samplesComponent.dialog();
      await card.dragTo(dialog.locator('coral-fileupload:visible').first());
      await expect(dialog.locator('input[name="./imageComponent/image/fileReference"]')).toHaveValue(assetPath, { timeout: 10_000 });
      await dialog.getByRole('button', { name: /^(Fertig|Done)$/ }).click();
      await expect(dialog).toHaveCount(0, { timeout: 20_000 });

      await assetsConsole.expectReferenceCount(assetPath, 1);
      expect(await assetsConsole.searchFinds(folder.name, assetPath), 'Suche findet das Asset nicht.').toBe(true);
    } finally {
      await sitesConsole.deletePage(pageData.path); // zuerst die Seite, dann hat das Asset keine Verweise mehr
      await assetsConsole.deleteEntry(folderPath);
    }
  });
});
