import { test, expect, type Page } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';

/**
 * Browser-Tests der neuen Web-UI gegen einen kleinen lokalen Server: er liefert
 * webui/public aus und beantwortet /api/* mit festen Daten. Kein AEM, kein Login,
 * kein echter Lauf. Gelöscht oder gestartet wird nichts auf einer Umgebung.
 */
const PUBLIC = path.resolve(process.cwd(), 'webui/public');
const MIME: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const ENVS = [
  { id: 'dev', label: 'DEV (Entwicklung)', env: 'dev', baseUrl: 'https://dev.example' },
  { id: 'test', label: 'TEST (primär)', env: 'test', baseUrl: 'https://test.example' },
];

const mkTest = (title: string, extra: Record<string, unknown> = {}) =>
  ({ title, file: 'basics/a.spec.ts', line: 1, projects: ['chromium'], tags: ['level1'], ...extra });

const CATALOG = {
  groups: [
    {
      label: 'Smoketest', description: 'Umgebung bereit?',
      files: [{ label: 'Smoke', file: 'smoke.spec.ts', tests: [mkTest('Login geht', { file: 'smoke.spec.ts', line: 3, projects: ['smoke'] })] }],
    },
    {
      label: 'Integrationstest', description: 'Zusammenspiel',
      files: [{
        label: 'LDAP', file: 'integration/ldap.spec.ts',
        tests: [mkTest('LDAP-Import', { file: 'integration/ldap.spec.ts', line: 5, tags: ['integration', 'env:test'] })],
      }],
    },
    {
      label: 'Unit', description: 'ohne Browser',
      files: [{ label: 'Pfad-Guard', file: 'unit/guard.spec.ts', tests: [mkTest('Guard blockiert', { file: 'unit/guard.spec.ts', line: 2, projects: ['unit'], tags: ['unit'] })] }],
    },
  ],
};

const RUN = {
  id: '11111111-1111-4111-8111-111111111111', status: 'failed', startedAt: new Date().toISOString(),
  environment: 'DEV (Entwicklung)', sizeBytes: 2048, summary: { passed: 2, failed: 1, skipped: 0, flaky: 0, total: 3 },
  settings: { headed: false, slowMo: 0, repeatEach: 1, workers: 1, smokeGate: false, updateSnapshots: false },
  originalRequest: { tests: [{ file: 'smoke.spec.ts', line: 3, title: 'Login geht' }] },
};
const REPORT = {
  summary: { passed: 2, failed: 1, skipped: 0, flaky: 0, total: 3, durationMs: 4200 },
  rows: [
    { level: 'smoke', title: 'login geht', file: 'smoke.spec.ts', status: 'passed', durationMs: 900, attachments: [] },
    { level: 'smoke', title: 'seite laden', file: 'smoke.spec.ts', status: 'failed', durationMs: 3000, retryCount: 1,
      errorSummary: 'Timeout beim Laden', errorDetail: 'Zeile 1\nZeile 2', attachments: [{ name: 'screenshot', url: '/files/x.png' }] },
    { level: 'smoke', title: 'ende', file: 'smoke.spec.ts', status: 'passed', durationMs: 300, attachments: [] },
  ],
};

let server: Server;
let base = '';
let posts: string[] = [];
let serverStartId = 'srv-1';

test.beforeAll(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://x');
    const json = (data: unknown) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
    if (req.method === 'POST') posts.push(url.pathname);
    switch (url.pathname) {
      case '/api/tests': return json(CATALOG);
      case '/api/environments': return json({ environments: ENVS, serverStartId });
      case '/api/runs': return json({ runs: [RUN], totalSizeBytes: 2048 });
      case '/api/status': return json({});
      case '/api/preview': return json({ preview: 'npx playwright test' });
      case '/api/baselines': return json({ environments: [], entries: [] });
      case '/api/cleanup/list':
        return json({ playgrounds: ['/content/fhgtest'], environments: [{ id: 'dev', label: 'DEV', pages: ['level1-x-20261119-101010-abcd'], warnings: [] }] });
      case `/api/run/${RUN.id}/report`: return json(REPORT);
      case '/api/run': return json({ id: RUN.id }); // POST: Lauf starten
      case `/api/run/${RUN.id}/stream`:
        // Kurzer Lauf: eine Logzeile, dann „fertig".
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
        res.write('event: log\ndata: "Lauf…\\n"\n\n');
        res.end('event: done\ndata: {"status":"failed"}\n\n');
        return;
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
test.beforeEach(() => { posts = []; serverStartId = 'srv-1'; });

async function open(page: Page, hash = '') {
  await page.goto(`${base}/${hash}`);
  // Katalog ist geladen (auch wenn ein anderer Reiter sichtbar ist).
  await expect(page.locator('.cat-group')).toHaveCount(CATALOG.groups.length);
}

/** Test per Haken wählen (Kategorie aufklappen, dann Test anhaken). */
async function selectTest(page: Page, group: string, name: RegExp) {
  const g = page.locator('.cat-group', { hasText: group });
  if ((await g.getAttribute('open')) === null) await g.locator('.cat-head').click();
  await g.getByRole('checkbox', { name }).check();
}
const chooseEnv = (page: Page, name: string) => page.locator('#env-cards .choice', { hasText: name }).click();
const step = (page: Page, n: number) => page.locator(`#steps .step[data-step="${n}"]`);

test.describe('Web-UI (neu): Testlauf', { tag: '@unit' }, () => {
  test('Start braucht Test und Umgebung, die Start-Leiste nennt, was fehlt', async ({ page }) => {
    await open(page);
    await expect(page.locator('#run')).toBeDisabled();
    await expect(page.locator('#sb-count')).toHaveText('Noch nichts ausgewählt');
    await selectTest(page, 'Smoketest', /Login geht/);
    await expect(page.locator('#sb-count')).toHaveText('1 Test gewählt');
    await expect(page.locator('#sb-detail')).toHaveText('Wähle in Schritt 2 eine Umgebung.');
    await expect(page.locator('#run')).toBeDisabled();
    await page.getByRole('button', { name: 'Umgebung wählen' }).click();
    await chooseEnv(page, 'DEV');
    await expect(page.locator('#run')).toBeEnabled();
    await expect(page.locator('#sb-count')).toHaveText('1 Test bereit');
    await expect(page.locator('#sum-1')).toHaveText('1 Test in 1 Bereich');
  });

  test('Umgebung: nach dem Start keine vorgewählt, Reload behält die Wahl, Neustart des Dienstes nicht', async ({ page }) => {
    await open(page);
    await expect(page.locator('#env-cards .choice[aria-pressed="true"]')).toHaveCount(0);
    await expect(page.locator('#sum-2')).toHaveText('Nicht gewählt');
    await selectTest(page, 'Smoketest', /Login geht/);
    await page.getByRole('button', { name: 'Umgebung wählen' }).click();
    await chooseEnv(page, 'TEST');
    await expect(page.locator('#sum-2')).toHaveText('TEST');
    // Reload mit demselben Dienst: „zuletzt verwendet" gilt.
    await page.reload();
    await expect(page.locator('.cat-group')).toHaveCount(CATALOG.groups.length);
    await expect(page.locator('#sum-2')).toHaveText('TEST');
    // Neustart des Dienstes (neue Start-Kennung): wieder keine Umgebung.
    serverStartId = 'srv-2';
    await page.reload();
    await expect(page.locator('.cat-group')).toHaveCount(CATALOG.groups.length);
    await expect(page.locator('#sum-2')).toHaveText('Nicht gewählt');
    // Nach der ersten Wahl gilt wieder „zuletzt verwendet".
    await selectTest(page, 'Smoketest', /Login geht/);
    await page.getByRole('button', { name: 'Umgebung wählen' }).click();
    await chooseEnv(page, 'DEV');
    await page.reload();
    await expect(page.locator('.cat-group')).toHaveCount(CATALOG.groups.length);
    await expect(page.locator('#sum-2')).toHaveText('DEV');
  });

  test('Assistent: ohne Test geht es nicht weiter, ohne Umgebung nicht zu Schritt 3', async ({ page }) => {
    await open(page);
    const next1 = page.getByRole('button', { name: 'Weiter: Umgebung' });
    await expect(next1).toBeDisabled();
    await expect(page.locator('#hint-next-1')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Umgebung wählen' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Ausführung festlegen' })).toBeDisabled();

    await selectTest(page, 'Smoketest', /Login geht/);
    await expect(next1).toBeEnabled();
    await expect(page.locator('#hint-next-1')).toBeHidden();
    await next1.click();
    await expect(step(page, 2)).toHaveAttribute('data-open', 'true');
    // Schritt 3 braucht zusätzlich eine Umgebung.
    await expect(page.getByRole('button', { name: 'Weiter: Ausführung' })).toBeDisabled();
    await expect(page.locator('#hint-next-2')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ausführung festlegen' })).toBeDisabled();
    await chooseEnv(page, 'DEV');
    await page.getByRole('button', { name: 'Weiter: Ausführung' }).click();
    await expect(step(page, 3)).toHaveAttribute('data-open', 'true');

    // Auswahl leeren: der Assistent springt auf Schritt 1 zurück, die Folgeschritte sind gesperrt.
    await page.getByRole('button', { name: 'Tests auswählen' }).click();
    await page.locator('#reset-selection').click();
    await expect(step(page, 1)).toHaveAttribute('data-open', 'true');
    await expect(page.getByRole('button', { name: 'Umgebung wählen' })).toBeDisabled();
  });

  test('Assistent: nach einem beendeten Lauf steht der Testlauf wieder auf Schritt 1', async ({ page }) => {
    await open(page);
    await selectTest(page, 'Smoketest', /Login geht/);
    await page.getByRole('button', { name: 'Umgebung wählen' }).click();
    await chooseEnv(page, 'DEV');
    await page.getByRole('button', { name: 'Ausführung festlegen' }).click();
    await expect(step(page, 3)).toHaveAttribute('data-open', 'true');
    await page.locator('#run').click();
    await expect(page).toHaveURL(/#\/ergebnisse$/);
    await expect(page.locator('#res-title')).toHaveText('1 von 3 Tests fehlgeschlagen');
    await page.getByRole('tab', { name: 'Testlauf' }).click();
    await expect(step(page, 1)).toHaveAttribute('data-open', 'true');
    await expect(step(page, 3)).toHaveAttribute('data-open', 'false');
    // Auswahl und Umgebung bleiben für einen Wiederholungslauf erhalten.
    await expect(page.locator('#sb-count')).toHaveText('1 Test bereit');
    await expect(page.locator('#sum-2')).toHaveText('DEV');
  });

  test('Alle Schritte: keine Sperre, die Start-Leiste bleibt gesperrt', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Alle Schritte' }).click();
    await expect(page.locator('#steps .step[data-open="true"]')).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Umgebung wählen' })).toBeEnabled();
    await expect(page.locator('#run')).toBeDisabled();
  });

  test('Schritte: Häkchen erst, wenn der Schritt gesehen wurde (nicht schon wegen der Vorbelegung)', async ({ page }) => {
    await open(page);
    await selectTest(page, 'Smoketest', /Login geht/);
    await expect(step(page, 2)).toHaveAttribute('data-done', 'false');
    await expect(step(page, 3)).toHaveAttribute('data-done', 'false');
    await page.getByRole('button', { name: 'Umgebung wählen' }).click();
    await chooseEnv(page, 'DEV');
    await page.getByRole('button', { name: 'Ausführung festlegen' }).click();
    await expect(step(page, 2)).toHaveAttribute('data-done', 'true');
    await expect(step(page, 2)).toHaveAttribute('data-open', 'false');
    await page.getByRole('button', { name: 'Tests auswählen' }).click();
    await expect(step(page, 3)).toHaveAttribute('data-done', 'true'); // gesehen, jetzt geschlossen
    await expect(step(page, 3)).toHaveAttribute('data-open', 'false');
  });

  test('Schritte: genau ein Schritt offen, „Alle Schritte" öffnet alle', async ({ page }) => {
    await open(page);
    const open_ = page.locator('#steps .step[data-open="true"]');
    await expect(open_).toHaveCount(1);
    await selectTest(page, 'Smoketest', /Login geht/);
    await page.getByRole('button', { name: 'Umgebung wählen' }).click();
    await expect(open_).toHaveCount(1);
    await expect(step(page, 2)).toHaveAttribute('data-open', 'true');
    await page.getByRole('button', { name: 'Alle Schritte' }).click();
    await expect(open_).toHaveCount(3);
  });

  test('Schrittmodus: Standard ist „Assistent", die letzte Wahl bleibt nach Reload', async ({ page }) => {
    await open(page);
    const steps = page.locator('#steps .step[data-open="true"]');
    await expect(page.getByRole('button', { name: 'Assistent' })).toHaveAttribute('aria-pressed', 'true');
    await expect(steps).toHaveCount(1);
    await page.getByRole('button', { name: 'Alle Schritte' }).click();
    await expect(steps).toHaveCount(3);
    await page.reload();
    await expect(page.locator('.cat-group')).toHaveCount(CATALOG.groups.length);
    await expect(page.getByRole('button', { name: 'Alle Schritte' })).toHaveAttribute('aria-pressed', 'true');
    await expect(steps).toHaveCount(3);
    await page.getByRole('button', { name: 'Assistent' }).click();
    await page.reload();
    await expect(page.locator('.cat-group')).toHaveCount(CATALOG.groups.length);
    await expect(steps).toHaveCount(1);
  });

  test('Zurücksetzen: leert Auswahl und Suchfeld und klappt die Kategorien zu', async ({ page }) => {
    await open(page);
    const reset = page.locator('#reset-selection');
    await expect(reset).toBeHidden();
    await selectTest(page, 'Smoketest', /Login geht/);
    await page.locator('#catalog-search').fill('login');
    await expect(reset).toBeVisible();
    await reset.click();
    await expect(page.locator('#catalog-search')).toHaveValue('');
    await expect(page.locator('#sb-count')).toHaveText('Noch nichts ausgewählt');
    await expect(page.locator('.cat-group[open]')).toHaveCount(0);
    await expect(page.locator('.cat-group')).toHaveCount(CATALOG.groups.length);
    await expect(reset).toBeHidden();
  });

  test('Umgebung: Test mit env-Tag wird beim Wechsel in eine andere Umgebung entfernt und gemeldet', async ({ page }) => {
    await open(page);
    // Ohne Umgebung ist der Test wählbar; unter TEST bleibt er, unter DEV fällt er heraus.
    await selectTest(page, 'Integrationstest', /LDAP-Import/);
    await page.getByRole('button', { name: 'Umgebung wählen' }).click();
    await chooseEnv(page, 'TEST');
    await expect(page.locator('#sb-count')).toHaveText('1 Test bereit');
    await chooseEnv(page, 'DEV');
    await expect(page.locator('#toast')).toContainText('nicht verfügbar');
    await expect(page.locator('#sb-count')).toHaveText('Noch nichts ausgewählt');
    // Die Auswahl ist leer: der Assistent springt zu Schritt 1, der Test ist dort gesperrt.
    await expect(step(page, 1)).toHaveAttribute('data-open', 'true');
    await expect(page.locator('.cat-group', { hasText: 'Integrationstest' }).getByRole('checkbox', { name: /LDAP-Import/ })).toBeDisabled();
  });

  test('Nur Unit-Tests: „Sichtbar" ist gesperrt', async ({ page }) => {
    await open(page);
    await selectTest(page, 'Unit', /Guard blockiert/);
    await page.getByRole('button', { name: 'Umgebung wählen' }).click();
    await chooseEnv(page, 'DEV');
    await page.getByRole('button', { name: 'Ausführung festlegen' }).click();
    await expect(page.locator('[data-mode="headed"]')).toBeDisabled();
    await expect(page.locator('[data-mode="headless"]')).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('Web-UI (neu): Shell, Theme, Ergebnisse, Werkzeuge', { tag: '@unit' }, () => {
  test('Reiter: Hash-Routing, Reload behält den Reiter, Pfeiltasten wechseln', async ({ page }) => {
    await open(page);
    await page.getByRole('tab', { name: 'Werkzeuge' }).click();
    await expect(page).toHaveURL(/#\/werkzeuge$/);
    await expect(page.locator('#tab-werkzeuge')).toBeVisible();
    await page.reload();
    await expect(page.locator('#tab-werkzeuge')).toBeVisible();
    await page.getByRole('tab', { name: 'Werkzeuge' }).focus();
    await page.keyboard.press('Home');
    await expect(page.locator('#tab-testlauf')).toBeVisible();
  });

  test('Theme: Umschalter wechselt und wird nach Reload wiederhergestellt', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await open(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.locator('#theme-toggle').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('Theme: ohne eigene Wahl folgt die Oberfläche dem System', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await open(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('Ergebnisse: früherer Lauf zeigt Kernaussage, Fehlschlag zuerst, Filter wirkt', async ({ page }) => {
    await open(page, '#/ergebnisse');
    await expect(page.locator('#res-empty')).toBeVisible();
    // Die Historie nennt den Bereich und die Kernaussage statt Dateinamen.
    const entry = page.locator('.run-entry').first();
    await expect(entry.locator('.run-sel')).toContainText('Smoketest');
    await expect(entry.locator('.run-sub')).toContainText('1 von 3 Tests fehlgeschlagen');
    await entry.click();
    await expect(page.locator('#res-title')).toHaveText('1 von 3 Tests fehlgeschlagen');
    const rows = page.locator('.trow');
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText('Seite laden');
    await expect(rows.first()).toHaveClass(/st-failed/);
    await expect(page.locator('.err-summary')).toHaveText('Timeout beim Laden');
    await page.getByRole('button', { name: /^Fehlgeschlagen/ }).click();
    await expect(rows).toHaveCount(1);
    await page.getByRole('button', { name: /^Fehlgeschlagen/ }).click();
    await expect(rows).toHaveCount(3);
  });

  test('Ergebnisse: Löschen verlangt Bestätigung, Abbrechen sendet nichts', async ({ page }) => {
    await open(page, '#/ergebnisse');
    await page.locator('.run-entry .run-cb').first().check();
    await page.locator('#runs-delete').click();
    await expect(page.locator('#confirm-dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Abbrechen' }).click();
    await expect(page.locator('#confirm-dialog')).toBeHidden();
    expect(posts).not.toContain('/api/runs/delete');
  });

  test('Werkzeuge: UI-Mode ist ohne gewählte Umgebung gesperrt, danach frei', async ({ page }) => {
    await open(page, '#/werkzeuge');
    await expect(page.locator('#open-uimode')).toBeDisabled();
    await page.goto(`${base}/#/testlauf`);
    await selectTest(page, 'Smoketest', /Login geht/);
    await page.getByRole('button', { name: 'Umgebung wählen' }).click();
    await chooseEnv(page, 'DEV');
    await page.getByRole('tab', { name: 'Werkzeuge' }).click();
    await expect(page.locator('#open-uimode')).toBeEnabled();
  });

  test('Werkzeuge: Aufräum-Suche listet Testseiten, Löschen fragt erst nach', async ({ page }) => {
    await open(page, '#/werkzeuge');
    await page.locator('#cleanup-scan').click();
    await expect(page.locator('.cleanup-cb')).toHaveCount(1);
    await page.locator('#cleanup-delete').click();
    await expect(page.locator('#confirm-dialog')).toBeVisible();
    await page.getByRole('button', { name: 'Abbrechen' }).click();
    expect(posts).not.toContain('/api/cleanup/delete');
  });
});
