import { test } from '../../fixtures/test-fixtures.js';
import { titleEn, describeEn } from '../../fixtures/titles.js';
import { getAemConfig } from '../../config/env.js';

/**
 * Asset-Upload in der DAM-Spielwiese (/content/dam/fhgtest, Freigabe 18.11.2026).
 * Der Test legt einen eigenen Testordner an, lädt darin hoch, wartet auf die
 * Verarbeitung (Bildmaße) und löscht am Ende nur diesen Ordner.
 */
test.describe('AEM-Basis: Asset hochladen', { tag: '@level1', annotation: describeEn('AEM core: upload an asset') }, () => {
  test('Bild in einen Testordner der DAM hochladen und verarbeiten lassen', titleEn('Upload an image to a DAM test folder and let it process'), async ({ assetsConsole, makeTestPage }) => {
    test.setTimeout(300_000);
    const cfg = getAemConfig();
    // makeTestPage liefert nur den Namen nach Testschema, angelegt wird nichts.
    const folder = makeTestPage('asset-upload');
    const folderPath = `${cfg.damPlaygroundPath}/${folder.name}`;
    try {
      await assetsConsole.createFolder(cfg.damPlaygroundPath, folder.name, folder.title);
      const assetPath = await assetsConsole.upload(folderPath, 'fixtures/assets/qa-upload.png', 'qa-upload.png', 'image/png');
      await assetsConsole.expectDimensions(assetPath, '32 x 32');
    } finally {
      await assetsConsole.deleteEntry(folderPath);
    }
  });
});
