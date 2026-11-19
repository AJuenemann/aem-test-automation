import { test, expect } from '@playwright/test';
import { buildReportView, detectBlocker, detectBlockerInfo, blockerText } from '../../webui/report.js';

/**
 * Beispiel-Report in der Form des Playwright-JSON-Reporters
 * (suites -> specs -> tests -> results -> attachments).
 */
const sampleReport = {
  suites: [
    {
      specs: [],
      suites: [
        {
          specs: [
            {
              title: 'Seite anlegen',
              file: 'basics/page-crud.spec.ts',
              tests: [
                {
                  projectName: 'chromium',
                  results: [
                    {
                      status: 'passed',
                      duration: 4200,
                      attachments: [
                        {
                          name: 'trace',
                          contentType: 'application/zip',
                          path: '/abs/test-results/x/trace.zip',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              title: 'Komponente einfügen',
              file: 'basics/component-edit.spec.ts',
              tests: [
                {
                  projectName: 'chromium',
                  results: [
                    {
                      status: 'failed',
                      duration: 1500,
                      error: { message: '\u001b[31mTimeoutError: locator not found\u001b[0m\nzeile 2' },
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

test.describe('Web-UI: buildReportView', { tag: '@unit' }, () => {
  test('Erzeugt Zeilen mit Status, Dauer, Fehler und Attachment', () => {
    const view = buildReportView(sampleReport);
    expect(view.rows).toHaveLength(2);

    const pass = view.rows[0];
    expect(pass.status).toBe('passed');
    expect(pass.durationMs).toBe(4200);
    expect(pass.attachments[0]).toEqual({
      name: 'trace',
      contentType: 'application/zip',
      path: '/abs/test-results/x/trace.zip',
    });

    const fail = view.rows[1];
    expect(fail.status).toBe('failed');
    // ANSI-Codes entfernt, erste aussagekräftige Zeile als Summary.
    expect(fail.errorSummary).toBe('TimeoutError: locator not found');
    expect(fail.errorDetail).not.toContain('\u001b');
  });

  test('Summary zählt korrekt', () => {
    const view = buildReportView(sampleReport);
    expect(view.summary).toMatchObject({ total: 2, passed: 1, failed: 1, skipped: 0 });
    expect(view.summary.durationMs).toBe(5700);
  });

  test('Wiederholungen (--repeat-each) zählen einzeln, Retry-Erfolg gilt als instabil', () => {
    // Form wie im echten Lauf vom 19.11.2026 (3×, erster Durchlauf erst im Retry grün).
    const view = buildReportView({
      suites: [
        {
          specs: [
            {
              title: 'Seite kopieren',
              file: 'basics/page-actions.spec.ts',
              tests: [
                { projectName: 'chromium', status: 'flaky', results: [{ status: 'failed', duration: 1 }, { status: 'passed', duration: 1 }] },
                { projectName: 'chromium', status: 'expected', results: [{ status: 'passed', duration: 1 }] },
                { projectName: 'chromium', status: 'expected', results: [{ status: 'passed', duration: 1 }] },
              ],
            },
          ],
        },
      ],
    });
    expect(view.summary).toMatchObject({ total: 3, passed: 3, failed: 0, flaky: 1 });
    expect(view.rows.map((r) => [r.repeatLabel, r.flaky, r.retryCount])).toEqual([
      ['Durchlauf 1/3', true, 1],
      ['Durchlauf 2/3', false, 0],
      ['Durchlauf 3/3', false, 0],
    ]);
  });

  test('Login (setup) erscheint nur, wenn er nicht bestanden hat', () => {
    const withLogin = (status: string) => ({
      suites: [
        ...sampleReport.suites,
        {
          specs: [
            {
              title: 'Authentifizieren',
              file: 'auth.setup.ts',
              tests: [{ projectName: 'setup', results: [{ status, duration: 2500 }] }],
            },
          ],
        },
      ],
    });
    const ok = buildReportView(withLogin('passed'));
    expect(ok.rows.map((r) => r.project)).not.toContain('setup');
    expect(ok.summary.total).toBe(2);
    const failed = buildReportView(withLogin('failed'));
    expect(failed.rows.map((r) => r.project)).toContain('setup');
    expect(failed.summary.total).toBe(3);
  });

  // Hilfsfunktion: Report mit einem einzelnen fehlgeschlagenen Test.
  const failWith = (file: string, title: string, message: string, projectName = 'setup') => ({
    suites: [
      {
        specs: [
          {
            title,
            file,
            tests: [
              { projectName, results: [{ status: 'failed', duration: 41700, error: { message } }] },
            ],
          },
        ],
      },
    ],
  });

  test('Blocker-Erkennung (detectBlocker): Netzfehler (ERR_ABORTED) -> VPN-Vermutung mit Host', () => {
    const msg =
      'page.goto: net::ERR_ABORTED; maybe frame was detached?\n' +
      'navigating to "https://aem-author-test.ws.fraunhofer.de/libs/granite/core/content/login.html?resource=x"';
    const blocker = detectBlocker(buildReportView(failWith('auth.setup.ts', 'authenticate', msg)));
    expect(blocker).toMatch(/VPN/);
    expect(blocker).toContain('aem-author-test.ws.fraunhofer.de');
  });

  test('Blocker-Erkennung (detectBlocker): greift schon beim Setup-Fehler, nicht erst bei "alle fehlgeschlagen"', () => {
    // Nur der setup-Schritt scheitert (Netzfehler) -> Blocker trotzdem melden.
    const blocker = detectBlocker(buildReportView(failWith('auth.setup.ts', 'authenticate', 'net::ERR_CONNECTION_TIMED_OUT')));
    expect(blocker).toMatch(/Netz|VPN/);
  });

  test('Blocker-Erkennung (detectBlocker): fehlende Env -> Konfigurations-Hinweis', () => {
    const blocker = detectBlocker(buildReportView(failWith('a.spec.ts', 't1', 'MissingEnvError: AEM_PASSWORD')));
    expect(blocker).toMatch(/Konfigurations-Blocker/);
  });

  test('Blocker-Erkennung (detectBlocker): fehlgeschlagener Smoketest -> Gate-Hinweis mit Testname', () => {
    const report = failWith('smoke.spec.ts', 'Alle OSGi-Bundles sind aktiv', 'Nicht aktive Bundles.', 'smoke');
    const blocker = detectBlocker(buildReportView(report));
    expect(blocker).toMatch(/Smoketest fehlgeschlagen \(Alle OSGi-Bundles sind aktiv\)/);
    // Gleicher Fehler außerhalb des Smoke-Projekts ist ein normaler Funktionsfehler.
    expect(detectBlocker(buildReportView(failWith('x.spec.ts', 'X', 'Nicht aktive Bundles.', 'chromium')))).toBeUndefined();
  });

  test('Blocker-Erkennung (detectBlocker): Login-Fehler ohne Netzfehler -> Login-Hinweis', () => {
    const blocker = detectBlocker(buildReportView(failWith('auth.setup.ts', 'authenticate', 'Login abgelehnt (Fehlermeldung auf der Login-Seite)')));
    expect(blocker).toMatch(/Login-Blocker/);
  });

  test('Blocker-Erkennung (detectBlocker) meldet nichts bei gewöhnlichem Funktionsfehler', () => {
    // sampleReport: ein "TimeoutError: locator not found" in component-edit -> kein Umgebungs-Blocker.
    expect(detectBlocker(buildReportView(sampleReport))).toBeUndefined();
  });
  test('Blocker-Code (detectBlockerInfo): Netzfehler nennt Code network und Host', () => {
    const msg = 'page.goto: net::ERR_ABORTED\nnavigating to "https://aem-author-test.ws.fraunhofer.de/x"';
    const info = detectBlockerInfo(buildReportView(failWith('auth.setup.ts', 'authenticate', msg)));
    expect(info).toEqual({ code: 'network', params: { host: 'aem-author-test.ws.fraunhofer.de' } });
    // Ohne Host in der Meldung bleibt params leer.
    expect(detectBlockerInfo(buildReportView(failWith('a.spec.ts', 't', 'net::ERR_CONNECTION_TIMED_OUT')))).toEqual({ code: 'network', params: {} });
  });
  test('Blocker-Code (detectBlockerInfo): env, login und smoke', () => {
    expect(detectBlockerInfo(buildReportView(failWith('a.spec.ts', 't1', 'MissingEnvError: AEM_PASSWORD')))?.code).toBe('env');
    expect(detectBlockerInfo(buildReportView(failWith('auth.setup.ts', 'authenticate', 'Login abgelehnt')))?.code).toBe('login');
    const smoke = detectBlockerInfo(buildReportView(failWith('smoke.spec.ts', 'Bundles aktiv', 'Nicht aktive Bundles.', 'smoke')));
    expect(smoke).toEqual({ code: 'smoke', params: { tests: 'Bundles aktiv' } });
    expect(detectBlockerInfo(buildReportView(sampleReport))).toBeUndefined();
  });
  test('Blocker-Text (blockerText): der deutsche Text entsteht aus dem Code und bleibt unverändert', () => {
    const views = [
      failWith('auth.setup.ts', 'authenticate', 'net::ERR_ABORTED https://h.example/x'),
      failWith('a.spec.ts', 't1', 'MissingEnvError: AEM_PASSWORD'),
      failWith('auth.setup.ts', 'authenticate', 'Login abgelehnt'),
      failWith('smoke.spec.ts', 'S1', 'kaputt', 'smoke'),
    ].map((r) => buildReportView(r));
    for (const view of views) {
      const info = detectBlockerInfo(view);
      expect(info).toBeDefined();
      expect(blockerText(info!)).toBe(detectBlocker(view));
    }
    expect(blockerText({ code: 'network', params: { host: 'h.example' } })).toContain('Die AEM-Instanz (h.example) war nicht erreichbar');
  });
  test('Durchlauf (repeatIndex/repeatTotal): Zahlen stehen neben dem deutschen repeatLabel', () => {
    // --repeat-each=2: derselbe Spec hat je Projekt zwei test-Einträge.
    const run = { projectName: 'chromium', results: [{ status: 'passed', duration: 1 }] };
    const report = { suites: [{ specs: [{ title: 'T', file: 'a.spec.ts', tests: [run, run] }] }] };
    const rows = buildReportView(report).rows;
    expect(rows.map((r) => r.repeatIndex)).toEqual([1, 2]);
    expect(rows.map((r) => r.repeatTotal)).toEqual([2, 2]);
    expect(rows[1].repeatLabel).toBe('Durchlauf 2/2');
  });
});
