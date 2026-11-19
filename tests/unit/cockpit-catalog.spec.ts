import { test, expect } from '@playwright/test';
import { parseCatalog, labelFromFile } from '../../cockpit/catalog.js';
import { levelFromTags, TEST_LEVELS } from '../../fixtures/test-fixtures.js';

/**
 * Prüft den Katalog-Parser auf einer Struktur, die dem echten
 * `playwright test --list --reporter=json`-Output nachgebildet ist:
 * Datei-Suite -> describe-Suite -> specs, plus eine Datei mit direkten specs.
 */
test.describe('Cockpit: parseCatalog', { tag: '@unit' }, () => {
  const raw = {
    suites: [
      {
        title: 'unit/path-guard.spec.ts',
        file: 'unit/path-guard.spec.ts',
        specs: [],
        suites: [
          {
            title: 'assertWithinPlayground',
            file: 'unit/path-guard.spec.ts',
            specs: [
              {
                title: 'erlaubt Pfade',
                file: 'unit/path-guard.spec.ts',
                line: 12,
                tests: [{ projectName: 'unit' }],
              },
              {
                title: 'blockiert Pfade',
                file: 'unit/path-guard.spec.ts',
                line: 18,
                tests: [{ projectName: 'unit' }],
              },
            ],
          },
        ],
      },
      {
        title: 'basics/page-crud.spec.ts',
        file: 'basics/page-crud.spec.ts',
        specs: [],
        suites: [
          {
            title: 'AEM-Basis: Seiten-CRUD',
            file: 'basics/page-crud.spec.ts',
            specs: [
              {
                title: 'Seite anlegen',
                file: 'basics/page-crud.spec.ts',
                line: 12,
                tests: [{ projectName: 'chromium' }],
              },
            ],
          },
        ],
      },
    ],
  };

  test('Flacht Dateien und Tests korrekt ab', () => {
    const catalog = parseCatalog(raw);
    expect(catalog.projects).toEqual(['chromium', 'unit']);
    // Sortierung nach lesbarem Label: "AEM-Basis: Seiten-CRUD" vor "assertWithinPlayground".
    expect(catalog.files.map((f) => f.file)).toEqual([
      'basics/page-crud.spec.ts',
      'unit/path-guard.spec.ts',
    ]);
    const unitFile = catalog.files.find((f) => f.file === 'unit/path-guard.spec.ts');
    // Lesbares Label = der einzige describe-Titel der Datei.
    expect(unitFile?.label).toBe('assertWithinPlayground');
    expect(unitFile?.tests.map((t) => t.title)).toEqual([
      'erlaubt Pfade',
      'blockiert Pfade',
    ]);
    expect(unitFile?.tests[0].line).toBe(12);
    expect(unitFile?.tests[0].projects).toEqual(['unit']);
  });

  test('Label-Ableitung (labelFromFile) leitet lesbaren Namen aus dem Pfad ab', () => {
    expect(labelFromFile('basics/component-edit.spec.ts')).toBe('Component edit');
    expect(labelFromFile('smoke.spec.ts')).toBe('Smoke');
  });

  test('Ohne describe-Titel: Label aus Dateiname (Fallback)', () => {
    const noDescribe = {
      suites: [
        {
          title: 'smoke.spec.ts',
          file: 'smoke.spec.ts',
          specs: [
            {
              title: 'erreichbar',
              file: 'smoke.spec.ts',
              line: 10,
              tests: [{ projectName: 'chromium' }],
            },
          ],
        },
      ],
    };
    expect(parseCatalog(noDescribe).files[0].label).toBe('Smoke');
  });

  test('Blendet das setup-Projekt (auth.setup) aus', () => {
    const withSetup = {
      suites: [
        {
          title: 'auth.setup.ts',
          file: 'auth.setup.ts',
          specs: [
            {
              title: 'authenticate',
              file: 'auth.setup.ts',
              line: 17,
              tests: [{ projectName: 'setup' }],
            },
          ],
        },
        {
          title: 'basics/page-crud.spec.ts',
          file: 'basics/page-crud.spec.ts',
          specs: [
            {
              title: 'Seite anlegen',
              file: 'basics/page-crud.spec.ts',
              line: 12,
              tests: [{ projectName: 'chromium' }],
            },
          ],
        },
      ],
    };
    const catalog = parseCatalog(withSetup);
    // setup taucht weder als Projekt noch als Datei/Test auf.
    expect(catalog.projects).toEqual(['chromium']);
    expect(catalog.files.map((f) => f.file)).toEqual(['basics/page-crud.spec.ts']);
  });

  test('Führt denselben Test über mehrere Projekte zusammen', () => {
    const multi = {
      suites: [
        {
          file: 'a.spec.ts',
          specs: [
            {
              title: 'gleicher Test',
              file: 'a.spec.ts',
              line: 5,
              tests: [{ projectName: 'chromium' }, { projectName: 'firefox' }],
            },
          ],
        },
      ],
    };
    const catalog = parseCatalog(multi);
    expect(catalog.files[0].tests[0].projects).toEqual(['chromium', 'firefox']);
  });

  test('Gruppiert Dateien nach Kategorie (Tag) in order-Reihenfolge', () => {
    const tagged = {
      suites: [
        {
          file: 'smoke.spec.ts',
          specs: [{ title: 's', file: 'smoke.spec.ts', line: 1, tags: ['smoke'], tests: [{ projectName: 'chromium' }] }],
        },
        {
          file: 'basics/visual.spec.ts',
          specs: [{ title: 'v', file: 'basics/visual.spec.ts', line: 1, tags: ['level1', 'visual'], tests: [{ projectName: 'chromium' }] }],
        },
        {
          file: 'x.spec.ts',
          specs: [{ title: 'x', file: 'x.spec.ts', line: 1, tests: [{ projectName: 'chromium' }] }],
        },
      ],
    };
    const categories = [
      { tag: 'smoke', label: 'Smoke', order: 10 },
      { tag: 'level1', label: 'Level 1', order: 20 },
    ];
    const catalog = parseCatalog(tagged, categories);

    // Tags landen am Test.
    const visual = catalog.files.find((f) => f.file === 'basics/visual.spec.ts');
    expect(visual?.tests[0].tags).toEqual(['level1', 'visual']);
    // Mehrere Kategorie-Tags -> niedrigstes order (level1 vor visual; visual ist keine Kategorie).
    expect(visual?.categoryTag).toBe('level1');

    // Gruppen in order-Reihenfolge, Unkategorisiertes als "Sonstige" am Ende.
    expect(catalog.groups.map((g) => g.label)).toEqual(['Smoke', 'Level 1', 'Sonstige']);
    expect(catalog.groups[2].files.map((f) => f.file)).toEqual(['x.spec.ts']);
  });

  test('Blendet als hidden markierte Kategorien (Unit) in der UI aus', () => {
    const tagged = {
      suites: [
        { file: 'u.spec.ts', specs: [{ title: 'u', file: 'u.spec.ts', line: 1, tags: ['unit'], tests: [{ projectName: 'unit' }] }] },
        { file: 'c.spec.ts', specs: [{ title: 'c', file: 'c.spec.ts', line: 1, tags: ['level1'], tests: [{ projectName: 'chromium' }] }] },
      ],
    };
    const categories = [
      { tag: 'level1', label: 'Level 1', order: 20 },
      { tag: 'unit', label: 'Unit', order: 90, hidden: true },
    ];
    const catalog = parseCatalog(tagged, categories);
    // Unit-Gruppe fehlt; Unit-Datei auch nicht unter "Sonstige".
    expect(catalog.groups.map((g) => g.label)).toEqual(['Level 1']);
    expect(catalog.files.map((f) => f.file)).toEqual(['c.spec.ts']);
  });

  test('Liest englische Test- und Suite-Namen aus den Annotationen (_title-en, _describe-en)', () => {
    const ann = (type: string, description: string) => ({ type, description });
    const spec = (title: string, line: number, annotations: object[]) => ({
      title, file: 'a.spec.ts', line, tags: ['level1'], tests: [{ projectName: 'chromium', annotations }],
    });
    const suite = (specs: object[], suites: object[] = [{ title: 'Seiten', specs, suites: [] }]) =>
      ({ suites: [{ file: 'a.spec.ts', specs: [], suites }] });
    const withEn = suite([
      spec('Seite anlegen', 3, [ann('_describe-en', 'Pages'), ann('_title-en', 'Create a page')]),
      spec('Ohne Englisch', 9, [ann('_describe-en', 'Pages')]),
    ]);
    const file = parseCatalog(withEn, [{ tag: 'level1', label: 'L1', order: 20 }]).files[0];
    expect(file.label).toBe('Seiten');
    expect(file.labelEn).toBe('Pages');
    expect(file.tests.map((t) => t.titleEn)).toEqual(['Create a page', undefined]);
    // Ohne Annotationen entstehen keine leeren Felder.
    const plain = parseCatalog(suite([spec('Seite anlegen', 3, [])])).files[0];
    expect('labelEn' in plain).toBe(false);
    expect('titleEn' in plain.tests[0]).toBe(false);
    // Mehrere describe-Titel in einer Datei: der Name stammt aus dem Dateinamen, kein englischer Suite-Name.
    const two = suite([], [
      { title: 'A', specs: [spec('x', 1, [ann('_describe-en', 'A en')])], suites: [] },
      { title: 'B', specs: [spec('y', 2, [ann('_describe-en', 'B en')])], suites: [] },
    ]);
    expect('labelEn' in parseCatalog(two).files[0]).toBe(false);
  });
  test('Reicht englische Texte (labelEn, descriptionEn) additiv an die Gruppen durch', () => {
    const tagged = {
      suites: [
        { file: 's.spec.ts', specs: [{ title: 's', file: 's.spec.ts', line: 1, tags: ['smoke'], tests: [{ projectName: 'chromium' }] }] },
        { file: 'x.spec.ts', specs: [{ title: 'x', file: 'x.spec.ts', line: 1, tests: [{ projectName: 'chromium' }] }] },
      ],
    };
    const categories = [{ tag: 'smoke', label: 'Smoketest', labelEn: 'Smoke test', description: 'Bereit?', descriptionEn: 'Ready?', order: 10 }];
    const groups = parseCatalog(tagged, categories).groups;
    expect(groups[0]).toMatchObject({ tag: 'smoke', label: 'Smoketest', labelEn: 'Smoke test', descriptionEn: 'Ready?' });
    // Unkategorisiert: deutscher Name bleibt, englischer kommt dazu.
    expect(groups[1]).toMatchObject({ label: 'Sonstige', labelEn: 'Other' });
    // Ohne englische Texte entstehen keine leeren Felder (alte Oberfläche und Tests bleiben unberührt).
    const plain = parseCatalog(tagged, [{ tag: 'smoke', label: 'Smoketest', order: 10 }]).groups[0];
    expect('labelEn' in plain).toBe(false);
    expect('descriptionEn' in plain).toBe(false);
  });
  test('Gruppiert die neuen Kategorien (components/integration/regression) in order-Reihenfolge', () => {
    const tagged = {
      suites: [
        { file: 'r.spec.ts', specs: [{ title: 'r', file: 'r.spec.ts', line: 1, tags: ['regression'], tests: [{ projectName: 'chromium' }] }] },
        { file: 'c.spec.ts', specs: [{ title: 'c', file: 'c.spec.ts', line: 1, tags: ['level2-components'], tests: [{ projectName: 'chromium' }] }] },
        { file: 'i.spec.ts', specs: [{ title: 'i', file: 'i.spec.ts', line: 1, tags: ['integration'], tests: [{ projectName: 'chromium' }] }] },
      ],
    };
    const categories = [
      { tag: 'level2-components', label: 'Level 2 — Komponenten-Dialoge', order: 30 },
      { tag: 'integration', label: 'Integration', order: 40 },
      { tag: 'regression', label: 'Regression — Overlays & Fehlerseiten', order: 50 },
    ];
    const catalog = parseCatalog(tagged, categories);
    expect(catalog.groups.map((g) => g.label)).toEqual([
      'Level 2 — Komponenten-Dialoge',
      'Integration',
      'Regression — Overlays & Fehlerseiten',
    ]);
  });
});

/**
 * Level-Ableitung aus Test-Tags (fixtures). Die neuen Level-Tags müssen von
 * makeTestPage akzeptiert werden, sonst wirft die Seitennamen-Erzeugung.
 */
test.describe('Level aus Tags (levelFromTags)', { tag: '@unit' }, () => {
  test('Erkennt die neuen Level-Tags', () => {
    expect(levelFromTags(['@level2-components'])).toBe('level2-components');
    expect(levelFromTags(['@integration'])).toBe('integration');
    expect(levelFromTags(['@regression', '@visual'])).toBe('regression');
  });

  test('Wirft ohne bekannten Level-Tag', () => {
    expect(() => levelFromTags(['@visual'])).toThrow(/Level-Tag/);
  });

  test('TEST_LEVELS enthält die neuen Stufen', () => {
    expect(TEST_LEVELS).toContain('level2-components');
    expect(TEST_LEVELS).toContain('integration');
    expect(TEST_LEVELS).toContain('regression');
  });
});
