import { test, expect, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { promises as fs, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Zweisprachige Web-UI (DE / EN-US): Wörterbücher, Sprachwahl und Umschalten.
 * Läuft ohne AEM. Der Browser-Teil nutzt einen kleinen lokalen Server mit festen API-Daten
 * (wie webui-ui.spec.ts). Testtitel, Dateinamen und Playwright-Texte bleiben bewusst unübersetzt.
 */
const PUBLIC = path.resolve(process.cwd(), 'webui/public');
const WEBUI = path.resolve(process.cwd(), 'webui');
const JS = path.join(PUBLIC, 'js');
const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

/* eslint-disable @typescript-eslint/no-explicit-any */
let I: any; // js/i18n.js
let L: any; // js/logic.js
let DE: Record<string, string>;
let EN: Record<string, string>;

test.beforeAll(async () => {
  I = await import(pathToFileURL(path.join(JS, 'i18n.js')).href);
  L = await import(pathToFileURL(path.join(JS, 'logic.js')).href);
  DE = (await import(pathToFileURL(path.join(JS, 'i18n/de.js')).href)).default;
  EN = (await import(pathToFileURL(path.join(JS, 'i18n/en.js')).href)).default;
});
test.afterEach(() => I?.setLang('de'));

/** Quelltexte der Web-UI ohne die Wörterbücher: app.js, js/*.js, index.html. */
function sources(): Record<string, string> {
  const out: Record<string, string> = {
    'app.js': readFileSync(path.join(PUBLIC, 'app.js'), 'utf8'),
    'index.html': readFileSync(path.join(PUBLIC, 'index.html'), 'utf8'),
  };
  for (const f of readdirSync(JS).filter((n) => n.endsWith('.js') && n !== 'i18n.js')) {
    out[`js/${f}`] = readFileSync(path.join(JS, f), 'utf8');
  }
  return out;
}
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

test.describe('Web-UI i18n: Sprachwahl und Kern', { tag: '@unit' }, () => {
  test('Startsprache: Systemsprache Deutsch -> DE, sonst EN, gespeicherte Wahl gewinnt', () => {
    expect(L.resolveLang(null, ['de-DE'])).toBe('de');
    expect(L.resolveLang(null, ['de'])).toBe('de');
    expect(L.resolveLang(null, ['de-AT', 'en'])).toBe('de');
    expect(L.resolveLang(null, ['en-US'])).toBe('en');
    expect(L.resolveLang(null, ['fr-FR', 'de'])).toBe('en');
    expect(L.resolveLang(null, ['dev'])).toBe('en');
    expect(L.resolveLang(null, [])).toBe('en');
    expect(L.resolveLang(null, undefined)).toBe('en');
    expect(L.resolveLang('en', ['de-DE'])).toBe('en');
    expect(L.resolveLang('de', ['en-US'])).toBe('de');
    expect(L.resolveLang('quatsch', ['de-DE'])).toBe('de');
  });

  test('Übersetzung: Platzhalter, Fallback auf Deutsch, dann auf den Schlüssel', () => {
    I.setLang('de');
    expect(I.t('headline.all', { total: 4 })).toBe('Alle 4 Tests bestanden');
    I.setLang('en');
    expect(I.t('headline.all', { total: 4 })).toBe('All 4 tests passed');
    expect(I.t('gibt.es.nicht')).toBe('gibt.es.nicht');
    expect(I.t('res.meta.running', {})).toBe('running for {time}');
    I.setLang('xx');
    expect(I.getLang()).toBe('en');
  });

  test('Plural: eine und mehrere Formen, {n} automatisch', () => {
    I.setLang('de');
    expect(I.tn('count.tests', 1)).toBe('1 Test');
    expect(I.tn('count.tests', 2)).toBe('2 Tests');
    expect(I.tn('count.areasIn', 2)).toBe('2 Bereichen');
    I.setLang('en');
    expect(I.tn('count.tests', 1)).toBe('1 test');
    expect(I.tn('count.tests', 0)).toBe('0 tests');
    expect(I.tn('count.areasIn', 1)).toBe('1 area');
  });

  test('Locale: Datum und Zeit folgen der Sprache', () => {
    I.setLang('de');
    expect(I.locale()).toBe('de-DE');
    I.setLang('en');
    expect(I.locale()).toBe('en-US');
    const d = new Date(2026, 10, 18, 9);
    const now = new Date(2026, 10, 19, 12);
    expect(L.dayLabel(d, now)).toBe('Yesterday');
    expect(L.dayLabel(now, now)).toBe('Today');
    expect(L.groupRunsByMonthDay([{ id: '1', startedAt: d.toISOString() }], now)[0].label).toBe('November 2026');
    I.setLang('de');
    expect(L.dayLabel(d, now)).toBe('Gestern');
    expect(L.groupRunsByMonthDay([{ id: '1', startedAt: d.toISOString() }], now)[0].label).toBe('November 2026');
  });

  test('Formatierer: Kernaussage, Einstellungen und Bereiche auch auf Englisch', () => {
    I.setLang('en');
    expect(L.headline({ passed: 3, failed: 2, skipped: 1 }, 'failed')).toBe('2 of 6 tests failed');
    expect(L.headline({ passed: 1, failed: 1, skipped: 0 }, 'failed')).toBe('1 of 2 tests failed');
    expect(L.headline({ passed: 1, failed: 0, skipped: 0 }, 'passed')).toBe('1 test passed');
    expect(L.headline({ passed: 3, failed: 0, skipped: 2 }, 'passed')).toBe('3 of 5 tests passed');
    expect(L.headline({ passed: 0, failed: 0, skipped: 0 }, 'passed')).toBe('No tests run');
    expect(L.headline({ passed: 1, failed: 0, skipped: 0 }, 'cancelled')).toBe('Run cancelled');
    expect(L.levelLabel('level1')).toBe('Core functions (L1)');
    expect(L.levelLabel('')).toBe('Other');
    expect(L.runSettingsLabel({ headed: true, slowMo: 1500, repeatEach: 3, smokeGate: true }))
      .toBe('Visible, Slow, 3×, Smoke test first');
    expect(L.runSelectionLabel({ originalRequest: { projects: ['setup', 'unit'] } })).toBe('All tests (unit)');
    expect(L.runHeadline({ status: 'running' })).toBe('Running');
  });

  test('Suche: findet Kategorien über deutschen und englischen Namen', () => {
    const t = { title: 'Seite anlegen', tags: [] };
    const f = { label: 'Seiten-CRUD', file: 'basics/page-crud.spec.ts' };
    const g = { label: 'AEM-Basisfunktionen', labelEn: 'AEM core functions' };
    expect(L.testMatches(t, f, g, 'basisfunktionen')).toBe(true);
    expect(L.testMatches(t, f, g, 'core functions')).toBe(true);
    expect(L.testMatches(t, f, g, 'ldap')).toBe(false);
  });
});

test.describe('Web-UI i18n: Wörterbücher und Quelltext', { tag: '@unit' }, () => {
  test('Wörterbücher: gleiche Schlüssel, gleiche Platzhalter, keine leeren Werte', () => {
    const de = Object.keys(DE).sort();
    const en = Object.keys(EN).sort();
    expect(en.filter((k) => !(k in DE)), 'nur in en.js').toEqual([]);
    expect(de.filter((k) => !(k in EN)), 'nur in de.js').toEqual([]);
    const problems: string[] = [];
    for (const k of de) {
      if (!DE[k].trim() || !EN[k].trim()) problems.push(`${k}: leer`);
      if (placeholders(DE[k]).join() !== placeholders(EN[k]).join()) problems.push(`${k}: Platzhalter ungleich`);
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('Pluralformen: zu jedem .one gibt es ein .other', () => {
    for (const dict of [DE, EN]) {
      for (const k of Object.keys(dict).filter((n) => n.endsWith('.one'))) {
        expect(dict[`${k.slice(0, -4)}.other`], `${k} ohne .other`).toBeTruthy();
      }
    }
  });

  test('Englisch ist übersetzt: kein Wert gleicht dem deutschen Text (außer Eigennamen)', () => {
    const same = new Set([
      'res.report', 'mode.headless', 'artifact.trace', 'artifact.video', 'artifact.diff', 'artifact.screenshot',
      'artifact.expected', 'level.unit', 'settings.headless', 'sum.repeat', 'env.hint.url', 'uimode.title',
      'base.alt', 'warn.unreadable', 'history.report', 'headline.single', 'history.flakyCount',
      'sum.tests', 'res.row.repeat', 'cleanup.dialog.where', 'cleanup.env.pages.one', 'cleanup.env.pages.other',
      'slowmo.0', 'cleanup.toast.done', 'cleanup.toast.doneFailed', 'opt.grep', 'uimode.hint.filter',
    ]);
    const unchanged = Object.keys(DE).filter((k) => DE[k] === EN[k] && !same.has(k));
    expect(unchanged, unchanged.join('\n')).toEqual([]);
  });

  test('Quelltext: jeder Schlüssel in index.html und in t()/tn()-Aufrufen existiert', () => {
    const missing: string[] = [];
    for (const [file, src] of Object.entries(sources())) {
      const keys = file === 'index.html'
        ? [...src.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)].map((m) => m[1])
        : [...stripComments(src).matchAll(/\b(?:t|tn)\(\s*(['"`])([A-Za-z0-9_.-]+)\1/g)].map((m) => m[2]);
      for (const key of keys) {
        const ok = key in DE || `${key}.other` in DE;
        if (!ok) missing.push(`${file}: ${key}`);
      }
    }
    expect(missing, missing.join('\n')).toEqual([]);
  });

  test('Quelltext: kein Wörterbucheintrag bleibt ungenutzt', () => {
    const literals = new Set<string>();
    for (const [file, src] of Object.entries(sources())) {
      const text = file === 'index.html' ? src : stripComments(src);
      for (const m of text.matchAll(/(['"`])([A-Za-z0-9_.-]+)\1/g)) literals.add(m[2]);
      for (const m of text.matchAll(/data-i18n(?:-[a-z-]+)?="([^"]+)"/g)) literals.add(m[1]);
    }
    // Schlüsselfamilien, die zur Laufzeit zusammengesetzt werden (z. B. `level.${tag}`).
    const dynamic = ['level.', 'slowmo.', 'artifact.', 'blocker.', 'err.', 'status.', 'res.filter.', 'step.block.', 'lang.name.', 'tab.'];
    const unused = Object.keys(DE).filter((k) => {
      const base = k.replace(/\.(one|other)$/, '');
      return !literals.has(k) && !literals.has(base) && !dynamic.some((p) => k.startsWith(p));
    });
    expect(unused, unused.join('\n')).toEqual([]);
  });

  test('Schlüsselfamilien: Tags, Reiter, Stufen, Status, Blocker und Server-Codes haben Texte', () => {
    const categories = JSON.parse(readFileSync(path.join(WEBUI, 'categories.json'), 'utf8')).categories as { tag: string; labelEn?: string; descriptionEn?: string }[];
    const need: string[] = [];
    for (const c of categories) {
      need.push(`level.${c.tag}`);
      if (!c.labelEn || !c.descriptionEn) need.push(`categories.json: ${c.tag} ohne labelEn/descriptionEn`);
    }
    need.push(...['testlauf', 'ergebnisse', 'werkzeuge'].map((x) => `tab.${x}`));
    need.push(...['0', '500', '1500', '3000'].map((x) => `slowmo.${x}`));
    need.push(...['passed', 'failed', 'cancelled', 'running'].map((x) => `status.${x}`));
    need.push(...['all', 'failed', 'flaky', 'skipped', 'passed'].map((x) => `res.filter.${x}`));
    need.push(...['network', 'env', 'login', 'smoke'].map((x) => `blocker.${x}`));
    need.push(...['de', 'en'].map((x) => `lang.name.${x}`));
    const server = readFileSync(path.join(WEBUI, 'server.ts'), 'utf8');
    const codes = new Set([...server.matchAll(/\bcode: '([\w.]+)'/g), ...server.matchAll(/new CodedError\('([\w.]+)'/g)].map((m) => m[1]));
    for (const code of codes) {
      if (code.startsWith('cleanup.')) continue; // Hinweise: warn.unreadable / warn.notSearched
      need.push(`err.${code}`);
    }
    const missing = need.filter((k) => !(k in DE) && !(k in EN) && !k.includes(' '));
    const broken = need.filter((k) => k.includes(' '));
    expect(missing, missing.join('\n')).toEqual([]);
    expect(broken, broken.join('\n')).toEqual([]);
    expect(codes.size).toBeGreaterThan(8);
  });

  test('Quelltext: keine deutschen Texte mehr in den JS-Modulen', () => {
    // Umlaute und typische deutsche Wörter in Zeichenketten (Kommentare zählen nicht).
    const german = /(['"`])(?:(?!\1)[^\n\\]|\\.)*(?:[äöüÄÖÜß]|\b(?:Lauf|Läufe|Umgebung|Keine|Zuerst|wählen|Fehler|nicht|Tests)\b)(?:(?!\1)[^\n\\]|\\.)*\1/;
    const found: string[] = [];
    for (const [file, src] of Object.entries(sources())) {
      if (file === 'index.html') continue;
      stripComments(src).split('\n').forEach((line, i) => {
        // CSS-Selektoren, Schlüssel und Regex-Literale sind keine Anzeigetexte.
        if (german.test(line) && !/CAPTURE_DIALOGS|\.cleanup-|\/\^/.test(line)) found.push(`${file}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(found, found.join('\n')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Browser: Schalter, Persistenz, Umschalten ohne Zustandsverlust
// ---------------------------------------------------------------------------
const ENVS = [
  { id: 'dev', label: 'DEV (Entwicklung)', labelEn: 'DEV (development)', env: 'dev', baseUrl: 'https://dev.example' },
  { id: 'test', label: 'TEST (primär)', labelEn: 'TEST (primary)', env: 'test', baseUrl: 'https://test.example' },
];
const mkTest = (title: string, extra: Record<string, unknown> = {}) =>
  ({ title, file: 'smoke.spec.ts', line: 3, projects: ['smoke'], tags: ['smoke'], ...extra });
const CATALOG = {
  groups: [
    {
      tag: 'smoke', label: 'Smoketest', labelEn: 'Smoke test',
      description: 'Umgebung bereit?', descriptionEn: 'Environment ready?',
      files: [{ label: 'Smoke', file: 'smoke.spec.ts', tests: [mkTest('Login ok'), mkTest('Seite laden', { line: 9 })] }],
    },
    {
      tag: 'integration', label: 'Integrationstest', labelEn: 'Integration test',
      description: 'Zusammenspiel', descriptionEn: 'Interplay',
      files: [{ label: 'LDAP', file: 'integration/ldap.spec.ts', tests: [mkTest('LDAP-Import', { file: 'integration/ldap.spec.ts', line: 5, tags: ['integration', 'env:test'] })] }],
    },
  ],
};
const RUN_ID = '11111111-1111-4111-8111-111111111111';
const RUN = {
  id: RUN_ID, status: 'failed', startedAt: new Date(2026, 10, 19, 14, 30).toISOString(),
  environment: 'DEV (Entwicklung)', sizeBytes: 2048, summary: { passed: 2, failed: 1, skipped: 0, flaky: 0, total: 3 },
  settings: { headed: false, slowMo: 0, repeatEach: 1, workers: 1, smokeGate: false, updateSnapshots: false },
  originalRequest: { tests: [{ file: 'smoke.spec.ts', line: 3, title: 'Login ok' }] },
};
const REPORT = {
  summary: { passed: 2, failed: 1, skipped: 0, flaky: 0, total: 3, durationMs: 4200 },
  blocker: 'Umgebungs-Blocker: Smoketest fehlgeschlagen (Login ok). Die übrigen AEM-Tests wurden deshalb nicht ausgeführt. Ursache in der Smoketest-Zeile prüfen.',
  blockerInfo: { code: 'smoke', params: { tests: 'Login ok' } },
  rows: [
    { level: 'smoke', title: 'login ok', file: 'smoke.spec.ts', status: 'passed', durationMs: 900, attachments: [] },
    { level: 'smoke', title: 'seite laden', file: 'smoke.spec.ts', status: 'failed', durationMs: 3000, retryCount: 1,
      repeatIndex: 2, repeatTotal: 3, repeatLabel: 'Durchlauf 2/3',
      errorSummary: 'Timeout beim Laden', errorDetail: 'Zeile 1', attachments: [{ name: 'screenshot', url: '/files/x.png' }] },
    { level: 'smoke', title: 'ende', file: 'smoke.spec.ts', status: 'passed', durationMs: 300, attachments: [] },
  ],
};

let server: Server;
let base = '';
test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://x');
    const json = (data: unknown) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
    switch (url.pathname) {
      case '/api/tests': return json(CATALOG);
      case '/api/environments': return json({ environments: ENVS, serverStartId: 'srv-1' });
      case '/api/runs': return json({ runs: [RUN], totalSizeBytes: 2048 });
      case '/api/status': return json({});
      case '/api/preview': return json({ preview: 'npx playwright test' });
      case '/api/baselines': return json({ environments: [], entries: [] });
      case '/api/cleanup/list':
        return json({
          playgrounds: ['/content/fhgtest'],
          environments: [{
            id: 'dev', label: 'DEV', labelEn: 'DEV', pages: ['level1-x-20261119-101010-abcd'],
            warnings: ['/content/dam/fhgtest nicht lesbar (HTTP 404).'],
            warningNotes: [{ code: 'cleanup.unreadable', params: { root: '/content/dam/fhgtest', status: '404' } }],
          }],
        });
      case `/api/run/${RUN_ID}/report`: return json(REPORT);
      default: {
        const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        const abs = path.resolve(PUBLIC, rel);
        if (!abs.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
        try {
          const body = await fs.readFile(abs);
          res.writeHead(200, { 'content-type': MIME[path.extname(abs)] || 'application/octet-stream' });
          return res.end(body);
        } catch { res.writeHead(404); return res.end(); }
      }
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
});
test.afterAll(() => new Promise<void>((r) => server.close(() => r())));

async function open(page: Page, hash = '') {
  await page.goto(`${base}/${hash}`);
  await expect(page.locator('.cat-group')).toHaveCount(CATALOG.groups.length);
}

// Deutsche Wörter, die in der englischen Oberfläche nicht mehr vorkommen dürfen.
const GERMAN = new RegExp(
  '(?<![\\p{L}])(Testlauf|Umgebung|Ergebnisse|Werkzeuge|Läufe|Lauf|Abbrechen|Weiter|wählen|auswählen|Keine|Noch|' +
  'Zurücksetzen|Schritte|Schritt|Frühere|Testseiten|löschen|Beenden|Oberfläche|Hilfsfunktionen|Ausführung|' +
  'Bestätigen|Schließen|Sprache|Anwendung|Einstellungen|Hell|Dunkel)(?![\\p{L}])', 'u');

/** Alle Anzeigetexte (Text und title/aria-label/placeholder) der Seite. */
async function allTexts(page: Page): Promise<string> {
  return page.evaluate(() => {
    const parts: string[] = [document.body.textContent || '', document.title];
    document.querySelectorAll('[title],[aria-label],[placeholder]').forEach((el) => {
      for (const a of ['title', 'aria-label', 'placeholder']) {
        const v = el.getAttribute(a);
        if (v) parts.push(v);
      }
    });
    return parts.join('\n');
  });
}

test.describe('Web-UI i18n: Startsprache nach Systemsprache', { tag: '@unit' }, () => {
  test.describe('Englisch (en-US)', () => {
    test.use({ locale: 'en-US' });
    test('Systemsprache Englisch -> EN, Schalter zeigt EN', async ({ page }) => {
      await open(page);
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(page.locator('#lang-toggle')).toHaveText('EN');
      await expect(page).toHaveTitle('Test run · AEM Test Automation');
      await expect(page.getByRole('tab', { name: 'Test run' })).toBeVisible();
    });
  });
  test.describe('Französisch (fr-FR)', () => {
    test.use({ locale: 'fr-FR' });
    test('Systemsprache nicht Deutsch -> EN', async ({ page }) => {
      await open(page);
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    });
  });
  test.describe('Deutsch (de-AT)', () => {
    test.use({ locale: 'de-AT' });
    test('Systemsprache Deutsch -> DE, Schalter zeigt DE', async ({ page }) => {
      await open(page);
      await expect(page.locator('html')).toHaveAttribute('lang', 'de');
      await expect(page.locator('#lang-toggle')).toHaveText('DE');
      await expect(page).toHaveTitle('Testlauf · AEM Testautomatisierung');
    });
  });
});

test.describe('Web-UI i18n: Umschalten', { tag: '@unit' }, () => {
  test.use({ locale: 'de-DE' });

  test('Schalter sitzt links vom Theme-Schalter, wechselt DE/EN, Wahl bleibt nach Reload', async ({ page }) => {
    await open(page);
    const lang = page.locator('#lang-toggle');
    const theme = page.locator('#theme-toggle');
    const [a, b] = [await lang.boundingBox(), await theme.boundingBox()];
    expect(a && b && a.x + a.width <= b.x).toBe(true);
    await expect(lang).toHaveText('DE');
    await expect(lang).toHaveAttribute('aria-label', 'Sprache wechseln (aktuell: Deutsch)');
    await lang.click();
    await expect(lang).toHaveText('EN');
    await expect(lang).toHaveAttribute('aria-label', 'Change language (current: English)');
    await expect(lang).toHaveAttribute('title', 'Change language (current: English)');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page).toHaveTitle('Test run · AEM Test Automation');
    // Die gespeicherte Wahl gewinnt gegen die Systemsprache (de-DE).
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(lang).toHaveText('EN');
    await lang.click();
    await expect(lang).toHaveText('DE');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  });

  test('Der Theme-Schalter beschriftet sich in der aktiven Sprache', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await open(page);
    await expect(page.locator('#theme-toggle')).toHaveAttribute('aria-label', 'Zum dunklen Theme wechseln');
    await page.locator('#lang-toggle').click();
    await expect(page.locator('#theme-toggle')).toHaveAttribute('aria-label', 'Switch to dark theme');
    await page.locator('#theme-toggle').click();
    await expect(page.locator('#theme-toggle')).toHaveAttribute('aria-label', 'Switch to light theme');
  });

  test('Testlauf: Auswahl, offene Kategorie und Umgebung bleiben beim Umschalten', async ({ page }) => {
    await open(page);
    const group = page.locator('.cat-group').first();
    await group.locator('.cat-head').click();
    await group.getByRole('checkbox', { name: /Login ok/ }).check();
    await expect(page.locator('#sb-count')).toHaveText('1 Test gewählt');
    await expect(group.locator('.cat-title')).toHaveText('Smoketest');
    await page.getByRole('button', { name: 'Umgebung wählen' }).click();
    await page.locator('#env-cards .choice', { hasText: 'DEV' }).click();
    await expect(page.locator('#env-cards .choice[aria-pressed="true"] .choice-desc')).toHaveText('Entwicklung');

    await page.locator('#lang-toggle').click();
    await expect(group.locator('.cat-title')).toHaveText('Smoke test');
    await expect(group.locator('.cat-desc')).toHaveText('Environment ready?');
    await expect(group).toHaveAttribute('open', '');
    await expect(group.locator('.test-cb[data-title="Login ok"]')).toBeChecked();
    await expect(page.locator('#sb-count')).toHaveText('1 test ready');
    await expect(page.locator('#sum-1')).toHaveText('1 test in 1 area');
    await expect(page.locator('#sum-2')).toHaveText('DEV');
    await expect(page.locator('#env-cards .choice[aria-pressed="true"] .choice-desc')).toHaveText('development');
    await expect(page.locator('#active-chips .chip').first()).toContainText('Smoke test: 1');
    await expect(page.locator('#run')).toBeEnabled();

    await page.locator('#lang-toggle').click();
    await expect(page.locator('#sb-count')).toHaveText('1 Test bereit');
    await expect(page.locator('#active-chips .chip').first()).toContainText('Smoketest: 1');
  });

  test('Umgebungswechsel meldet den entfernten Test in der aktiven Sprache', async ({ page }) => {
    await open(page);
    await page.locator('#lang-toggle').click();
    const group = page.locator('.cat-group', { hasText: 'Integration test' });
    await group.locator('.cat-head').click();
    await group.getByRole('checkbox', { name: /LDAP-Import/ }).check();
    await page.getByRole('button', { name: 'Choose environment' }).click();
    await page.locator('#env-cards .choice', { hasText: 'TEST' }).click();
    await page.locator('#env-cards .choice', { hasText: 'DEV' }).click();
    await expect(page.locator('#toast')).toHaveText('1 test is not available in DEV and was removed from the selection.');
  });

  test('Englisch: kein deutscher Anzeigetext in allen Reitern, Schritten und Dialogen', async ({ page }) => {
    await open(page);
    await page.locator('#lang-toggle').click();
    await page.getByRole('button', { name: 'All steps' }).click();
    await page.getByRole('tab', { name: 'Tools' }).click();
    await page.locator('#cleanup-scan').click();
    await expect(page.locator('.cleanup-cb')).toHaveCount(1);
    await page.getByRole('tab', { name: 'Results' }).click();
    await page.locator('.run-entry').click();
    await expect(page.locator('#res-title')).toHaveText('1 of 3 tests failed');
    const texts = await allTexts(page);
    const hit = texts.match(GERMAN);
    expect(hit, `Deutsches Wort in der englischen Oberfläche: ${hit?.[0]}`).toBeNull();
  });

  test('Deutsch: Gegenprobe, die Wörterbuchtexte erscheinen', async ({ page }) => {
    await open(page);
    const texts = await allTexts(page);
    expect(texts).toContain('Testlauf vorbereiten');
    expect(texts).toContain('Sprache wechseln');
  });

  test('Ergebnisse: Kernaussage, Filter, Durchlauf, Historie und Blocker wechseln die Sprache', async ({ page }) => {
    await open(page, '#/ergebnisse');
    const entry = page.locator('.run-entry').first();
    await entry.click();
    await expect(page.locator('#res-title')).toHaveText('1 von 3 Tests fehlgeschlagen');
    await expect(page.locator('#res-blocker')).toContainText('Umgebungs-Blocker: Smoketest fehlgeschlagen (Login ok)');
    await expect(page.locator('.trow').first()).toContainText('Durchlauf 2/3');

    await page.locator('#lang-toggle').click();
    await expect(page.locator('#res-title')).toHaveText('1 of 3 tests failed');
    await expect(page.locator('#res-blocker')).toContainText('Environment blocker: Smoke test failed (Login ok)');
    await expect(page.locator('.trow').first()).toContainText('Repetition 2/3');
    await expect(page.locator('.trow').first()).toContainText('retried 1×');
    await expect(page.getByRole('button', { name: /^Failed/ })).toBeVisible();
    await expect(page.locator('.run-entry .run-sub')).toContainText('1 of 3 tests failed');
    await expect(page.locator('.runs-total')).toHaveText('1 run · 2.0 KB total');
    await expect(page.locator('#res-meta')).toContainText('Nov 19, 2026');
    await expect(page.locator('.rgroup-head h3')).toHaveText('Smoke test');

    await page.locator('#lang-toggle').click();
    await expect(page.locator('#res-title')).toHaveText('1 von 3 Tests fehlgeschlagen');
    await expect(page.locator('#res-meta')).toContainText('19.11.2026');
  });

  test('Ergebnisse: Auswahl in der Historie bleibt beim Umschalten', async ({ page }) => {
    await open(page, '#/ergebnisse');
    await page.locator('.run-entry .run-cb').check();
    await expect(page.locator('#runs-delete')).toHaveText('1 löschen (2.0 KB)');
    await page.locator('#lang-toggle').click();
    await expect(page.locator('.run-entry .run-cb')).toBeChecked();
    await expect(page.locator('#runs-delete')).toHaveText('Delete 1 (2.0 KB)');
    await expect(page.locator('#runs-rerun')).toHaveText('Run again (1)');
  });

  test('Werkzeuge: Aufräum-Ergebnis, Hinweis und Bestätigung wechseln die Sprache, Auswahl bleibt', async ({ page }) => {
    await open(page, '#/werkzeuge');
    await page.locator('#cleanup-scan').click();
    await expect(page.locator('.cleanup-env')).toHaveText('DEV: 1 Testseite');
    await expect(page.locator('#cleanup-result')).toContainText('Hinweis: /content/dam/fhgtest nicht lesbar (HTTP 404).');
    await page.locator('.cleanup-cb').uncheck();
    await page.locator('#lang-toggle').click();
    await expect(page.locator('.cleanup-env')).toHaveText('DEV: 1 test page');
    await expect(page.locator('#cleanup-result')).toContainText('Note: /content/dam/fhgtest is not readable (HTTP 404).');
    await expect(page.locator('#cleanup-result')).toContainText('Searched under /content/fhgtest.');
    await expect(page.locator('.cleanup-cb')).not.toBeChecked();
    await expect(page.locator('#cleanup-scan')).toHaveText('Find test pages');
    await expect(page.locator('#open-uimode')).toBeDisabled();
    await expect(page.locator('#open-uimode')).toHaveAttribute('title', 'Choose an environment under "Test run" first.');
  });

  test('Beenden-Dialog erscheint in der aktiven Sprache', async ({ page }) => {
    await open(page);
    await page.locator('#lang-toggle').click();
    await page.locator('#shutdown').click();
    await expect(page.locator('#confirm-title')).toHaveText('Quit application?');
    await expect(page.locator('#confirm-ok')).toHaveText('Quit');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.locator('#confirm-dialog')).toBeHidden();
  });
});
