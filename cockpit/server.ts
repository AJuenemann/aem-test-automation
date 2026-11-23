/**
 * Lokaler Runner-Service für das Test-Cockpit.
 *
 * Bewusst klein gehalten: nur Node-Bordmittel (node:http / node:child_process /
 * node:fs). Läuft ausschließlich auf localhost, kein Auth. Startet Playwright
 * als Child-Prozess im Suite-Root, streamt Logs via SSE und persistiert je Lauf
 * den JSON-Report + Metadaten unter cockpit/runs/<id>/.
 *
 * Grenzen: genau EIN aktiver Lauf gleichzeitig; Credentials werden nicht in der
 * UI eingegeben, sondern vom Prozess aus `.env` geerbt.
 */
import { createServer, request as httpRequest, IncomingMessage, ServerResponse } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { createInterface } from 'node:readline';
import { spawn, execFile, ChildProcess } from 'node:child_process';
import { platform } from 'node:os';
import { promises as fs, createReadStream, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { parseCatalog, TestCatalog, CategoryDef } from './catalog.js';
import { buildRun, RunRequest } from './runArgs.js';
import { buildReportView, detectBlocker, detectBlockerInfo, BlockerInfo, ReportView } from './report.js';
import { sortRunsNewestFirst, runSettingsFrom, RunMeta } from './history.js';
import { isAllowedCleanupPath, selectTestPages } from './cleanup.js';
import { listeningPids, processInfo, isOwnCockpit, terminate, shortCommand, unreachableMessage, PF_ANCHOR_FILE, type ProcessInfo } from './portguard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Suite-Root ist der Elternordner von cockpit/.
const SUITE_ROOT = path.resolve(__dirname, '..');
const RUNS_DIR = path.join(__dirname, 'runs');
const PUBLIC_DIR = path.join(__dirname, 'public');
/** Alte Oberfläche als Fallback unter /legacy/ (Entfernung nach Abnahme der neuen UI). */
const LEGACY_DIR = path.join(__dirname, 'public-legacy');
/**
 * Neu pro Start des Dienstes. Die Oberfläche merkt sich damit, ob ihre gespeicherte
 * Umgebung aus diesem oder einem früheren Start stammt (nach einem Neustart ist
 * bewusst keine Umgebung vorgewählt).
 */
const SERVER_START_ID = randomUUID();
const PORT = Number(process.env.COCKPIT_PORT) || 4321;
/**
 * Nur Anzeige: Adresse in der ausgegebenen/geöffneten URL. Gebunden wird immer 127.0.0.1.
 * `*.localhost` zeigt immer auf den eigenen Rechner und ist in Chrome ein sicherer Kontext (kein „Nicht sicher").
 */
const PUBLIC_URL = process.env.COCKPIT_URL?.trim() || `http://cockpit.localhost:${PORT}/`;
/** Live-Log-Reporter (relativ zum Suite-Root, Playwright lädt TS direkt). */
const LIVE_REPORTER = './cockpit/live-reporter.ts';

const PW_BIN = path.join(SUITE_ROOT, 'node_modules', '.bin', 'playwright');

// ---------------------------------------------------------------------------
// Aufräum-Task: verwaiste Testseiten unter der Spielwiese finden/löschen.
// Nutzt AEM direkt (Credentials aus .env), getrennt vom Playwright-Lauf.
// ---------------------------------------------------------------------------
interface AemAccess {
  baseUrl: string;
  /** Spielwiesen, unter denen der Aufräum-Task sucht (Seiten, Visitenkarten, DAM). */
  playgrounds: string[];
  user: string;
  password: string;
}

/**
 * Fehler mit maschinenlesbarem Code. Die API liefert zusätzlich zum deutschen `error`-Text
 * `code` und `params` (additiv, die alte Oberfläche ignoriert sie). Das neue Cockpit
 * übersetzt über den Code (Wörterbuch-Schlüssel `err.<code>`).
 */
class CodedError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly params: Record<string, string> = {},
  ) {
    super(message);
  }
}

/** Hinweis mit Code für das Cockpit (parallel zum deutschen Text in `warnings`). */
interface ApiNote {
  code: string;
  params: Record<string, string>;
}

const noteOf = (err: unknown): ApiNote =>
  err instanceof CodedError
    ? { code: err.code, params: err.params }
    : { code: 'cleanup.notSearched', params: { message: (err as Error).message } };

/**
 * Liest AEM-Zugang aus der .env der Suite (ohne dotenv-Abhängigkeit).
 * Mit `envId` gilt die Author-URL des Presets aus environments.json (in der UI
 * gewählte Umgebung). Nur die Kennung kommt vom Browser, die URL nie: sonst
 * könnte eine Anfrage unsere Credentials an einen fremden Host schicken.
 */
async function readAemAccess(envId?: string): Promise<AemAccess> {
  const raw = await fs.readFile(path.join(SUITE_ROOT, '.env'), 'utf-8');
  const env: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  let baseUrl = (env.AEM_BASE_URL || '').replace(/\/+$/, '');
  if (envId) {
    const presets = JSON.parse(await fs.readFile(path.join(__dirname, 'environments.json'), 'utf-8')) as {
      environments: { id: string; baseUrl: string }[];
    };
    const preset = presets.environments.find((e) => e.id === envId);
    if (!preset?.baseUrl) throw new CodedError('env.unknown', `Unbekannte Umgebung "${envId}".`, { env: envId });
    baseUrl = preset.baseUrl.replace(/\/+$/, '');
  }
  // Defaults spiegeln config/env.ts (Pfad-Guard der Tests).
  const playgrounds = [
    env.AEM_PLAYGROUND_PATH || '/content/fhgtest',
    env.AEM_BUSINESSCARD_PLAYGROUND_PATH || '/content/businesscards/fhgtest',
    env.AEM_DAM_PLAYGROUND_PATH || '/content/dam/fhgtest',
  ].map((p) => p.replace(/\/+$/, ''));
  if (!baseUrl || !env.AEM_USER || !env.AEM_PASSWORD) {
    throw new CodedError('access.incomplete', 'AEM-Zugang unvollständig (.env: AEM_BASE_URL/AEM_USER/AEM_PASSWORD).');
  }
  return { baseUrl, playgrounds, user: env.AEM_USER, password: env.AEM_PASSWORD };
}

/** Alle Umgebungen aus environments.json (Aufräum-Task durchsucht jede). */
async function listEnvironments(): Promise<{ id: string; label: string; labelEn?: string }[]> {
  const presets = JSON.parse(await fs.readFile(path.join(__dirname, 'environments.json'), 'utf-8')) as {
    environments: { id: string; label: string; labelEn?: string; baseUrl: string }[];
  };
  return presets.environments
    .filter((e) => e.baseUrl)
    .map((e) => ({
      id: e.id,
      label: e.label.split(' (')[0],
      ...(e.labelEn ? { labelEn: e.labelEn.split(' (')[0] } : {}),
    }));
}

/** Einfacher AEM-Request (Basic-Auth, TLS-Fehler tolerant wie die Tests). */
function aemRequest(
  access: AemAccess,
  method: 'GET' | 'POST',
  reqPath: string,
  body?: string,
): Promise<{ status: number; text: string }> {
  const url = new URL(access.baseUrl + reqPath);
  const auth = 'Basic ' + Buffer.from(`${access.user}:${access.password}`).toString('base64');
  const headers: Record<string, string> = { Authorization: auth };
  if (body !== undefined) {
    headers['content-type'] = 'application/x-www-form-urlencoded';
    headers['content-length'] = String(Buffer.byteLength(body));
  }
  return new Promise((resolve, reject) => {
    const r = httpsRequest(
      { hostname: url.hostname, port: 443, path: url.pathname + url.search, method, headers, rejectUnauthorized: false, timeout: 25_000 },
      (res) => {
        let text = '';
        res.on('data', (d) => (text += d));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, text }));
      },
    );
    r.on('error', reject);
    r.on('timeout', () => { r.destroy(); reject(new Error('AEM-Request Timeout.')); });
    if (body !== undefined) r.write(body);
    r.end();
  });
}

/**
 * Listet die Pfade löschbarer Testseiten direkt unter allen Spielwiesen.
 * Nicht lesbare Spielwiesen landen in `warnings`, die übrigen werden trotzdem durchsucht.
 */
async function listTestPages(
  access: AemAccess,
): Promise<{ pages: string[]; warnings: string[]; warningNotes: ApiNote[] }> {
  const pages: string[] = [];
  const warnings: string[] = [];
  const warningNotes: ApiNote[] = [];
  for (const root of access.playgrounds) {
    const res = await aemRequest(access, 'GET', `${root}.1.json`);
    if (res.status !== 200) {
      warnings.push(`${root} nicht lesbar (HTTP ${res.status}).`);
      warningNotes.push({ code: 'cleanup.unreadable', params: { root, status: String(res.status) } });
      continue;
    }
    const json = JSON.parse(res.text) as Record<string, unknown>;
    const children = Object.keys(json).filter((k) => !k.startsWith('jcr:') && typeof json[k] === 'object');
    pages.push(...selectTestPages(children).map((name) => `${root}/${name}`));
  }
  return { pages, warnings, warningNotes };
}

/** Löscht genau eine Testseite; nur direkt unter einer Spielwiese erlaubt (Guard). */
async function deleteTestPage(access: AemAccess, target: string): Promise<number> {
  if (!isAllowedCleanupPath(target, access.playgrounds)) {
    throw new Error(`Pfad-Guard: ${target} ist keine Testseite unter ${access.playgrounds.join(', ')}.`);
  }
  const res = await aemRequest(access, 'POST', target, ':operation=delete');
  return res.status;
}

// ---------------------------------------------------------------------------
// Laufzeit-Zustand: genau ein aktiver Lauf.
// ---------------------------------------------------------------------------
interface ActiveRun {
  id: string;
  child: ChildProcess;
  /** Verbundene SSE-Clients. */
  clients: Set<ServerResponse>;
  /** Gepuffertes Log, damit spät verbundene Clients den Anfang sehen. */
  logBuffer: string[];
  meta: RunMeta;
  reportPath: string;
  finished: boolean;
}

let activeRun: ActiveRun | undefined;
let catalogCache: TestCatalog | undefined;

// ---------------------------------------------------------------------------
// HTTP-Helfer
// ---------------------------------------------------------------------------
function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(payload);
}

function sendText(res: ServerResponse, status: number, text: string): void {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(text);
}

/**
 * Prüft, ob `grep` ein gültiges Regex ist (Playwright deutet --grep als RegExp).
 * Gibt eine Fehlermeldung zurück, wenn ungültig, sonst undefined.
 */
function validateGrep(grep: string | undefined): string | undefined {
  if (!grep || grep.trim() === '') {
    return undefined;
  }
  try {
    new RegExp(grep);
    return undefined;
  } catch (err) {
    return (err as Error).message;
  }
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString('utf-8');
  return raw ? (JSON.parse(raw) as T) : ({} as T);
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.zip': 'application/zip',
  '.webm': 'video/webm',
};

function contentTypeFor(file: string): string {
  return CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * Serviert eine Datei, aber nur innerhalb eines erlaubten Wurzelverzeichnisses
 * (Schutz gegen Pfad-Traversal). Gibt false zurück, wenn außerhalb/nicht da.
 * `extraHeaders` erlaubt z.B. CORS-Header für spezifische Routen.
 */
function serveFileWithin(
  res: ServerResponse,
  root: string,
  requestedRelative: string,
  extraHeaders?: Record<string, string>,
): boolean {
  const abs = path.resolve(root, requestedRelative);
  if (abs !== root && !abs.startsWith(root + path.sep)) {
    return false;
  }
  if (!existsSync(abs)) {
    return false;
  }
  // no-cache: der Browser muss die Datei vor Verwendung revalidieren. Verhindert,
  // dass nach Änderungen an app.js/app.css noch die alte Version aus dem
  // Browser-Cache geladen wird (lokaler Service, keine CDN-Optimierung nötig).
  res.writeHead(200, {
    'content-type': contentTypeFor(abs),
    'cache-control': 'no-cache',
    ...extraHeaders,
  });
  createReadStream(abs).pipe(res);
  return true;
}

// ---------------------------------------------------------------------------
// Testkatalog via `playwright test --list --reporter=json`
// ---------------------------------------------------------------------------
async function loadCategories(): Promise<CategoryDef[]> {
  try {
    const raw = await fs.readFile(path.join(__dirname, 'categories.json'), 'utf-8');
    const parsed = JSON.parse(raw) as { categories?: CategoryDef[] };
    return parsed.categories ?? [];
  } catch {
    return [];
  }
}

async function loadCatalog(force = false): Promise<TestCatalog> {
  if (catalogCache && !force) {
    return catalogCache;
  }
  const categories = await loadCategories();
  return new Promise((resolve, reject) => {
    execFile(
      PW_BIN,
      ['test', '--list', '--reporter=json'],
      { cwd: SUITE_ROOT, maxBuffer: 20 * 1024 * 1024 },
      (err, stdout) => {
        // `--list` liefert JSON auf stdout; ein non-zero exit kommt vor, wenn
        // Tests nur "listbar" aber nicht lauffähig sind -> stdout trotzdem lesen.
        try {
          const json = JSON.parse(stdout);
          catalogCache = parseCatalog(json, categories);
          resolve(catalogCache);
        } catch {
          reject(err ?? new Error('Konnte Testkatalog nicht parsen.'));
        }
      },
    );
  });
}

// ---------------------------------------------------------------------------
// SSE
// ---------------------------------------------------------------------------
function sseInit(res: ServerResponse): void {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
}

function sseSend(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcast(run: ActiveRun, event: string, data: unknown): void {
  for (const client of run.clients) {
    sseSend(client, event, data);
  }
}

/** Obergrenze fürs gepufferte Backlog (für spät verbundene SSE-Clients). */
const MAX_LOG_BACKLOG_BYTES = 256 * 1024;

/**
 * Begrenzt das Log-Backlog auf ~MAX_LOG_BACKLOG_BYTES, indem vorne (älteste
 * Chunks) abgeschnitten wird. Verhindert unbegrenztes Wachstum bei langen
 * Läufen; live gestreamte Ausgabe ist davon nicht betroffen.
 */
function trimLogBacklog(run: ActiveRun): void {
  let total = 0;
  for (const chunk of run.logBuffer) {
    total += chunk.length;
  }
  while (total > MAX_LOG_BACKLOG_BYTES && run.logBuffer.length > 1) {
    total -= run.logBuffer.shift()!.length;
  }
}

// ---------------------------------------------------------------------------
// Lauf starten
// ---------------------------------------------------------------------------
/**
 * Startet Playwrights UI-Mode (`--ui`) als eigenständigen Prozess. Kein
 * activeRun, kein Reporter-Override, kein Streaming: der Prozess lebt, bis der
 * Nutzer das UI-Mode-Fenster schließt. env (AEM_BASE_URL/AEM_ENV) wird gesetzt,
 * Credentials erbt der Prozess aus der .env.
 */
function startUiMode(req: RunRequest): void {
  const built = buildRun(req); // enthält `--ui` + optionale Projekte/Filter
  const childEnv: NodeJS.ProcessEnv = { ...process.env, ...built.env };
  const child = spawn(PW_BIN, built.args, {
    cwd: SUITE_ROOT,
    env: childEnv,
    detached: true,
    stdio: 'ignore',
  });
  child.on('error', () => {
    // Startfehler bewusst ignorieren (kein SSE-Kanal im UI-Mode).
  });
  child.unref();
}

async function startRun(req: RunRequest): Promise<{ id: string; uiMode?: boolean }> {
  if (activeRun && !activeRun.finished) {
    throw new CodedError('run.busy', 'Es läuft bereits ein Test. Bitte warten oder abbrechen.');
  }

  // Spezialpfad UI-Mode: Playwrights eigene Oberfläche (`--ui`) ist ein
  // eigenständiger Dauerläufer ohne Report/Stream. Darum NICHT als activeRun
  // führen (würde weitere Läufe blockieren) und keinen Reporter erzwingen:
  // Prozess detached starten, sofort zurückkehren.
  if (req.uiMode) {
    startUiMode(req);
    return { id: 'ui', uiMode: true };
  }

  const id = randomUUID();
  const runDir = path.join(RUNS_DIR, id);
  await fs.mkdir(runDir, { recursive: true });
  const reportPath = path.join(runDir, 'report.json');
  const htmlDir = path.join(runDir, 'html');
  const artifactsDir = path.join(runDir, 'artifacts');

  const built = buildRun(req);
  // JSON-Report + HTML-Report lauf-spezifisch; Artefakte (Traces, Screenshots,
  // Videos) ebenfalls in das Lauf-Verzeichnis, damit sie beim Löschen des Laufs
  // mitentfernt werden und nicht den gemeinsamen test-results/-Ordner belasten.
  // Playwright-Flag: --output (nicht --output-dir, das ist kein gültiges Flag).
  // Eigener Live-Reporter statt `list`/`line`: schreibt den Teststart sofort
  // ("[n/m] … › Titel") und hängt Ergebnis + Dauer an dieselbe Zeile an.
  const args = [...built.args, `--reporter=${LIVE_REPORTER},json,html`, '--output', artifactsDir];

  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...built.env,
    PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath,
    PLAYWRIGHT_HTML_OUTPUT_DIR: htmlDir,
    // Playwright würde den HTML-Report nach dem Lauf im Browser öffnen wollen;
    // das unterbinden, der Button öffnet ihn über das Cockpit.
    PLAYWRIGHT_HTML_OPEN: 'never',
    // Dialog-Capture: aktiviert den Capture-Modus in dialog-capture.spec.ts.
    ...(req.captureDialogs ? { CAPTURE_DIALOGS: '1' } : {}),
  };

  const selection =
    (req.tests?.length ? `${req.tests.length} Test(s)` : '') ||
    (req.files?.length ? `${req.files.length} Datei(en)` : '') ||
    (req.projects?.length ? req.projects.join(', ') : 'alle');

  const meta: RunMeta = {
    id,
    startedAt: new Date().toISOString(),
    environment: req.environment?.label,
    selection,
    status: 'running',
    originalRequest: {
      tests: req.tests,
      files: req.files,
      projects: req.projects,
      grep: req.grep || undefined,
    },
    settings: runSettingsFrom(req),
  };
  await fs.writeFile(path.join(runDir, 'meta.json'), JSON.stringify(meta, null, 2));

  const child = spawn(PW_BIN, args, { cwd: SUITE_ROOT, env: childEnv });

  const run: ActiveRun = {
    id,
    child,
    clients: new Set(),
    logBuffer: [],
    meta,
    reportPath,
    finished: false,
  };
  activeRun = run;

  // Vorschau als erste Log-Zeile (ohne Secrets, env enthält nur baseUrl/env).
  const header = `$ ${built.preview}\n`;
  run.logBuffer.push(header);

  const onData = (buf: Buffer) => {
    const text = buf.toString('utf-8');
    run.logBuffer.push(text);
    trimLogBacklog(run);
    broadcast(run, 'log', text);
  };
  child.stdout?.on('data', onData);
  child.stderr?.on('data', onData);

  child.on('close', async (code) => {
    run.finished = true;
    // Einen vom Nutzer angeforderten Abbruch NICHT mit passed/failed
    // überschreiben: SIGTERM liefert code != 0, wäre sonst fälschlich "failed".
    const status =
      run.meta.status === 'cancelled'
        ? 'cancelled'
        : code === 0
          ? 'passed'
          : 'failed';
    run.meta.status = status;

    // Report lesen und Summary/Blocker ableiten.
    let blocker: string | undefined;
    let blockerInfo: BlockerInfo | undefined;
    try {
      const raw = JSON.parse(await fs.readFile(reportPath, 'utf-8'));
      const view = buildReportView(raw);
      run.meta.summary = {
        total: view.summary.total,
        passed: view.summary.passed,
        failed: view.summary.failed,
        flaky: view.summary.flaky,
      };
      blocker = detectBlocker(view);
      blockerInfo = detectBlockerInfo(view);
    } catch {
      // Kein Report (z.B. früher Abbruch) -> Summary bleibt leer.
    }

    await fs.writeFile(
      path.join(runDir, 'meta.json'),
      JSON.stringify(run.meta, null, 2),
    );
    // Größe nach dem Schreiben der finalen meta.json berechnen.
    run.meta.sizeBytes = await dirSizeBytes(runDir);
    await fs.writeFile(
      path.join(runDir, 'meta.json'),
      JSON.stringify(run.meta, null, 2),
    );
    broadcast(run, 'done', { id, code, status, blocker, blockerInfo });
    for (const client of run.clients) {
      client.end();
    }
    run.clients.clear();
  });

  child.on('error', (err) => {
    run.finished = true;
    run.meta.status = 'failed';
    broadcast(run, 'log', `\n[Fehler beim Start] ${err.message}\n`);
    broadcast(run, 'done', { id, code: -1, status: 'failed' });
  });

  return { id };
}

// ---------------------------------------------------------------------------
// Report/Historie lesen
// ---------------------------------------------------------------------------
async function readReportView(id: string): Promise<ReportView | undefined> {
  const reportPath = path.join(RUNS_DIR, id, 'report.json');
  if (!existsSync(reportPath)) {
    return undefined;
  }
  const raw = JSON.parse(await fs.readFile(reportPath, 'utf-8'));
  return buildReportView(raw);
}

async function listRuns(): Promise<RunMeta[]> {
  if (!existsSync(RUNS_DIR)) {
    return [];
  }
  const entries = await fs.readdir(RUNS_DIR, { withFileTypes: true });
  const metas: RunMeta[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const metaPath = path.join(RUNS_DIR, entry.name, 'meta.json');
    if (existsSync(metaPath)) {
      try {
        const meta = JSON.parse(await fs.readFile(metaPath, 'utf-8')) as RunMeta;
        // sizeBytes nachholen, falls beim Lauf noch nicht berechnet (ältere Läufe).
        if (typeof meta.sizeBytes !== 'number') {
          meta.sizeBytes = await dirSizeBytes(path.join(RUNS_DIR, entry.name));
        }
        // Läufe vor dem 19.11.2026 zählten Durchläufe zusammen und kannten
        // „instabil" nicht: Summary einmalig aus report.json neu berechnen und
        // zurückschreiben (laufende Läufe nicht anfassen).
        const reportPath = path.join(RUNS_DIR, entry.name, 'report.json');
        if (meta.status !== 'running' && meta.summary && meta.summary.flaky === undefined && existsSync(reportPath)) {
          try {
            const s = buildReportView(JSON.parse(await fs.readFile(reportPath, 'utf-8'))).summary;
            meta.summary = { total: s.total, passed: s.passed, failed: s.failed, flaky: s.flaky };
            await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
          } catch {
            // defekter Report: alte Summary behalten
          }
        }
        metas.push(meta);
      } catch {
        // defekte meta.json überspringen
      }
    }
  }
  return sortRunsNewestFirst(metas);
}

/**
 * Lauf-ID des neuesten Laufs, der einen HTML-Report (html/index.html) hat.
 * Aus dem Dateisystem ermittelt -> überlebt einen Server-Neustart.
 */
async function latestRunWithHtmlReport(): Promise<string | undefined> {
  const runs = await listRuns(); // bereits neueste zuerst
  for (const run of runs) {
    if (existsSync(path.join(RUNS_DIR, run.id, 'html', 'index.html'))) {
      return run.id;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Attachment-/Snapshot-Pfade in URLs übersetzen
// ---------------------------------------------------------------------------
/**
 * Übersetzt einen absoluten Artefakt-Pfad in eine /files/runs-URL.
 * Artefakte liegen jetzt lauf-spezifisch unter cockpit/runs/<id>/artifacts/.
 */
function toArtifactUrl(runId: string, absPath: string): string | undefined {
  const runDir = path.join(RUNS_DIR, runId);
  const resolved = path.resolve(absPath);
  if (resolved.startsWith(runDir + path.sep)) {
    return `/files/runs/${runId}/${path.relative(runDir, resolved).split(path.sep).join('/')}`;
  }
  return undefined;
}

/**
 * Summiert rekursiv alle Dateigrößen eines Verzeichnisses.
 * Gibt 0 zurück, wenn das Verzeichnis nicht existiert oder nicht lesbar ist.
 */
async function dirSizeBytes(dir: string): Promise<number> {
  let total = 0;
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        total += await dirSizeBytes(full);
      } else {
        const s = await fs.stat(full).catch(() => null);
        if (s) total += s.size;
      }
    }
  } catch { /* Verzeichnis nicht vorhanden oder nicht lesbar */ }
  return total;
}

// ---------------------------------------------------------------------------
// Request-Routing
// ---------------------------------------------------------------------------
async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // ---- API ----
  if (pathname === '/api/tests' && req.method === 'GET') {
    const force = url.searchParams.get('refresh') === '1';
    const catalog = await loadCatalog(force);
    return sendJson(res, 200, catalog);
  }

  if (pathname === '/api/environments' && req.method === 'GET') {
    try {
      const raw = await fs.readFile(path.join(__dirname, 'environments.json'), 'utf-8');
      // serverStartId ist additiv: die alte Oberfläche ignoriert das Feld.
      return sendJson(res, 200, { ...JSON.parse(raw), serverStartId: SERVER_START_ID });
    } catch (err) {
      return sendJson(res, 500, {
        error: `environments.json konnte nicht gelesen werden: ${(err as Error).message}`,
        code: 'environments.unreadable',
        params: { message: (err as Error).message },
      });
    }
  }

  // Identifikation: so erkennt ein zweiter Start, dass auf dem Port UNSERE
  // Cockpit läuft (und nicht ein fremder Prozess). Schnell, ohne Playwright.
  if (pathname === '/api/ping' && req.method === 'GET') {
    return sendJson(res, 200, { app: 'aem-test-cockpit', pid: process.pid });
  }

  // Status: Gibt zurück ob ein Lauf aktiv ist (für die Reconnect-Logik nach
  // einem Browser-Refresh). Der Client kann sich so wieder in den SSE-Stream
  // einklinken, ohne den laufenden Test zu unterbrechen.
  if (pathname === '/api/status' && req.method === 'GET') {
    if (activeRun && !activeRun.finished) {
      return sendJson(res, 200, {
        activeRunId: activeRun.id,
        status: 'running',
        selection: activeRun.meta.selection,
        environment: activeRun.meta.environment,
        startedAt: activeRun.meta.startedAt,
      });
    }
    return sendJson(res, 200, { activeRunId: null, status: 'idle' });
  }

  if (pathname === '/api/shutdown' && req.method === 'POST') {
    sendJson(res, 200, { stopping: true });
    // Erst antworten, dann herunterfahren (Client kann die UI umschalten).
    setTimeout(() => shutdown('UI-Anfrage'), 150);
    return;
  }

  if (pathname === '/api/preview' && req.method === 'POST') {
    const body = await readJsonBody<RunRequest>(req);
    return sendJson(res, 200, { preview: buildRun(body).preview });
  }

  if (pathname === '/api/run' && req.method === 'POST') {
    try {
      const body = await readJsonBody<RunRequest>(req);
      // grep ist ein Playwright-Regex: ungültiges Muster vor dem Start abfangen,
      // sonst scheitert der Lauf mit einer kryptischen Regex-Fehlermeldung.
      const grepError = validateGrep(body.grep);
      if (grepError) {
        return sendJson(res, 400, {
          error: `Ungültiger Filter (--grep): ${grepError}`,
          code: 'grep.invalid',
          params: { message: grepError },
        });
      }
      const result = await startRun(body);
      return sendJson(res, 200, result);
    } catch (err) {
      return sendJson(res, 409, {
        error: (err as Error).message,
        ...(err instanceof CodedError ? { code: err.code, params: err.params } : {}),
      });
    }
  }

  const streamMatch = pathname.match(/^\/api\/run\/([^/]+)\/stream$/);
  if (streamMatch && req.method === 'GET') {
    const id = streamMatch[1];
    if (!activeRun || activeRun.id !== id) {
      // Lauf schon beendet -> gepuffertes Log gibt es nicht mehr; Done melden.
      sseInit(res);
      sseSend(res, 'done', { id, note: 'Lauf nicht mehr aktiv.' });
      res.end();
      return;
    }
    sseInit(res);
    // Backlog senden, dann Client registrieren.
    sseSend(res, 'log', activeRun.logBuffer.join(''));
    activeRun.clients.add(res);
    req.on('close', () => activeRun?.clients.delete(res));
    return;
  }

  const cancelMatch = pathname.match(/^\/api\/run\/([^/]+)\/cancel$/);
  if (cancelMatch && req.method === 'POST') {
    const id = cancelMatch[1];
    if (activeRun && activeRun.id === id && !activeRun.finished) {
      activeRun.meta.status = 'cancelled';
      activeRun.child.kill('SIGTERM');
      return sendJson(res, 200, { cancelled: true });
    }
    return sendJson(res, 404, { error: 'Kein aktiver Lauf mit dieser ID.', code: 'run.notActive' });
  }

  const reportMatch = pathname.match(/^\/api\/run\/([^/]+)\/report$/);
  if (reportMatch && req.method === 'GET') {
    let view: ReportView | undefined;
    try {
      view = await readReportView(reportMatch[1]);
    } catch (err) {
      return sendJson(res, 500, {
        error: `Report konnte nicht gelesen werden: ${(err as Error).message}`,
        code: 'report.unreadable',
        params: { message: (err as Error).message },
      });
    }
    if (!view) {
      return sendJson(res, 404, { error: 'Kein Report für diesen Lauf.', code: 'report.missing' });
    }
    // Attachment-Pfade in URLs übersetzen.
    const rows = view.rows.map((row) => ({
      ...row,
      attachments: row.attachments.map((a) => ({
        name: a.name,
        contentType: a.contentType,
        url: a.path ? toArtifactUrl(reportMatch[1], a.path) : undefined,
      })),
    }));
    return sendJson(res, 200, {
      rows,
      summary: view.summary,
      blocker: detectBlocker(view),
      blockerInfo: detectBlockerInfo(view),
    });
  }

  if (pathname === '/api/runs' && req.method === 'GET') {
    const runs = await listRuns();
    const totalSizeBytes = runs.reduce((sum, r) => sum + (r.sizeBytes ?? 0), 0);
    return sendJson(res, 200, { runs, totalSizeBytes });
  }

  if (pathname === '/api/runs/delete' && req.method === 'POST') {
    const { ids } = await readJsonBody<{ ids?: string[] }>(req);
    if (!Array.isArray(ids)) {
      return sendJson(res, 400, { error: 'ids muss ein Array sein.', code: 'ids.array' });
    }
    const results: { id: string; ok: boolean; error?: string; code?: string }[] = [];
    for (const id of ids) {
      // UUID-Format prüfen (Schutz gegen Path-Traversal).
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        results.push({ id, ok: false, error: 'Ungültige Lauf-ID.', code: 'run.invalidId' });
        continue;
      }
      // Laufenden Lauf nicht löschen.
      if (activeRun && !activeRun.finished && activeRun.id === id) {
        results.push({ id, ok: false, error: 'Lauf ist noch aktiv.', code: 'run.stillActive' });
        continue;
      }
      try {
        await fs.rm(path.join(RUNS_DIR, id), { recursive: true, force: true });
        results.push({ id, ok: true });
      } catch (err) {
        results.push({ id, ok: false, error: (err as Error).message });
      }
    }
    return sendJson(res, 200, { results });
  }

  if (pathname === '/api/baselines' && req.method === 'GET') {
    const result = await scanBaselines();
    return sendJson(res, 200, result);
  }

  // Markdown-Viewer: rendert eine .md-Datei aus cockpit/runs/ als gestylte HTML-Seite.
  // Nutzt marked.js via CDN — kein Download, kein Build-Step.
  if (pathname === '/view-md' && req.method === 'GET') {
    const fileUrl = decodeURIComponent(url.searchParams.get('file') ?? '');
    // Sprache der Seite (additiv): ?lang=en, sonst Deutsch wie bisher.
    const en = url.searchParams.get('lang') === 'en';
    const runsPrefix = '/files/runs/';
    if (!fileUrl.startsWith(runsPrefix)) {
      return sendText(res, 400, en ? 'Invalid path.' : 'Ungültiger Pfad.');
    }
    const parts = fileUrl.slice(runsPrefix.length).split('/');
    const runId = parts[0];
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runId)) {
      return sendText(res, 400, en ? 'Invalid run ID.' : 'Ungültige Lauf-ID.');
    }
    const rel = parts.slice(1).join(path.sep);
    const abs = path.resolve(path.join(RUNS_DIR, runId), rel);
    if (!abs.startsWith(path.join(RUNS_DIR, runId) + path.sep) || !existsSync(abs)) {
      return sendText(res, 404, en ? 'File not found.' : 'Datei nicht gefunden.');
    }
    const mdContent = await fs.readFile(abs, 'utf-8');
    // JSON.stringify sichert den Markdown-Inhalt gegen alle Sonderzeichen ab.
    const html = `<!DOCTYPE html>
<html lang="${en ? 'en' : 'de'}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${en ? 'Error context' : 'Fehler-Kontext'}</title>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <style>
    body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; max-width: 860px;
           margin: 32px auto; padding: 0 20px; color: #1f2430; line-height: 1.6; }
    h1,h2,h3 { margin: 1.4em 0 0.4em; }
    pre { background: #f1f5f9; padding: 14px 16px; border-radius: 8px;
          overflow-x: auto; font-size: 13px; }
    code { background: #f1f5f9; padding: 2px 5px; border-radius: 4px; font-size: 13px; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 3px solid #dde1e7; margin: 0; padding-left: 16px; color: #6b7280; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #dde1e7; padding: 6px 12px; }
    th { background: #f1f5f9; }
  </style>
</head>
<body>
  <div id="md"></div>
  <script>
    document.getElementById('md').innerHTML = marked.parse(${JSON.stringify(mdContent)});
  </script>
</body>
</html>`;
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
    res.end(html);
    return;
  }

  // Aufräum-Task: verwaiste Testseiten auf ALLEN Umgebungen auflisten. Ist eine
  // Umgebung nicht erreichbar (z.B. VPN), erscheint ein Hinweis, die übrigen
  // werden trotzdem durchsucht.
  if (pathname === '/api/cleanup/list' && req.method === 'GET') {
    try {
      const environments: {
        id: string; label: string; labelEn?: string; pages: string[]; warnings: string[]; warningNotes: ApiNote[];
      }[] = [];
      let playgrounds: string[] = [];
      for (const e of await listEnvironments()) {
        try {
          const access = await readAemAccess(e.id);
          playgrounds = access.playgrounds;
          const { pages, warnings, warningNotes } = await listTestPages(access);
          environments.push({ ...e, pages, warnings, warningNotes });
        } catch (err) {
          environments.push({
            ...e,
            pages: [],
            warnings: [`Nicht durchsucht: ${(err as Error).message}`],
            warningNotes: [noteOf(err)],
          });
        }
      }
      return sendJson(res, 200, { playgrounds, environments });
    } catch (err) {
      return sendJson(res, 500, { error: (err as Error).message });
    }
  }

  // Aufräum-Task: ausgewählte Testseiten löschen. Jeder Eintrag nennt seine
  // Umgebung (Kennung aus environments.json, nie eine URL).
  if (pathname === '/api/cleanup/delete' && req.method === 'POST') {
    try {
      const body = await readJsonBody<{ items?: { env?: string; path?: string }[] }>(req);
      const items = Array.isArray(body.items) ? body.items : [];
      const accessByEnv = new Map<string, AemAccess>();
      const results: { env: string; name: string; status: number; ok: boolean }[] = [];
      for (const item of items) {
        const env = typeof item.env === 'string' ? item.env : '';
        const target = typeof item.path === 'string' ? item.path : '';
        try {
          if (!accessByEnv.has(env)) accessByEnv.set(env, await readAemAccess(env));
          const access = accessByEnv.get(env)!;
          // Nur Testseiten direkt unter einer Spielwiese (Schutz gegen manipulierte Eingaben).
          if (!isAllowedCleanupPath(target, access.playgrounds)) {
            results.push({ env, name: target, status: 0, ok: false });
            continue;
          }
          const status = await deleteTestPage(access, target);
          results.push({ env, name: target, status, ok: status >= 200 && status < 300 });
        } catch {
          results.push({ env, name: target, status: 0, ok: false });
        }
      }
      return sendJson(res, 200, { results });
    } catch (err) {
      return sendJson(res, 500, { error: (err as Error).message });
    }
  }

  // ---- statische Dateien ----
  // Playwright-HTML-Report je Lauf: /report/<runId>/... liefert den Report eines
  // bestimmten Laufs (für Button und Historie). Der Report lädt seine Assets
  // relativ -> die runId bleibt im Pfad erhalten.
  const reportRunMatch = pathname.match(/^\/report\/([0-9a-f-]{36})(?:\/(.*))?$/i);
  if (reportRunMatch) {
    const runHtmlDir = path.join(RUNS_DIR, reportRunMatch[1], 'html');
    const rel = reportRunMatch[2] && reportRunMatch[2] !== '' ? reportRunMatch[2] : 'index.html';
    if (!serveFileWithin(res, runHtmlDir, rel)) {
      return sendText(res, 404, 'Report-Datei nicht gefunden.');
    }
    return;
  }
  // /report ohne ID: zum neuesten Lauf-Report umleiten (überlebt Neustart, da
  // aus cockpit/runs/ ermittelt), sonst Fallback auf klassisches playwright-report/.
  if (pathname === '/report' || pathname.startsWith('/report/')) {
    if (pathname === '/report') {
      const latest = await latestRunWithHtmlReport();
      if (latest) {
        res.writeHead(302, { location: `/report/${latest}/` });
        res.end();
        return;
      }
    }
    // Fallback: klassischer playwright-report/ (z.B. nach `npm test`).
    const rel = pathname === '/report' ? 'index.html' : pathname.slice('/report/'.length);
    if (!serveFileWithin(res, path.join(SUITE_ROOT, 'playwright-report'), rel || 'index.html')) {
      return sendText(res, 404, 'Noch kein Report vorhanden. Bitte zuerst einen Lauf ausführen.');
    }
    return;
  }

  // Lauf-spezifische Artefakte (Traces, Screenshots, Videos, html/data/).
  // Pfad: /files/runs/<runId>/artifacts/<test-name>/trace.zip
  //        /files/runs/<runId>/html/data/<hash>.dat
  if (pathname.startsWith('/files/runs/')) {
    const parts = pathname.slice('/files/runs/'.length).split('/');
    const runId = parts[0];
    const rel = decodeURIComponent(parts.slice(1).join('/'));
    if (
      !runId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runId) ||
      !serveFileWithin(res, path.join(RUNS_DIR, runId), rel, {
        // trace.playwright.dev lädt Traces per URL → CORS erlauben.
        'access-control-allow-origin': 'https://trace.playwright.dev',
        'access-control-allow-methods': 'GET',
      })
    ) {
      return sendText(res, 404, 'Datei nicht gefunden.');
    }
    return;
  }

  // Beliebige Dateien unter test-results / tests/__snapshots__ (read-only).
  if (pathname.startsWith('/files/test-results/')) {
    const rel = decodeURIComponent(pathname.slice('/files/test-results/'.length));
    if (!serveFileWithin(res, path.join(SUITE_ROOT, 'test-results'), rel)) {
      return sendText(res, 404, 'Datei nicht gefunden.');
    }
    return;
  }
  if (pathname.startsWith('/files/snapshots/')) {
    const rel = decodeURIComponent(pathname.slice('/files/snapshots/'.length));
    if (!serveFileWithin(res, path.join(SUITE_ROOT, 'tests', '__snapshots__'), rel)) {
      return sendText(res, 404, 'Baseline nicht gefunden.');
    }
    return;
  }

  // Fallback: alte Oberfläche unter /legacy/ (bis zur Abnahme der neuen UI).
  if (pathname === '/legacy') {
    res.writeHead(302, { location: '/legacy/' });
    res.end();
    return;
  }
  if (pathname.startsWith('/legacy/')) {
    let rel: string;
    try {
      rel = decodeURIComponent(pathname.slice('/legacy/'.length)) || 'index.html';
    } catch {
      return sendText(res, 400, 'Ungültiger Pfad.');
    }
    if (serveFileWithin(res, LEGACY_DIR, rel)) return;
    return sendText(res, 404, 'Not found.');
  }

  // Frontend
  if (pathname === '/' || pathname === '/index.html') {
    if (serveFileWithin(res, PUBLIC_DIR, 'index.html')) return;
    return sendText(res, 500, 'index.html fehlt.');
  }
  const rel = pathname.replace(/^\/+/, '');
  if (serveFileWithin(res, PUBLIC_DIR, rel)) {
    return;
  }

  return sendText(res, 404, 'Not found.');
}

// ---------------------------------------------------------------------------
// Baseline-Scan: welche visuellen Baselines gibt es pro Umgebung?
// ---------------------------------------------------------------------------
interface BaselineEntry {
  /** Snapshot-relativer Pfad ohne Umgebung (testFilePath/arg.ext). */
  key: string;
  /** Pro Umgebung: existiert die Baseline + /files-URL. */
  perEnv: Record<string, string>;
}

async function scanBaselines(): Promise<{ environments: string[]; entries: BaselineEntry[] }> {
  const snapRoot = path.join(SUITE_ROOT, 'tests', '__snapshots__');
  if (!existsSync(snapRoot)) {
    return { environments: [], entries: [] };
  }
  const envDirs = (await fs.readdir(snapRoot, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  const byKey = new Map<string, BaselineEntry>();

  async function walk(dir: string, env: string, rel: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      const nextRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(abs, env, nextRel);
      } else if (entry.name.endsWith('.png')) {
        let item = byKey.get(nextRel);
        if (!item) {
          item = { key: nextRel, perEnv: {} };
          byKey.set(nextRel, item);
        }
        // nextRel ist bereits mit "/" gebaut -> direkt als URL-Pfad verwenden.
        item.perEnv[env] = `/files/snapshots/${env}/${nextRel}`;
      }
    }
  }

  for (const env of envDirs) {
    await walk(path.join(snapRoot, env), env, '');
  }

  return {
    environments: envDirs.sort(),
    entries: [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key)),
  };
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
const server = createServer((req, res) => {
  handle(req, res).catch((err) => {
    sendJson(res, 500, { error: (err as Error).message });
  });
});

/** Öffnet die UI im Standardbrowser. Abschaltbar via COCKPIT_NO_OPEN=1. */
function openBrowser(targetUrl: string): void {
  if (process.env.COCKPIT_NO_OPEN === '1') {
    return;
  }
  const cmd =
    platform() === 'darwin' ? 'open' : platform() === 'win32' ? 'start' : 'xdg-open';
  // Fehler bewusst ignorieren: ohne Desktop (z.B. CI) ist das kein Problem.
  const child =
    platform() === 'win32'
      ? spawn('cmd', ['/c', 'start', '', targetUrl], { detached: true, stdio: 'ignore' })
      : spawn(cmd, [targetUrl], { detached: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
}

/**
 * Fährt den Service sauber herunter: laufenden Playwright-Child beenden,
 * SSE-Verbindungen schließen, Server schließen (gibt den Port frei), beenden.
 * Mehrfachaufrufe sind harmlos (idempotent).
 */
let shuttingDown = false;
function shutdown(reason: string): void {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  // eslint-disable-next-line no-console
  console.log(`\nBeende Test-Cockpit (${reason})…`);

  if (activeRun && !activeRun.finished) {
    activeRun.child.kill('SIGTERM');
    for (const client of activeRun.clients) {
      client.end();
    }
    activeRun.clients.clear();
  }

  server.close(() => {
    process.exit(0);
  });
  // Notausstieg, falls server.close hängt (offene Keep-Alive-Verbindungen).
  setTimeout(() => process.exit(0), 2000).unref();
}

// Strg+C im Terminal und SIGTERM (z.B. kill) sauber abfangen.
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ---------------------------------------------------------------------------
// Start mit Belegt-Port-Behandlung (EADDRINUSE)
// ---------------------------------------------------------------------------

/** Kleiner localhost-GET; liefert geparstes JSON oder null (kein/fremder Dienst). */
function httpGetJson(pathname: string, timeoutMs = 1500): Promise<unknown | null> {
  return new Promise((resolve) => {
    const req = httpRequest(
      { host: '127.0.0.1', port: PORT, path: pathname, method: 'GET', timeout: timeoutMs },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

/** Fordert eine laufende eigene Instanz zum Herunterfahren auf. */
function httpPostShutdown(timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const req = httpRequest(
      { host: '127.0.0.1', port: PORT, path: '/api/shutdown', method: 'POST', timeout: timeoutMs },
      (res) => {
        res.on('data', () => {});
        res.on('end', () => resolve(res.statusCode === 200));
      },
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

/** Ist unser Cockpit auf dem Port erreichbar? (Identifikation über /api/ping) */
async function isOwnInstanceRunning(): Promise<boolean> {
  const pong = (await httpGetJson('/api/ping')) as { app?: string } | null;
  return pong?.app === 'aem-test-cockpit';
}

/** Einmalige Prüfung: ist der Port aktuell frei? (bindet kurz und gibt frei) */
function isPortFree(): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EACCES') {
        // Kein Fremdprozess: der Port braucht Rechte (z.B. Port < 1024 an 127.0.0.1 unter macOS).
        // eslint-disable-next-line no-console
        console.error(`\nPort ${PORT} darf ohne Administratorrechte nicht belegt werden. Anderen COCKPIT_PORT wählen.\n`);
        process.exit(1);
      }
      resolve(false);
    });
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(PORT, '127.0.0.1');
  });
}

/** Wartet (bis timeoutMs), bis der Port frei wird. true = frei geworden. */
async function waitForPortFree(timeoutMs = 8000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  // Mindestens einmal prüfen, auch bei timeoutMs = 0.
  do {
    if (await isPortFree()) return true;
    await new Promise((r) => setTimeout(r, 250));
  } while (Date.now() < deadline);
  return false;
}

/** Interaktive j/N-Frage; false, wenn kein TTY vorhanden ist. */
async function confirmRestart(
  question = `Das Test-Cockpit läuft bereits auf Port ${PORT}. Neu starten? [j/N] `,
): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await new Promise<string>((resolve) => rl.question(question, resolve));
    return /^(j|ja|y|yes)$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

function listenAndAnnounce(): void {
  // Falls der Port zwischen Prüfung und listen doch belegt wird (Race): klare
  // Meldung statt unbehandeltem EADDRINUSE-Stacktrace.
  server.once('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      // eslint-disable-next-line no-console
      console.error(`\nPort ${PORT} ist belegt. Erneut versuchen oder COCKPIT_PORT wählen.\n`);
      process.exit(1);
    }
    throw err;
  });
  server.listen(PORT, '127.0.0.1', () => {
    const targetUrl = PUBLIC_URL;
    // eslint-disable-next-line no-console
    console.log(`\nAEM Test-Cockpit läuft:  ${targetUrl}`);
    // eslint-disable-next-line no-console
    console.log(`Beenden: Strg+C im Terminal oder „Beenden"-Button in der UI.\n`);
    openBrowser(targetUrl);
    void warnIfUnreachable();
  });
}

/**
 * Selbsttest nach dem Start: Antwortet das Cockpit auf Verbindungen von diesem Rechner? Hängt der Port
 * (etwa durch einen Netzwerkfilter oder eine Sicherheitssoftware), steht sonst nur „Website nicht
 * erreichbar“ im Browser, obwohl der Dienst läuft. Nur eine Warnung, es wird nichts geändert.
 */
async function warnIfUnreachable(): Promise<void> {
  const pong = (await httpGetJson('/api/ping', 4000)) as { app?: string } | null;
  if (pong?.app === 'aem-test-cockpit') return;
  // eslint-disable-next-line no-console
  console.error(unreachableMessage(PORT, existsSync(PF_ANCHOR_FILE)));
}

/**
 * Der Port ist belegt, aber unser Cockpit antwortet nicht. Wer belegt ihn?
 * - eigene (hängende) Instanz dieses Projekts: nach Rückfrage (oder COCKPIT_FORCE=1) beenden
 * - fremder Prozess oder nicht ermittelbar: nichts beenden, Start abbrechen
 */
async function freeBusyPort(): Promise<void> {
  const pids = (await listeningPids(PORT)).filter((pid) => pid !== process.pid);
  const infos: ProcessInfo[] = await Promise.all(pids.map((pid) => processInfo(pid)));
  const own: ProcessInfo[] = [];
  const foreign: ProcessInfo[] = [];
  for (const info of infos) (await isOwnCockpit(info, SUITE_ROOT) ? own : foreign).push(info);

  if (foreign.length || own.length === 0) {
    const who = foreign.length
      ? foreign.map((i) => `  PID ${i.pid}: ${shortCommand(i.command)}`).join('\n')
      : '  (Prozess nicht ermittelbar, `lsof` fehlt oder keine Berechtigung)';
    // eslint-disable-next-line no-console
    console.error(
      `\nPort ${PORT} ist durch einen fremden Prozess belegt (nicht dieses Test-Cockpit). Er wird nicht beendet.\n${who}\n` +
        `Wähle einen anderen Port über COCKPIT_PORT, z.B.:  COCKPIT_PORT=${PORT + 1} npm run cockpit\n`,
    );
    process.exit(1);
  }

  const list = own.map((i) => `PID ${i.pid}`).join(', ');
  if (process.env.COCKPIT_FORCE !== '1') {
    const ok = await confirmRestart(
      `Ein Test-Cockpit (${list}) belegt Port ${PORT}, antwortet aber nicht. Beenden und neu starten? [j/N] `,
    );
    if (!ok) {
      // eslint-disable-next-line no-console
      console.error(
        process.stdin.isTTY
          ? `\nAbgebrochen: das nicht antwortende Test-Cockpit (${list}) bleibt bestehen.\n`
          : `\nEin Test-Cockpit (${list}) belegt Port ${PORT}, antwortet aber nicht. Kein Terminal für die ` +
              `Rückfrage verfügbar; Start abgebrochen. Mit COCKPIT_FORCE=1 beenden und neu starten ` +
              `oder anderen COCKPIT_PORT wählen.\n`,
      );
      process.exit(1);
    }
  }
  // eslint-disable-next-line no-console
  console.log(`Beende das nicht antwortende Test-Cockpit (${list}) auf Port ${PORT}…`);
  for (const info of own) await terminate(info.pid);
}

async function start(): Promise<void> {
  // Vorab prüfen, ob der Port schon belegt ist.
  if (await isPortFree()) {
    listenAndAnnounce();
    return;
  }

  // Belegt: antwortet dort UNSER Cockpit? Sonst klären, ob eine hängende eigene Instanz oder ein
  // fremder Prozess den Port hält (nur Ersteres wird nach Rückfrage beendet).
  if (!(await isOwnInstanceRunning())) {
    await freeBusyPort();
    if (!(await waitForPortFree())) {
      // eslint-disable-next-line no-console
      console.error(`\nPort ${PORT} wurde nicht frei. Anderen COCKPIT_PORT wählen, z.B.:  COCKPIT_PORT=${PORT + 1} npm run cockpit\n`);
      process.exit(1);
    }
    listenAndAnnounce();
    return;
  }

  // Eigene Instanz läuft. COCKPIT_FORCE überspringt die Rückfrage (Debugging).
  const force = process.env.COCKPIT_FORCE === '1';
  if (!force) {
    const ok = await confirmRestart();
    if (!ok) {
      // Kein TTY oder abgelehnt: nichts beenden, sauber aussteigen.
      // eslint-disable-next-line no-console
      console.error(
        process.stdin.isTTY
          ? `\nAbgebrochen — die laufende Instanz bleibt bestehen.\n`
          : `\nDas Test-Cockpit läuft bereits auf Port ${PORT}. Kein Terminal für die ` +
              `Rückfrage verfügbar; Start abgebrochen. Mit COCKPIT_FORCE=1 erzwingen ` +
              `oder anderen COCKPIT_PORT wählen.\n`,
      );
      process.exit(1);
    }
  }

  // Laufende eigene Instanz sauber beenden und auf Portfreigabe warten.
  // eslint-disable-next-line no-console
  console.log(`Beende die laufende Instanz auf Port ${PORT}…`);
  await httpPostShutdown();
  const freed = await waitForPortFree();
  if (!freed) {
    // eslint-disable-next-line no-console
    console.error(
      `\nPort ${PORT} wurde nicht rechtzeitig frei. Bitte die alte Instanz manuell ` +
        `beenden oder einen anderen COCKPIT_PORT wählen.\n`,
    );
    process.exit(1);
  }
  listenAndAnnounce();
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(`Start fehlgeschlagen: ${(err as Error).message}`);
  process.exit(1);
});
