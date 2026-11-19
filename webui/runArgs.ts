/**
 * Baut aus dem UI-Zustand die Playwright-CLI-Argumente und die zusätzlichen
 * Umgebungsvariablen. Reines Modul (kein I/O) -> unit-testbar ohne AEM.
 *
 * Grenzen bewusst: `workers` default 1 (AEM-Instanz nicht parallelisierbar),
 * Credentials werden hier NICHT gesetzt (die erbt der Prozess aus `.env`).
 */

/**
 * Ein ausgewählter Einzeltest. Datei + Zeile allein reichen NICHT für
 * datengetriebene Tests (mehrere test(...) aus einer Schleife teilen sich
 * Datei:Zeile). Der Titel grenzt den konkreten Test per --grep ein.
 */
export interface SelectedTest {
  file: string;
  line: number;
  /** Exakter Testtitel (für --grep, falls Datei:Zeile mehrdeutig ist). */
  title?: string;
}

/** Umgebungs-Preset wie in environments.json. */
export interface EnvironmentPreset {
  id: string;
  label: string;
  baseUrl: string;
  /** Publish-Basis-URL; fehlt sie, gilt AEM_PUBLISH_URL aus .env. */
  publishUrl?: string;
  env: string;
}

/** Vom Frontend geschickte Lauf-Anforderung. */
export interface RunRequest {
  /** Ausgewählte Projekte (unit | setup | chromium). Leer = alle. */
  projects?: string[];
  /** Ausgewählte Einzeltests. Leer = keine Einschränkung auf Testebene. */
  tests?: SelectedTest[];
  /** Ausgewählte komplette Spec-Dateien (ohne Zeilen-Filter). */
  files?: string[];
  /** Gewähltes Umgebungs-Preset. */
  environment?: EnvironmentPreset;
  /** Browser sichtbar starten. */
  headed?: boolean;
  /** Playwright UI-Mode (`--ui`): eigenständige Oberfläche, kein Report/Stream. */
  uiMode?: boolean;
  /** `--grep` Filter. */
  grep?: string;
  /** `--repeat-each` Anzahl. */
  repeatEach?: number;
  /** `--workers` Anzahl (Default 1). */
  workers?: number;
  /** Baselines aktualisieren (`--update-snapshots`). */
  updateSnapshots?: boolean;
  /** Verlangsamung in ms pro Aktion (nur im Headed-Modus sinnvoll). */
  slowMo?: number;
  /** Führt den Dialog-Capture-Lauf aus (setzt CAPTURE_DIALOGS=1). */
  captureDialogs?: boolean;
  /**
   * Smoketest vorab als Gate ausführen (SMOKE_GATE=1). Aus (Default): Es laufen
   * nur die ausgewählten Tests plus Login.
   */
  smokeGate?: boolean;
}

export interface BuiltRun {
  /** Argumente nach `playwright test`. */
  args: string[];
  /** Zusätzliche Umgebungsvariablen (werden über process.env gelegt). */
  env: Record<string, string>;
  /** Menschlich lesbare Vorschau der Kommandozeile. */
  preview: string;
}

/**
 * smoke und chromium hängen an setup (storageState); chromium zusätzlich an
 * smoke (Gate). Playwright startet Dependencies selbst; setup wird hier für eine
 * lesbare Kommandovorschau trotzdem explizit genannt.
 */
function withSetupDependency(projects: string[]): string[] {
  if ((projects.includes('chromium') || projects.includes('smoke')) && !projects.includes('setup')) {
    return ['setup', ...projects];
  }
  return projects;
}

function shellQuote(value: string): string {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Escapet Regex-Sonderzeichen, damit ein Titel wörtlich in --grep matcht. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Baut aus ausgewählten Tests mit Titel ein --grep, das genau diese Titel
 * trifft (Alternation exakt-escapter Titel). Nötig für datengetriebene Tests,
 * deren Datei:Zeile mehrdeutig ist. Gibt '' zurück, wenn kein Titel vorliegt.
 */
export function grepFromTitles(tests: SelectedTest[]): string {
  const titles = [...new Set(tests.map((t) => t.title).filter((t): t is string => !!t && t.trim() !== ''))];
  if (titles.length === 0) return '';
  return titles.map(escapeRegex).join('|');
}

/**
 * Setzt die Lauf-Anforderung in Argumente + env um.
 *
 * @param req  Lauf-Anforderung aus dem Frontend.
 */
export function buildRun(req: RunRequest): BuiltRun {
  const args: string[] = ['test'];

  // 1) Positionale Filter: einzelne Tests (Datei:Zeile) ODER ganze Dateien.
  //    Playwright akzeptiert `datei:zeile` als Filter auf einen Test.
  // Dedupliziert: datengetriebene Geschwister teilen sich Datei:Zeile -> sonst
  // stünde derselbe Positional-Filter mehrfach da.
  const positional: string[] = [
    ...new Set([
      ...(req.tests ?? []).map((t) => `${t.file}:${t.line}`),
      ...(req.files ?? []),
    ]),
  ];

  // 2) Projekte. chromium zieht setup nach.
  const projects = withSetupDependency([...(req.projects ?? [])]);
  for (const p of projects) {
    args.push(`--project=${p}`);
  }

  // 3) UI-Mode ist ein eigener Modus: Playwrights Oberfläche (`--ui`). Die
  //    übrigen Lauf-Optionen (headed/grep/repeat/workers/snapshots) sind dort
  //    irrelevant oder stören; nur Projekte + positionale Filter als Vorauswahl.
  if (req.uiMode) {
    args.push('--ui');
    // --ui ignoriert positionale datei:zeile-Filter, respektiert aber --grep.
    // Daher grep (als Ersatz für die Testauswahl) mitgeben, positionale nicht.
    if (req.grep && req.grep.trim() !== '') {
      args.push(`--grep=${req.grep.trim()}`);
    }
  } else {
    // Sichtbarkeit. Headed = sichtbarer Browser.
    if (req.headed) {
      args.push('--headed');
    }

    // 4) Filter. Ein freies --grep (Suchfeld) hat Vorrang. Sonst, wenn die
    //    Auswahl datengetriebene Tests enthält (Titel vorhanden), grenzt ein
    //    aus den Titeln gebautes --grep auf genau die gewählten Tests ein -
    //    zusammen mit dem Datei:Zeile-Filter. Ohne das liefe bei gleicher
    //    Datei:Zeile die ganze Schleife (alle Geschwister).
    const titleGrep = grepFromTitles(req.tests ?? []);
    if (req.grep && req.grep.trim() !== '') {
      args.push(`--grep=${req.grep.trim()}`);
    } else if (titleGrep !== '') {
      args.push(`--grep=${titleGrep}`);
    }
    if (typeof req.repeatEach === 'number' && req.repeatEach > 1) {
      args.push(`--repeat-each=${req.repeatEach}`);
    }
    // Default workers=1 (AEM-Constraint). Nur abweichen, wenn >1 gewünscht.
    const workers = typeof req.workers === 'number' && req.workers >= 1 ? req.workers : 1;
    args.push(`--workers=${workers}`);

    // 5) Positionale Test-Filter (datei:zeile). OHNE `--`: Playwright wertet
    //    Argumente nach `--` NICHT mehr als Pfad-Filter -> es liefe sonst das
    //    ganze Projekt (alle Tests) statt der Auswahl.
    args.push(...positional);

    // 6) --update-snapshots ans ENDE: Das Flag nimmt in neueren Playwright-
    //    Versionen ein optionales [mode]-Argument. Stünde ein positionaler
    //    Datei:Zeile-Filter direkt dahinter, würde Playwright ihn als Modus
    //    fehldeuten ("argument ... is invalid. Allowed choices are all,
    //    changed, missing, none, default."). Am Ende folgt kein Positional mehr.
    //    Modus `all`: ohne Angabe gilt `changed`, das überschreibt nur Baselines,
    //    deren Vergleich fehlschlägt. Kleine echte Änderungen unter der Toleranz
    //    (z.B. fehlendes Logo) blieben sonst in der alten Baseline stehen.
    if (req.updateSnapshots) {
      args.push('--update-snapshots=all');
    }
  }

  // 5) Umgebung als env-Variablen (baseUrl kann leer sein -> dann nicht setzen,
  //    damit die Config ihren eigenen Default/Fehlerpfad behält).
  const env: Record<string, string> = {};
  if (req.environment) {
    if (req.environment.baseUrl.trim() !== '') {
      env.AEM_BASE_URL = req.environment.baseUrl.trim();
    }
    if ((req.environment.publishUrl ?? '').trim() !== '') {
      env.AEM_PUBLISH_URL = req.environment.publishUrl!.trim();
    }
    if (req.environment.env.trim() !== '') {
      env.AEM_ENV = req.environment.env.trim();
    }
  }
  // Gate immer explizit setzen: Die Config hat es ohne Angabe an (CLI/CI).
  env.SMOKE_GATE = req.smokeGate ? '1' : '0';
  // Verlangsamung nur im sichtbaren Lauf anwenden (headless/UI-Mode ignorieren).
  if (req.headed && typeof req.slowMo === 'number' && req.slowMo > 0) {
    env.PWA_SLOWMO = String(Math.floor(req.slowMo));
  }

  const envPreview = Object.entries(env)
    .map(([k, v]) => `${k}=${shellQuote(v)}`)
    .join(' ');
  const argPreview = args.map(shellQuote).join(' ');
  const preview = `${envPreview ? envPreview + ' ' : ''}npx playwright ${argPreview}`.trim();

  return { args, env, preview };
}
