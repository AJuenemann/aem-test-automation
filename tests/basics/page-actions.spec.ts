import { test, expect } from '../../fixtures/test-fixtures.js';
import { titleEn, describeEn } from '../../fixtures/titles.js';
import { getAemConfig } from '../../config/env.js';

/**
 * Weitere Redakteurs-Aktionen der Sites-Konsole unter der Spielwiese:
 * Kopieren, Verschieben, Umbenennen und Seiteneigenschaften.
 * Gegen DEV per Diag verifiziert (18.11.2026).
 */
test.describe('AEM-Basis: Seiten kopieren, verschieben, umbenennen, Eigenschaften', { tag: '@level1', annotation: describeEn('AEM core: copy, move and rename pages, properties') }, () => {
  test('Seite kopieren und im selben Ordner einfügen', titleEn('Copy a page and paste it into the same folder'), async ({ sitesConsole, makeTestPage, registerCleanup }) => {
    const cfg = getAemConfig();
    const pageData = makeTestPage('seite-kopieren');
    registerCleanup(pageData.path);
    registerCleanup(`${pageData.path}1`);
    await sitesConsole.createPage({ parentPath: cfg.playgroundPath, name: pageData.name, title: pageData.title });

    const copyPath = await sitesConsole.copyPageInPlace(pageData.path);

    await sitesConsole.expectPageVisible(copyPath);
    await sitesConsole.expectPageVisible(pageData.path); // Original bleibt
  });

  test('Unterseite unter eine andere Startseite verschieben', titleEn('Move a subpage under another homepage'), async ({ sitesConsole, makeTestPage, registerCleanup }) => {
    test.setTimeout(240_000);
    const cfg = getAemConfig();
    // Testseiten direkt unter der Spielwiese sind Startseiten (homepage). Eine
    // Startseite darf nicht unter eine andere Startseite, daher wird eine
    // Unterseite zwischen zwei Startseiten verschoben.
    const from = makeTestPage('verschieben-von');
    const to = makeTestPage('verschieben-nach');
    registerCleanup(from.path); // löscht die Unterseiten mit
    registerCleanup(to.path);
    await sitesConsole.createPage({ parentPath: cfg.playgroundPath, name: from.name, title: from.title });
    await sitesConsole.createPage({ parentPath: cfg.playgroundPath, name: to.name, title: to.title });
    const childName = 'unterseite';
    const childPath = await sitesConsole.createPage({ parentPath: from.path, name: childName, title: 'QA Unterseite' });
    await sitesConsole.expectPageVisible(childPath);

    const movedPath = await sitesConsole.movePage(childPath, { targetParent: to.path });

    await sitesConsole.waitForPage(movedPath);
    await sitesConsole.expectPageAbsent(childPath);
  });

  test('Seite umbenennen', titleEn('Rename a page'), async ({ sitesConsole, makeTestPage, registerCleanup }) => {
    test.setTimeout(180_000);
    const cfg = getAemConfig();
    const pageData = makeTestPage('seite-umbenennen');
    const newName = `${pageData.name}-neu`;
    registerCleanup(pageData.path);
    registerCleanup(`${cfg.playgroundPath}/${newName}`);
    await sitesConsole.createPage({ parentPath: cfg.playgroundPath, name: pageData.name, title: pageData.title });

    const renamedPath = await sitesConsole.movePage(pageData.path, { targetParent: cfg.playgroundPath, newName });

    await sitesConsole.waitForPage(renamedPath);
    await sitesConsole.expectPageAbsent(pageData.path);
  });

  test('Seiteneigenschaften speichern und erneut anzeigen', titleEn('Save page properties and show them again'), async ({ sitesConsole, makeTestPage, registerCleanup }) => {
    const cfg = getAemConfig();
    const pageData = makeTestPage('seiteneigenschaften');
    registerCleanup(pageData.path);
    await sitesConsole.createPage({ parentPath: cfg.playgroundPath, name: pageData.name, title: pageData.title });

    const values = {
      './navTitle': 'QA Navigationstitel',
      './subtitle': 'QA Untertitel',
      './jcr:description': 'QA Beschreibung für die Migrationsprüfung',
    };
    await sitesConsole.setProperties(pageData.path, values);

    expect(await sitesConsole.readProperties(pageData.path, Object.keys(values))).toEqual(values);
  });

  // Tags steuern Filter- und Suchergebnisse (Filterseite war am 17.11.2026 auf
  // TEST leer, weil cq:tags fehlte). Hier der Redakteursweg: Tag setzen.
  test('Tag in den Seiteneigenschaften setzen und erneut anzeigen', titleEn('Set a tag in the page properties and show it again'), async ({ sitesConsole, makeTestPage, registerCleanup }) => {
    const cfg = getAemConfig();
    const pageData = makeTestPage('seiten-tag');
    registerCleanup(pageData.path);
    await sitesConsole.createPage({ parentPath: cfg.playgroundPath, name: pageData.name, title: pageData.title });

    await sitesConsole.addTag(pageData.path, 'Tag 1', 'Samples:tag1');

    expect(await sitesConsole.readTags(pageData.path)).toEqual(['Samples:tag1']);
  });
});
