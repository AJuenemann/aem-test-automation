import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Logik der neuen Web-UI (webui/public/js/logic.js) und Kontrast der
 * Design-Tokens. Läuft ohne AEM und ohne Browser. Das Modul wird dynamisch
 * geladen, weil es reines JavaScript im Frontend-Verzeichnis ist.
 */
const PUBLIC = path.resolve(process.cwd(), 'webui/public');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let L: any;

test.beforeAll(async () => {
  L = await import(pathToFileURL(path.join(PUBLIC, 'js/logic.js')).href);
});

test.describe('Web-UI-Logik (logic.js)', { tag: '@unit' }, () => {
  test('Theme: gespeicherte Wahl schlägt die Systemeinstellung', () => {
    expect(L.resolveTheme('dark', false)).toBe('dark');
    expect(L.resolveTheme('light', true)).toBe('light');
  });

  test('Theme: ohne gespeicherte Wahl gilt die Systemeinstellung', () => {
    expect(L.resolveTheme(null, true)).toBe('dark');
    expect(L.resolveTheme(null, false)).toBe('light');
    expect(L.resolveTheme('quatsch', false)).toBe('light');
  });

  test('Testschlüssel: Titel trennt Geschwister mit gleicher Datei und Zeile', () => {
    expect(L.testKey('a.spec.ts', 10, 'X')).not.toBe(L.testKey('a.spec.ts', 10, 'Y'));
  });

  test('Umgebungsfilter: env-Tag schränkt ein, ohne Tag läuft der Test überall', () => {
    const ldap = { tags: ['integration', 'env:test'] };
    const free = { tags: ['level1'] };
    expect(L.isTestAllowed(ldap, { env: 'test' })).toBe(true);
    expect(L.isTestAllowed(ldap, { env: 'dev' })).toBe(false);
    expect(L.isTestAllowed(free, { env: 'dev' })).toBe(true);
    expect(L.isTestAllowed(ldap, undefined)).toBe(true);
  });

  test('Unit-only: nur wenn Tests gewählt sind und alle zum Projekt unit gehören', () => {
    expect(L.isUnitOnly(0, [])).toBe(false);
    expect(L.isUnitOnly(2, ['unit'])).toBe(true);
    expect(L.isUnitOnly(2, ['unit', 'chromium'])).toBe(false);
  });

  test('Suche: findet über Titel, Suite, Kategorie und Tags', () => {
    const t = { title: 'Seite anlegen', tags: ['level1'] };
    const f = { label: 'Seiten-CRUD', file: 'tests/basics/page-crud.spec.ts' };
    const g = { label: 'AEM-Basisfunktionen' };
    expect(L.testMatches(t, f, g, 'anlegen')).toBe(true);
    expect(L.testMatches(t, f, g, 'crud')).toBe(true);
    expect(L.testMatches(t, f, g, 'basisfunktionen')).toBe(true);
    expect(L.testMatches(t, f, g, 'level1')).toBe(true);
    expect(L.testMatches(t, f, g, 'ldap')).toBe(false);
    expect(L.testMatches(t, f, g, '')).toBe(true);
  });

  test('Statusart: instabil ist bestanden mit flaky-Kennzeichen, Timeout zählt als Fehlschlag', () => {
    expect(L.statusKind({ status: 'passed' })).toBe('passed');
    expect(L.statusKind({ status: 'passed', flaky: true })).toBe('flaky');
    expect(L.statusKind({ status: 'timedOut' })).toBe('failed');
    expect(L.statusKind({ status: 'skipped' })).toBe('skipped');
  });

  test('Gruppierung: Fehlschläge zuerst, Gruppen mit Fehlern oben, Reihenfolge stabil', () => {
    const rows = [
      { level: 'level1', title: 'a', status: 'passed' },
      { level: 'smoke', title: 'b', status: 'passed' },
      { level: 'level1', title: 'c', status: 'failed' },
      { level: 'level1', title: 'd', status: 'skipped' },
      { level: 'level1', title: 'e', status: 'passed', flaky: true },
      { level: 'level1', title: 'f', status: 'passed' },
    ];
    const groups = L.groupRows(rows);
    expect(groups.map((g: { label: string }) => g.label)).toEqual(['Basisfunktionen (L1)', 'Smoketest']);
    expect(groups[0].rows.map((r: { title: string }) => r.title)).toEqual(['c', 'e', 'd', 'a', 'f']);
    expect(groups[0].counts).toEqual({ failed: 1, flaky: 1, skipped: 1, passed: 2 });
  });

  test('Kernaussage: Fehlschlag, alles grün, teilweise, abgebrochen, leer', () => {
    expect(L.headline({ passed: 3, failed: 2, skipped: 1 }, 'failed')).toBe('2 von 6 Tests fehlgeschlagen');
    expect(L.headline({ passed: 4, failed: 0, skipped: 0 }, 'passed')).toBe('Alle 4 Tests bestanden');
    expect(L.headline({ passed: 1, failed: 0, skipped: 0 }, 'passed')).toBe('1 Test bestanden');
    expect(L.headline({ passed: 3, failed: 0, skipped: 2 }, 'passed')).toBe('3 von 5 Tests bestanden');
    expect(L.headline({ passed: 0, failed: 0, skipped: 0 }, 'passed')).toBe('Keine Tests ausgeführt');
    expect(L.headline({ passed: 1, failed: 0, skipped: 0 }, 'cancelled')).toBe('Lauf abgebrochen');
  });

  test('Formate: Dauer, Uhr, Größe', () => {
    expect(L.fmtDuration(420)).toBe('420 ms');
    expect(L.fmtDuration(1500)).toBe('1.5 s');
    expect(L.fmtClock(65_000)).toBe('1:05');
    expect(L.fmtSize(0)).toBe('0 B');
    expect(L.fmtSize(2048)).toBe('2.0 KB');
    expect(L.fmtSize(3 * 1024 * 1024)).toBe('3.0 MB');
  });

  test('Lauf-Label: Dateinamen ohne Endung, max. 3, Rest als Zähler', () => {
    const tests = ['a', 'b', 'c', 'd'].map((n) => ({ file: `tests/x/${n}.spec.ts` }));
    expect(L.runSelectionLabel({ originalRequest: { tests } })).toBe('a, b, c (+1)');
    expect(L.runSelectionLabel({ originalRequest: { projects: ['setup', 'unit'] } })).toBe('Alle Tests (unit)');
    expect(L.runSelectionLabel({ selection: 'alt' })).toBe('alt');
  });

  test('Historie: Bereich statt Dateinamen, Kernaussage wie in der Detailansicht', () => {
    const map = new Map([['a.spec.ts', 'Smoketest'], ['b.spec.ts', 'Komponenten (L2)'], ['c.spec.ts', 'Integrationstest']]);
    const tests = (...f: string[]) => ({ originalRequest: { tests: f.map((file) => ({ file })) } });
    expect(L.runAreaLabel(tests('b.spec.ts', 'b.spec.ts'), map)).toBe('Komponenten (L2)');
    expect(L.runAreaLabel(tests('a.spec.ts', 'b.spec.ts'), map)).toBe('Smoketest, Komponenten (L2)');
    expect(L.runAreaLabel(tests('a.spec.ts', 'b.spec.ts', 'c.spec.ts'), map)).toBe('Smoketest, Komponenten (L2) (+1)');
    // Nicht zuordenbar (ältere Läufe, ausgeblendete Kategorien): leer, die Oberfläche nimmt dann die Dateinamen.
    expect(L.runAreaLabel(tests('unit/x.spec.ts'), map)).toBe('');
    expect(L.runAreaLabel({ originalRequest: { projects: ['unit'] } }, map)).toBe('');
    expect(L.runHeadline({ status: 'passed', summary: { passed: 24, failed: 0, total: 24 } })).toBe('Alle 24 Tests bestanden');
    expect(L.runHeadline({ status: 'failed', summary: { passed: 3, failed: 1, total: 4 } })).toBe('1 von 4 Tests fehlgeschlagen');
    expect(L.runHeadline({ status: 'cancelled' })).toBe('Lauf abgebrochen');
  });

  test('Lauf-Einstellungen: Kurztext', () => {
    expect(L.runSettingsLabel({ headed: false })).toBe('Headless');
    expect(L.runSettingsLabel({ headed: true, slowMo: 1500, repeatEach: 3, smokeGate: true }))
      .toBe('Sichtbar, Langsam, 3×, Smoketest vorab');
    expect(L.runSettingsLabel(undefined)).toBe('');
  });

  test('Historie: gruppiert nach Monat und Tag, aktueller Monat offen, Reihenfolge bleibt', () => {
    const now = new Date(2026, 10, 19, 12);
    const run = (id: string, d: Date) => ({ id, startedAt: d.toISOString() });
    const groups = L.groupRunsByMonthDay([
      run('1', new Date(2026, 10, 19, 10)),
      run('2', new Date(2026, 10, 19, 9)),
      run('3', new Date(2026, 10, 18, 9)),
      run('4', new Date(2026, 9, 30, 9)),
    ], now);
    expect(groups).toHaveLength(2);
    expect(groups[0].open).toBe(true);
    expect(groups[1].open).toBe(false);
    expect(groups[0].days.map((d: { label: string }) => d.label)).toEqual(['Heute', 'Gestern']);
    expect(groups[0].days[0].runs.map((r: { id: string }) => r.id)).toEqual(['1', '2']);
  });
});

/** Liest die Variablen eines Theme-Blocks aus tokens.css. */
function readTokens(selector: string): Record<string, string> {
  const css = readFileSync(path.join(PUBLIC, 'tokens.css'), 'utf8');
  const start = css.indexOf(selector);
  const block = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  const out: Record<string, string> = {};
  for (const m of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[m[1]] = m[2];
  return out;
}

test.describe('Design-Tokens: Kontrast (WCAG AA)', { tag: '@unit' }, () => {
  // [Vordergrund, Hintergrund, Mindestwert]. 4.5 für Text, 3 für UI-Elemente.
  const pairs: Array<[string, string, number]> = [
    ['text', 'bg', 4.5],
    ['text', 'surface', 4.5],
    ['text-muted', 'surface', 4.5],
    ['text-muted', 'bg', 4.5],
    ['text-muted', 'surface-sunken', 4.5],
    ['on-accent', 'accent', 4.5],
    ['on-accent', 'accent-hover', 4.5],
    ['accent-ink', 'surface', 4.5],
    ['accent-ink', 'accent-soft', 4.5],
    ['link', 'surface', 4.5],
    ['pass', 'pass-bg', 4.5],
    ['fail', 'fail-bg', 4.5],
    ['flaky', 'flaky-bg', 4.5],
    ['skip', 'skip-bg', 4.5],
    ['pass', 'surface', 4.5],
    ['fail', 'surface', 4.5],
    ['code-text', 'code-bg', 4.5],
    ['focus', 'surface', 3],
    ['focus', 'bg', 3],
  ];
  for (const [theme, selector] of [['hell', ':root[data-theme="light"]'], ['dunkel', ':root[data-theme="dark"]']] as const) {
    test(`Theme ${theme}: Textpaare erreichen den Mindestkontrast`, () => {
      const t = readTokens(theme === 'hell' ? ':root,\n:root[data-theme="light"]' : selector);
      const failures: string[] = [];
      for (const [fg, bg, min] of pairs) {
        expect(t[fg], `Token --${fg} fehlt`).toBeTruthy();
        expect(t[bg], `Token --${bg} fehlt`).toBeTruthy();
        const ratio = L.contrastRatio(t[fg], t[bg]);
        if (ratio < min) failures.push(`--${fg} auf --${bg}: ${ratio.toFixed(2)} (min. ${min})`);
      }
      expect(failures, failures.join('\n')).toEqual([]);
    });
  }
});
