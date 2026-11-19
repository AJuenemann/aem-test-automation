// Reine Logik des Cockpits (ohne DOM). Lässt sich unter Node testen
// (tests/unit/cockpit-ui-logic.spec.ts).
import { t, tn, hasKey, locale } from './i18n.js';

/** Theme aus gespeicherter Wahl und Systemeinstellung. */
export function resolveTheme(stored, prefersDark) {
  if (stored === 'light' || stored === 'dark') return stored;
  return prefersDark ? 'dark' : 'light';
}

/**
 * Sprache aus gespeicherter Wahl und Systemsprache: de* -> Deutsch, sonst Englisch.
 * `languages` entspricht navigator.languages (erster Eintrag zählt).
 */
export function resolveLang(stored, languages) {
  if (stored === 'de' || stored === 'en') return stored;
  const first = String((languages && languages[0]) || '').toLowerCase();
  return first === 'de' || first.startsWith('de-') ? 'de' : 'en';
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Eindeutiger Schlüssel eines Tests. Datei:Zeile reicht nicht: datengetriebene
 * Tests (mehrere test(...) aus einer Schleife) teilen sich Datei und Zeile.
 */
export function testKey(file, line, title) {
  return `${file}:${line}:${title}`;
}

/** Erlaubte Umgebungen aus den Tags `env:<id>`. Leer = überall. */
export function allowedEnvsOf(test) {
  return (test.tags || [])
    .filter((t) => t.startsWith('env:'))
    .map((t) => t.slice('env:'.length));
}

/** true, wenn der Test in der gewählten Umgebung laufen darf. */
export function isTestAllowed(test, env) {
  const allowed = allowedEnvsOf(test);
  if (allowed.length === 0) return true;
  return env ? allowed.includes(env.env) : true;
}

/** Nur Unit-Tests gewählt: kein Browser nötig. */
export function isUnitOnly(testCount, projects) {
  return testCount > 0 && projects.length > 0 && projects.every((p) => p === 'unit');
}

/** Passt der Test zum Suchbegriff (Name, Suite, Datei, Kategorie, Tags)? */
export function testMatches(test, file, group, term) {
  if (!term) return true;
  const haystack = [test.title, file.label, file.file, group.label, group.labelEn, ...(test.tags || [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(term);
}

const FAIL_STATES = new Set(['failed', 'timedOut', 'interrupted']);

/** Statusart einer Ergebniszeile: failed | flaky | skipped | passed. */
export function statusKind(row) {
  if (FAIL_STATES.has(row.status)) return 'failed';
  if (row.status === 'skipped') return 'skipped';
  if (row.status === 'passed' && row.flaky) return 'flaky';
  return 'passed';
}

const SEVERITY = { failed: 0, flaky: 1, skipped: 2, passed: 3 };
export const severityOf = (row) => SEVERITY[statusKind(row)];

/** Lesbare Kurzbezeichnung für einen Level-Tag. */
export function levelLabel(level) {
  if (level && hasKey(`level.${level}`)) return t(`level.${level}`);
  return level || t('level.other');
}

/**
 * Gruppiert Ergebniszeilen nach Bereich. Gruppen mit Fehlschlägen stehen oben,
 * innerhalb einer Gruppe stehen Fehlschläge vor instabilen, übersprungenen und
 * bestandenen Tests. Die Ursprungsreihenfolge bleibt bei gleichem Rang erhalten.
 */
export function groupRows(rows) {
  const groups = new Map();
  rows.forEach((row, index) => {
    const label = levelLabel(row.level);
    if (!groups.has(label)) groups.set(label, { label, rows: [], counts: { failed: 0, flaky: 0, skipped: 0, passed: 0 }, first: index });
    const g = groups.get(label);
    g.rows.push({ row, index });
    g.counts[statusKind(row)]++;
  });
  const out = [...groups.values()];
  for (const g of out) {
    g.rows.sort((a, b) => severityOf(a.row) - severityOf(b.row) || a.index - b.index);
    g.rows = g.rows.map((r) => r.row);
    g.worst = g.rows.length ? severityOf(g.rows[0]) : 3;
  }
  out.sort((a, b) => a.worst - b.worst || a.first - b.first);
  return out;
}

/** Kernaussage eines Laufs. */
export function headline(summary, status) {
  if (status === 'cancelled') return t('headline.cancelled');
  if (!summary) return '';
  const passed = summary.passed || 0;
  const failed = summary.failed || 0;
  const skipped = summary.skipped || 0;
  const total = summary.total ?? passed + failed + skipped;
  if (total === 0) return t('headline.none');
  if (failed > 0) return tn('headline.failed', total, { failed, total });
  if (passed === total) return total === 1 ? t('headline.single') : t('headline.all', { total });
  return t('headline.some', { passed, total });
}

/** Zahl mit einer Nachkommastelle in der Schreibweise der aktiven Sprache (1,5 / 1.5). */
const oneDecimal = (n) =>
  new Intl.NumberFormat(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);

export function fmtDuration(ms) {
  if (ms < 1000) return `${ms} ms`;
  return `${oneDecimal(ms / 1000)} s`;
}

/** m:ss für laufende Zeitangaben. */
export function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtSize(bytes) {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${oneDecimal(bytes / 1024)} KB`;
  return `${oneDecimal(bytes / 1024 / 1024)} MB`;
}

export const slowmoLabel = (ms) => (hasKey(`slowmo.${ms}`) ? t(`slowmo.${ms}`) : `${ms} ms`);

/** Kurztext der Lauf-Einstellungen. Leer bei älteren Läufen ohne Einstellungen. */
export function runSettingsLabel(s) {
  if (!s) return '';
  const parts = [s.headed ? t('settings.headed', { tempo: slowmoLabel(s.slowMo) }) : t('settings.headless')];
  if (s.repeatEach > 1) parts.push(t('sum.repeat', { n: s.repeatEach }));
  if (s.smokeGate) parts.push(t('settings.smokeGate'));
  if (s.updateSnapshots) parts.push(t('settings.snapshots'));
  return parts.join(', ');
}

/**
 * Auswahl-Text, den der Server in meta.json schreibt („3 Test(s)“, „2 Datei(en)“, „alle“), in der
 * aktiven Sprache. Anderer Text (z. B. Projektnamen) bleibt, wie er ist.
 */
function storedSelection(selection) {
  const tests = /^(\d+) Test\(s\)$/.exec(selection || '');
  if (tests) return tn('count.tests', Number(tests[1]));
  const files = /^(\d+) Datei\(en\)$/.exec(selection || '');
  if (files) return tn('run.files', Number(files[1]));
  if (selection === 'alle') return t('run.all');
  return selection || '';
}

/** Lesbares Label für die Testauswahl eines Laufs (max. 3 Dateien, Rest als „+N"). */
export function runSelectionLabel(run) {
  const tests = run.originalRequest?.tests;
  const projects = run.originalRequest?.projects;
  const specFiles = run.originalRequest?.files;
  if (tests?.length) {
    const files = [...new Set(
      tests.map((t) => (t.file || '').split('/').pop().replace(/\.(spec|test)\.[cm]?[jt]sx?$/i, '')),
    )].filter(Boolean);
    if (!files.length) return storedSelection(run.selection) || '—';
    const shown = files.slice(0, 3).join(', ');
    return files.length > 3 ? `${shown} (+${files.length - 3})` : shown;
  }
  if (projects?.length) {
    const meaningful = projects.filter((p) => p !== 'setup');
    return meaningful.length ? t('run.all.projects', { projects: meaningful.join(', ') }) : t('run.all');
  }
  if (specFiles?.length) return tn('run.files', specFiles.length);
  return storedSelection(run.selection) || '—';
}

/**
 * Bereiche (Kategorien) der Tests eines Laufs, z. B. „Komponenten (L2)". `fileToGroup` bildet
 * Testdatei auf Kategorie-Label ab (aus dem Katalog). Leer, wenn sich nichts zuordnen lässt
 * (ältere Läufe, ausgeblendete Kategorien wie Unit): dann gilt `runSelectionLabel`.
 */
export function runAreaLabel(run, fileToGroup) {
  const tests = run.originalRequest?.tests;
  if (!tests?.length) return '';
  const labels = [...new Set(tests.map((t) => fileToGroup.get(t.file)).filter(Boolean))];
  if (!labels.length) return '';
  const shown = labels.slice(0, 2).join(', ');
  return labels.length > 2 ? `${shown} (+${labels.length - 2})` : shown;
}

/** Kernaussage eines Laufs für die Historie (wie in der Detailansicht). */
export function runHeadline(run) {
  return headline(run.summary, run.status) || (run.status === 'running' ? t('headline.running') : run.status || '');
}

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function dayLabel(date, now = new Date()) {
  if (sameDay(date, now)) return t('day.today');
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return t('day.yesterday');
  return date.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'long' });
}

/**
 * Läufe (neueste zuerst) nach Monat und Tag gruppieren. Der aktuelle Monat ist
 * aufgeklappt. Die Reihenfolge der Eingabe bleibt erhalten.
 */
export function groupRunsByMonthDay(runs, now = new Date()) {
  const months = new Map();
  for (const run of runs) {
    const d = new Date(run.startedAt);
    const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
    if (!months.has(monthKey)) {
      months.set(monthKey, {
        key: monthKey,
        label: d.toLocaleString(locale(), { month: 'long', year: 'numeric' }),
        open: d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth(),
        runs: [],
        days: new Map(),
      });
    }
    const m = months.get(monthKey);
    m.runs.push(run);
    const dayKey = `${monthKey}-${d.getDate()}`;
    if (!m.days.has(dayKey)) m.days.set(dayKey, { key: dayKey, label: dayLabel(d, now), runs: [] });
    m.days.get(dayKey).runs.push(run);
  }
  return [...months.values()].map((m) => ({ ...m, days: [...m.days.values()] }));
}

// --- Kontrast (WCAG 2.x), nur für den Token-Test -----------------------------
function channel(v) {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
export function luminance(hex) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
export function contrastRatio(hexA, hexB) {
  const [a, b] = [luminance(hexA), luminance(hexB)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}
