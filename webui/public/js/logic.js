// Reine Logik der Web-UI (ohne DOM). Lässt sich unter Node testen
// (tests/unit/webui-ui-logic.spec.ts).

/** Theme aus gespeicherter Wahl und Systemeinstellung. */
export function resolveTheme(stored, prefersDark) {
  if (stored === 'light' || stored === 'dark') return stored;
  return prefersDark ? 'dark' : 'light';
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
  const haystack = [test.title, file.label, file.file, group.label, ...(test.tags || [])]
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
  const map = {
    smoke: 'Smoketest',
    level1: 'Basisfunktionen (L1)',
    'level2-components': 'Komponenten (L2)',
    integration: 'Integrationstest',
    regression: 'Regressionstest',
    unit: 'Unit',
  };
  return map[level] || level || 'Sonstige';
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
  if (status === 'cancelled') return 'Lauf abgebrochen';
  if (!summary) return '';
  const passed = summary.passed || 0;
  const failed = summary.failed || 0;
  const skipped = summary.skipped || 0;
  const total = summary.total ?? passed + failed + skipped;
  if (total === 0) return 'Keine Tests ausgeführt';
  if (failed > 0) return `${failed} von ${total} ${total === 1 ? 'Test' : 'Tests'} fehlgeschlagen`;
  if (passed === total) return total === 1 ? '1 Test bestanden' : `Alle ${total} Tests bestanden`;
  return `${passed} von ${total} Tests bestanden`;
}

export function fmtDuration(ms) {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/** m:ss für laufende Zeitangaben. */
export function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function fmtSize(bytes) {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const SLOWMO_LABELS = { 0: 'Normal', 500: 'Etwas langsamer', 1500: 'Langsam', 3000: 'Sehr langsam' };
export const slowmoLabel = (ms) => SLOWMO_LABELS[ms] ?? `${ms} ms`;

/** Kurztext der Lauf-Einstellungen. Leer bei älteren Läufen ohne Einstellungen. */
export function runSettingsLabel(s) {
  if (!s) return '';
  const parts = [s.headed ? `Sichtbar, ${slowmoLabel(s.slowMo)}` : 'Headless'];
  if (s.repeatEach > 1) parts.push(`${s.repeatEach}×`);
  if (s.smokeGate) parts.push('Smoketest vorab');
  if (s.updateSnapshots) parts.push('Baselines aktualisiert');
  return parts.join(', ');
}

/** Lesbares Label für die Testauswahl eines Laufs (max. 3 Dateien, Rest als „+N"). */
export function runSelectionLabel(run) {
  const tests = run.originalRequest?.tests;
  const projects = run.originalRequest?.projects;
  if (tests?.length) {
    const files = [...new Set(
      tests.map((t) => (t.file || '').split('/').pop().replace(/\.(spec|test)\.[cm]?[jt]sx?$/i, '')),
    )].filter(Boolean);
    if (!files.length) return run.selection || '—';
    const shown = files.slice(0, 3).join(', ');
    return files.length > 3 ? `${shown} (+${files.length - 3})` : shown;
  }
  if (projects?.length) {
    const meaningful = projects.filter((p) => p !== 'setup');
    return meaningful.length ? `Alle Tests (${meaningful.join(', ')})` : 'Alle Tests';
  }
  return run.selection || '—';
}

const sameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function dayLabel(date, now = new Date()) {
  if (sameDay(date, now)) return 'Heute';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return 'Gestern';
  return date.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' });
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
        label: d.toLocaleString('de-DE', { month: 'long', year: 'numeric' }),
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
