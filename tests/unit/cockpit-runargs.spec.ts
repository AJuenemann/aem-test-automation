import { test, expect } from '@playwright/test';
import { buildRun, grepFromTitles } from '../../cockpit/runArgs.js';

const TEST_ENV = {
  id: 'test',
  label: 'TEST',
  baseUrl: 'https://aem-author-test.ws.fraunhofer.de',
  publishUrl: 'https://aem-publish1-test.ws.fraunhofer.de',
  env: 'test',
};

test.describe('Cockpit: buildRun', { tag: '@unit' }, () => {
  test('Einzelner Test + headless + Default-Worker', () => {
    const built = buildRun({
      tests: [{ file: 'basics/page-crud.spec.ts', line: 12 }],
      projects: ['chromium'],
      environment: TEST_ENV,
      headed: false,
    });
    // chromium zieht setup nach (Dependency). Positionaler Filter OHNE `--`
    // (sonst ignoriert Playwright den Filter und läuft das ganze Projekt).
    expect(built.args).toEqual([
      'test',
      '--project=setup',
      '--project=chromium',
      '--workers=1',
      'basics/page-crud.spec.ts:12',
    ]);
    expect(built.env).toEqual({
      AEM_BASE_URL: 'https://aem-author-test.ws.fraunhofer.de',
      AEM_PUBLISH_URL: 'https://aem-publish1-test.ws.fraunhofer.de',
      AEM_ENV: 'test',
      SMOKE_GATE: '0',
    });
  });

  test('Smoketest-Vorstufe: aus ohne Schalter, an mit Schalter', () => {
    // Ohne Schalter nur die Auswahl (plus Login): Config-Default "an" wird überschrieben.
    expect(buildRun({ projects: ['chromium'] }).env.SMOKE_GATE).toBe('0');
    expect(buildRun({ projects: ['chromium'], smokeGate: true }).env.SMOKE_GATE).toBe('1');
  });

  test('Nur Smoketests ziehen setup nach', () => {
    const built = buildRun({ projects: ['smoke'], environment: TEST_ENV });
    expect(built.args.slice(0, 3)).toEqual(['test', '--project=setup', '--project=smoke']);
  });

  test('Headed setzt --headed, UI-Mode setzt --ui (schließt sich aus)', () => {
    const headed = buildRun({ projects: ['unit'], headed: true });
    expect(headed.args).toContain('--headed');
    expect(headed.args).not.toContain('--ui');

    const ui = buildRun({ projects: ['chromium'], uiMode: true, grep: 'Seite' });
    expect(ui.args).toContain('--ui');
    expect(ui.args).not.toContain('--headed');
    // UI-Mode: Projekte + grep werden übernommen, workers/positionale nicht.
    expect(ui.args).toContain('--project=chromium');
    expect(ui.args).toContain('--grep=Seite');
    expect(ui.args.some((a) => a.startsWith('--workers'))).toBe(false);
    expect(ui.args).not.toContain('--');
  });

  test('UI-Mode ignoriert positionale datei:zeile-Filter', () => {
    const ui = buildRun({
      uiMode: true,
      projects: ['chromium'],
      tests: [{ file: 'basics/page-crud.spec.ts', line: 12 }],
    });
    // --ui kann datei:zeile nicht vorfiltern -> nicht übergeben.
    expect(ui.args).not.toContain('--');
    expect(ui.args.some((a) => a.includes('page-crud.spec.ts:12'))).toBe(false);
  });

  test('Positionaler Dateifilter ohne `--` (sonst läuft das ganze Projekt)', () => {
    const built = buildRun({
      projects: ['chromium'],
      files: ['basics/page-crud.spec.ts'],
    });
    expect(built.args).not.toContain('--');
    expect(built.args).toContain('basics/page-crud.spec.ts');
    // Filter steht hinter den Optionen (am Ende).
    expect(built.args[built.args.length - 1]).toBe('basics/page-crud.spec.ts');
  });

  test('Zusatzoptionen: grep, repeat-each, workers, update-snapshots', () => {
    const built = buildRun({
      projects: ['unit'],
      grep: 'Pfad',
      repeatEach: 3,
      workers: 2,
      updateSnapshots: true,
    });
    expect(built.args).toContain('--grep=Pfad');
    expect(built.args).toContain('--repeat-each=3');
    expect(built.args).toContain('--workers=2');
    // Modus "all": "changed" (Default) ließe Baselines unter der Toleranz unverändert.
    expect(built.args).toContain('--update-snapshots=all');
  });

  test('Flag --update-snapshots steht NACH dem positionalen Filter (sonst als mode fehlgedeutet)', () => {
    const built = buildRun({
      tests: [{ file: 'tests/components/visual-publish.spec.ts', line: 26, title: 'X' }],
      projects: ['chromium'],
      environment: TEST_ENV,
      updateSnapshots: true,
    });
    const idxPositional = built.args.indexOf('tests/components/visual-publish.spec.ts:26');
    const idxUpdate = built.args.indexOf('--update-snapshots=all');
    expect(idxPositional).toBeGreaterThan(-1);
    // Flag muss NACH dem Positional kommen, sonst schluckt es den Pfad als mode.
    expect(idxUpdate).toBeGreaterThan(idxPositional);
  });

  test('SlowMo nur im Headed-Modus als PWA_SLOWMO', () => {
    const headed = buildRun({ projects: ['chromium'], headed: true, slowMo: 500 });
    expect(headed.env.PWA_SLOWMO).toBe('500');
    // Ohne headed (headless) keine Verlangsamung.
    const headless = buildRun({ projects: ['chromium'], headed: false, slowMo: 500 });
    expect(headless.env.PWA_SLOWMO).toBeUndefined();
    // slowMo 0 setzt nichts.
    expect(buildRun({ projects: ['chromium'], headed: true, slowMo: 0 }).env.PWA_SLOWMO).toBeUndefined();
  });

  test('Leere baseUrl (legacy ohne URL) setzt AEM_BASE_URL nicht', () => {
    const built = buildRun({
      projects: ['unit'],
      environment: { id: 'legacy', label: 'LEGACY', baseUrl: '', env: 'legacy' },
    });
    expect(built.env.AEM_BASE_URL).toBeUndefined();
    expect(built.env.AEM_PUBLISH_URL).toBeUndefined();
    expect(built.env.AEM_ENV).toBe('legacy');
  });

  test('Vorschau enthält env-Prefix und playwright-Aufruf', () => {
    const built = buildRun({ projects: ['unit'], environment: TEST_ENV });
    expect(built.preview).toContain('AEM_ENV=test');
    expect(built.preview).toContain('npx playwright test');
  });

  // Datengetriebene Tests: gleiche Datei:Zeile, Titel grenzt den konkreten ein.
  test('Titel-Grep (grepFromTitles) baut eine escapte Alternation der Titel', () => {
    expect(grepFromTitles([
      { file: 'f.spec.ts', line: 26, title: 'gerenderte Seite "Section" entspricht Baseline' },
    ])).toBe('gerenderte Seite "Section" entspricht Baseline');
    // Regex-Sonderzeichen werden escapt; Duplikate entfernt.
    expect(grepFromTitles([
      { file: 'f.spec.ts', line: 26, title: 'Dialog (a)' },
      { file: 'f.spec.ts', line: 26, title: 'Dialog (a)' },
    ])).toBe('Dialog \\(a\\)');
    expect(grepFromTitles([{ file: 'f.spec.ts', line: 26 }])).toBe('');
  });

  test('Auswahl mit Titel setzt --grep (datengetriebener Test)', () => {
    const built = buildRun({
      tests: [{ file: 'components/visual-publish.spec.ts', line: 26, title: 'gerenderte Seite "Section" entspricht Baseline' }],
      projects: ['chromium'],
      environment: TEST_ENV,
    });
    expect(built.args).toContain('--grep=gerenderte Seite "Section" entspricht Baseline');
    expect(built.args).toContain('components/visual-publish.spec.ts:26');
  });

  test('Freies --grep (Suchfeld) hat Vorrang vor dem Titel-grep', () => {
    const built = buildRun({
      tests: [{ file: 'f.spec.ts', line: 26, title: 'Titel A' }],
      projects: ['chromium'],
      environment: TEST_ENV,
      grep: 'eigenes Muster',
    });
    expect(built.args).toContain('--grep=eigenes Muster');
    expect(built.args).not.toContain('--grep=Titel A');
  });
});
