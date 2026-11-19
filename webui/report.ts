/**
 * Transformiert den Playwright-JSON-Report in eine flache Tabellenform für
 * die UI. Reines Modul (kein I/O) -> unit-testbar auf einer echten report.json.
 *
 * Struktur des JSON-Reporters: suites -> (suites) -> specs -> tests -> results,
 * results[].attachments[] enthält Trace/Screenshot/Video/Diff.
 */

export type TestStatus = 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';

/** Ein Attachment-Link für die UI (relativ zum Report-Root). */
export interface ReportAttachment {
  name: string;
  contentType: string;
  /** Absoluter Pfad aus dem Report (wird serverseitig in URL übersetzt). */
  path?: string;
}

/** Eine Zeile der Ergebnis-Tabelle (ein Test in einem Projekt). */
export interface ReportRow {
  title: string;
  file: string;
  project: string;
  /** Titel des describe-Blocks (Testsuite), z.B. „AEM-Basis: Seiten-CRUD". */
  suite: string;
  /** Level-Tag des Tests, z.B. „level1", „smoke", „integration". */
  level: string;
  status: TestStatus;
  /** Dauer in Millisekunden. */
  durationMs: number;
  /** Anzahl der Wiederholungen (0 = kein Retry). */
  retryCount: number;
  /** Instabil: erst im Retry bestanden (Playwright-Status `flaky`). */
  flaky: boolean;
  /** Durchlauf bei `--repeat-each`, z.B. „Durchlauf 2/3"; sonst undefined. */
  repeatLabel?: string;
  /** Nummer und Anzahl der Durchläufe (zweisprachige Anzeige in der Web-UI). */
  repeatIndex?: number;
  repeatTotal?: number;
  /** Grund für einen skip (aus test.skip('…') oder test.fixme('…')). */
  skipReason?: string;
  /** Gekürzte Fehlermeldung (erste, aussagekräftige Zeile) oder undefined. */
  errorSummary?: string;
  /** Vollständige Fehlermeldung zum Ausklappen. */
  errorDetail?: string;
  attachments: ReportAttachment[];
}

export interface ReportSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  /** Davon instabil bestanden (in `passed` enthalten). */
  flaky: number;
  /** Gesamtdauer in Millisekunden (Summe der Tests). */
  durationMs: number;
}

export interface ReportView {
  rows: ReportRow[];
  summary: ReportSummary;
}

// Minimal nötige Form des JSON-Reporters.
interface RawAttachment {
  name?: string;
  contentType?: string;
  path?: string;
}
interface RawAnnotation {
  type?: string;
  description?: string;
}
interface RawResult {
  status?: string;
  duration?: number;
  error?: { message?: string };
  errors?: { message?: string }[];
  attachments?: RawAttachment[];
}
interface RawTest {
  projectName?: string;
  /** Playwright-Gesamtstatus: expected | unexpected | flaky | skipped. */
  status?: string;
  annotations?: RawAnnotation[];
  results?: RawResult[];
}
interface RawSpec {
  title?: string;
  file?: string;
  tags?: string[];
  tests?: RawTest[];
}
interface RawSuite {
  title?: string;
  specs?: RawSpec[];
  suites?: RawSuite[];
}
interface RawReport {
  suites?: RawSuite[];
}

/** Tags aus Level-Ebene — bestimmt die Spalte „Level" in der Tabelle. */
const LEVEL_TAGS = new Set([
  'smoke', 'level1', 'level2-components', 'integration', 'regression', 'unit',
]);

function extractLevel(tags: string[]): string | undefined {
  return tags.map((t) => t.replace(/^@/, '')).find((t) => LEVEL_TAGS.has(t));
}

export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

function firstMeaningfulLine(message: string): string {
  const clean = stripAnsi(message).trim();
  const line = clean.split('\n').find((l) => l.trim() !== '') ?? '';
  return line.trim();
}

/** Spec mit angehängtem Suite-Titel (aus dem übergeordneten describe-Block). */
interface EnrichedSpec extends RawSpec {
  _suite: string;
}

/**
 * Sammelt alle Specs rekursiv. Describe-Block-Titel (kein .ts im Namen) werden
 * als Testsuite-Titel an die Specs weitergegeben.
 */
function collectSpecs(suite: RawSuite, out: EnrichedSpec[], parentSuite = ''): void {
  // Datei-Ebene: Titel endet mit .ts oder ist leer → kein describe-Titel.
  const isFileSuite = !suite.title || suite.title.endsWith('.ts');
  const suiteName = isFileSuite ? parentSuite : ((suite.title ?? '').trim() || parentSuite);
  for (const spec of suite.specs ?? []) {
    out.push({ ...spec, _suite: suiteName });
  }
  for (const child of suite.suites ?? []) {
    collectSpecs(child, out, suiteName);
  }
}

function normalizeStatus(raw: string | undefined): TestStatus {
  switch (raw) {
    case 'passed':
    case 'failed':
    case 'timedOut':
    case 'skipped':
    case 'interrupted':
      return raw;
    default:
      return 'skipped';
  }
}

/**
 * Wandelt den rohen JSON-Report in die UI-Tabelle um. Pro Test wird das
 * letzte Ergebnis verwendet (nach evtl. Retries der aussagekräftige Stand).
 */
export function buildReportView(raw: RawReport): ReportView {
  const rows: ReportRow[] = [];

  for (const fileSuite of raw.suites ?? []) {
    const specs: EnrichedSpec[] = [];
    collectSpecs(fileSuite, specs);

    for (const spec of specs) {
      // Je (Spec, Projekt) ein test-Eintrag pro Durchlauf (`--repeat-each`).
      // Die Retry-Kette steckt in dessen results (geprüft an Läufen vom
      // 19.11.2026). Früher wurden die Durchläufe hier zu einem zusammengefasst,
      // ein 3×-Lauf erschien dann als „1/1" und Instabilität ging verloren.
      const perProject = new Map<string, number>();
      for (const test of spec.tests ?? []) {
        const key = test.projectName ?? '';
        perProject.set(key, (perProject.get(key) ?? 0) + 1);
      }
      const seen = new Map<string, number>();

      for (const test of spec.tests ?? []) {
        const key = test.projectName ?? '';
        const index = (seen.get(key) ?? 0) + 1;
        seen.set(key, index);
        const repeats = perProject.get(key) ?? 1;
        const results = test.results ?? [];
        const result = results[results.length - 1] ?? {};
        const status = normalizeStatus(result.status);
        // Login (setup) ist Vorbedingung, kein Testfall: nur zeigen, wenn er
        // nicht bestanden hat (sonst fehlt die Ursache für den Blocker-Hinweis).
        if (test.projectName === 'setup' && status === 'passed') continue;

        const errorMessage =
          result.error?.message ??
          result.errors?.[0]?.message ??
          undefined;

        const attachments: ReportAttachment[] = (result.attachments ?? [])
          .filter((a) => typeof a.path === 'string' && a.path !== '')
          .map((a) => ({
            name: a.name ?? 'attachment',
            contentType: a.contentType ?? 'application/octet-stream',
            path: a.path,
          }));

        // Skip-Grund aus Test-Annotations (test.skip('…') / test.fixme('…')).
        const skipReason = status === 'skipped'
          ? (test.annotations ?? [])
              .filter((a) => (a.type === 'skip' || a.type === 'fixme') && a.description)
              .map((a) => a.description ?? '')
              .join(' ') || undefined
          : undefined;

        rows.push({
          title: spec.title ?? '(ohne Titel)',
          file: spec.file ?? '',
          project: test.projectName ?? '',
          suite: spec._suite,
          level: extractLevel(spec.tags ?? []) ?? '',
          status,
          durationMs: typeof result.duration === 'number' ? result.duration : 0,
          retryCount: Math.max(0, results.length - 1),
          flaky: test.status === 'flaky' || (status === 'passed' && results.length > 1),
          repeatLabel: repeats > 1 ? `Durchlauf ${index}/${repeats}` : undefined,
          repeatIndex: repeats > 1 ? index : undefined,
          repeatTotal: repeats > 1 ? repeats : undefined,
          skipReason,
          errorSummary: errorMessage ? firstMeaningfulLine(errorMessage) : undefined,
          errorDetail: errorMessage ? stripAnsi(errorMessage).trim() : undefined,
          attachments,
        });
      }
    }
  }

  const summary: ReportSummary = {
    total: rows.length,
    passed: rows.filter((r) => r.status === 'passed').length,
    failed: rows.filter((r) => r.status === 'failed' || r.status === 'timedOut').length,
    skipped: rows.filter((r) => r.status === 'skipped').length,
    flaky: rows.filter((r) => r.flaky).length,
    durationMs: rows.reduce((sum, r) => sum + r.durationMs, 0),
  };

  return { rows, summary };
}

/** Zieht die erste Host-URL (https://…) aus einem Fehlertext, falls vorhanden. */
function extractHost(text: string): string | undefined {
  const m = text.match(/https?:\/\/[^\s"')]+/);
  if (!m) {
    return undefined;
  }
  try {
    return new URL(m[0]).host;
  } catch {
    return undefined;
  }
}

/**
 * Leitet aus einem Report einen Blocker-Hinweis ab und trennt so Umgebungs-
 * probleme von echten Funktionsfehlern (Projektkonvention). Erkennt gezielt:
 *
 * 1. Netz-/Erreichbarkeitsfehler (ERR_ABORTED, ENOTFOUND, ECONNREFUSED,
 *    CONNECTION_TIMED_OUT …) -> konkrete VPN-/Netz-Vermutung mit betroffenem Host.
 * 2. Fehlende Env/Credentials (MissingEnvError) -> Hinweis auf .env.
 * 3. Login/Setup-Fehler -> Hinweis auf Login/SSO.
 * 4. Smoketest (Projekt `smoke`, Gate) gescheitert -> übrige Tests übersprungen.
 *
 * Greift schon, wenn der Login-/Setup-Schritt kippt (dann laufen die übrigen
 * Tests gar nicht erst) — nicht erst, wenn ALLE Tests fehlschlagen.
 */
export function detectBlocker(view: ReportView): string | undefined {
  const info = detectBlockerInfo(view);
  return info ? blockerText(info) : undefined;
}

/** Maschinenlesbarer Blocker: Die Web-UI übersetzt ihn je Sprache (Schlüssel `blocker.<code>`). */
export interface BlockerInfo {
  code: 'network' | 'env' | 'login' | 'smoke';
  /** network: host (optional); smoke: tests (Titel, mit „; “ getrennt). */
  params: Record<string, string>;
}

/** Deutscher Text zu einem Blocker (Quelle für `detectBlocker`, Fallback der Web-UI). */
export function blockerText(info: BlockerInfo): string {
  switch (info.code) {
    case 'network': {
      const hostPart = info.params.host ? ` (${info.params.host})` : '';
      return (
        `Netz-/Erreichbarkeitsproblem: Die AEM-Instanz${hostPart} war nicht ` +
        `erreichbar. Wahrscheinlichste Ursache: VPN nicht verbunden. ` +
        `Prüfe die VPN-Verbindung; sonst DNS/Firewall oder ob die Instanz läuft.`
      );
    }
    case 'env':
      return (
        'Konfigurations-Blocker: Pflicht-Umgebungsvariablen fehlen ' +
        '(AEM_BASE_URL/AEM_USER/AEM_PASSWORD). .env prüfen.'
      );
    case 'login':
      return (
        'Login-Blocker: Die Anmeldung an AEM ist fehlgeschlagen. Credentials in ' +
        'der .env prüfen; erzwingt die Umgebung SSO, muss auth.setup.ts angepasst ' +
        'werden (siehe README).'
      );
    case 'smoke':
      return (
        `Umgebungs-Blocker: Smoketest fehlgeschlagen (${info.params.tests}). ` +
        'Die übrigen AEM-Tests wurden deshalb nicht ausgeführt. Ursache in der Smoketest-Zeile prüfen.'
      );
  }
}

export function detectBlockerInfo(view: ReportView): BlockerInfo | undefined {
  const failed = view.rows.filter(
    (r) => r.status === 'failed' || r.status === 'timedOut',
  );
  if (failed.length === 0) {
    return undefined;
  }

  const haystack = (r: (typeof failed)[number]) =>
    `${r.errorSummary ?? ''} ${r.errorDetail ?? ''}`;

  // 1) Netz-/Erreichbarkeit: die häufigste Ursache bei internen AEM-Hosts.
  const netPattern =
    /(ERR_ABORTED|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION_TIMED_OUT|ERR_CONNECTION_REFUSED|ERR_NETWORK_CHANGED|ERR_INTERNET_DISCONNECTED|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|net::)/i;
  const netHit = failed.find((r) => netPattern.test(haystack(r)));
  if (netHit) {
    const host = extractHost(haystack(netHit));
    return { code: 'network', params: host ? { host } : {} };
  }

  // 2) Fehlende Umgebungsvariablen/Credentials.
  if (failed.some((r) => /MissingEnvError/i.test(haystack(r)))) {
    return { code: 'env', params: {} };
  }

  // 3) Login/Setup gescheitert (ohne klaren Netzfehler).
  const loginHit = failed.find(
    (r) =>
      /\bauth\.setup\b|authenticate/i.test(`${r.file} ${r.title}`) ||
      /login|anmeld|granite-shell|credentials|passwort/i.test(haystack(r)),
  );
  if (loginHit) {
    return { code: 'login', params: {} };
  }

  // 4) Smoketest (Gate) gescheitert: Playwright überspringt dann alle übrigen AEM-Tests.
  const smokeFailed = failed.filter((r) => r.project === 'smoke');
  if (smokeFailed.length > 0) {
    return { code: 'smoke', params: { tests: smokeFailed.map((r) => r.title).join('; ') } };
  }

  return undefined;
}
