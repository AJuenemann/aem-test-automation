// Reiter „Ergebnisse": Lauf starten, Live-Stream, Kernaussage, Filter, Ergebnisliste.
import { $, $$, state, esc, icon, api, emit, toast, baseRunFields, currentEnvironment } from './core.js';
import {
  groupRows, statusKind, headline, fmtDuration, fmtClock, runSettingsLabel,
} from './logic.js';

const view = {
  runId: null,
  /** idle | running | passed | failed | cancelled */
  status: 'idle',
  startedAt: null,
  envLabel: '',
  report: null,
  filter: 'all',
  live: false, // true: Lauf aus dieser Sitzung (Log vorhanden)
  settings: null,
  notice: '',
};
let es = null;
let ticker = null;
let lastLogAt = 0;

const shortEnv = (label) => (label || '').split(' (')[0];

// ---------------------------------------------------------------------------
// Lauf starten / abbrechen / streamen
// ---------------------------------------------------------------------------
/** Startet einen Lauf und wechselt zur Ergebnisansicht. { ok, error? } */
export async function startRunRequest(req) {
  if (!req.environment) return { ok: false, error: 'Zuerst eine Umgebung wählen (Testlauf, Schritt 2).' };
  const r = await api('/api/run', req);
  if (!r.ok) return { ok: false, error: r.data.error || 'Start fehlgeschlagen.' };
  beginView(r.data.id, { envLabel: shortEnv(req.environment?.label), settings: req });
  location.hash = '#/ergebnisse';
  setTimeout(() => $('#res-title')?.focus({ preventScroll: true }), 60);
  stream(r.data.id);
  return { ok: true };
}

/** Prüft beim Seitenstart, ob noch ein Lauf aktiv ist, und verbindet den Stream neu. */
export async function resumeActiveRun() {
  const r = await api('/api/status');
  const d = r.data;
  if (!r.ok || !d.activeRunId) return false;
  beginView(d.activeRunId, { envLabel: shortEnv(d.environment), startedAt: d.startedAt });
  view.notice = 'Seite wurde neu geladen. Das Log verbindet sich wieder.';
  render();
  stream(d.activeRunId, d.startedAt);
  return true;
}

function beginView(id, { envLabel = '', startedAt = null, settings = null } = {}) {
  view.runId = id;
  view.status = 'running';
  view.startedAt = startedAt ? new Date(startedAt).getTime() : Date.now();
  view.envLabel = envLabel;
  view.report = null;
  view.filter = 'all';
  view.live = true;
  view.notice = '';
  view.settings = settings
    ? { headed: !!settings.headed, slowMo: settings.slowMo, repeatEach: settings.repeatEach, smokeGate: !!settings.smokeGate, updateSnapshots: !!settings.updateSnapshots }
    : null;
  state.activeRunId = id;
  $('#log').textContent = '';
  $('#res-log').open = true;
  render();
}

function stream(id) {
  if (es) es.close();
  es = new EventSource(`/api/run/${id}/stream`);
  lastLogAt = Date.now();
  startTicker();
  es.addEventListener('log', (e) => {
    lastLogAt = Date.now();
    const logEl = $('#log');
    logEl.textContent += JSON.parse(e.data);
    logEl.scrollTop = logEl.scrollHeight;
  });
  es.addEventListener('done', async (e) => {
    const info = JSON.parse(e.data);
    es.close();
    es = null;
    stopTicker();
    view.status = info.status === 'passed' ? 'passed' : info.status === 'cancelled' ? 'cancelled' : 'failed';
    state.activeRunId = null;
    const rep = await loadReport(id);
    if (info.blocker) showBlocker(info.blocker);
    else if (rep?.blocker) showBlocker(rep.blocker);
    if (rep) $('#res-log').open = false;
    render();
    emit('run-done', { id, status: view.status });
  });
  es.onerror = () => {
    // Nach 'done' ist es normaler Verbindungsschluss: keine Meldung.
    if (!es) return;
    es.close();
    es = null;
    stopTicker();
    view.status = 'failed';
    view.notice = 'Verbindung zum Lauf verloren. Der Lauf kann auf dem Rechner weiterlaufen: Seite neu laden.';
    state.activeRunId = null;
    render();
  };
}

export async function cancelRun() {
  if (!state.activeRunId) return;
  await api(`/api/run/${state.activeRunId}/cancel`, {});
  view.notice = 'Abbruch angefordert…';
  render();
}

function startTicker() {
  stopTicker();
  const tick = () => {
    const now = Date.now();
    $('#res-meta').textContent = metaText(now);
    emit('run-state', { running: true, status: 'running', elapsed: fmtClock(now - view.startedAt) });
  };
  tick();
  ticker = setInterval(tick, 1000);
}
function stopTicker() {
  if (ticker) clearInterval(ticker);
  ticker = null;
}

// ---------------------------------------------------------------------------
// Ergebnisse laden und anzeigen
// ---------------------------------------------------------------------------
async function loadReport(id) {
  const r = await api(`/api/run/${id}/report`);
  if (!r.ok) { view.report = null; return null; }
  view.report = r.data;
  return r.data;
}

/** Zeigt einen früheren Lauf aus der Historie. */
export async function showRun(run) {
  if (state.activeRunId && state.activeRunId !== run.id) {
    toast('Es läuft gerade ein Lauf. Er bleibt aktiv, die Ansicht wechselt trotzdem.', 'info');
  }
  stopTicker();
  view.runId = run.id;
  view.status = run.status === 'running' ? 'running' : run.status || 'idle';
  view.startedAt = new Date(run.startedAt).getTime();
  view.envLabel = shortEnv(run.environment);
  view.settings = run.settings || null;
  view.live = false;
  view.filter = 'all';
  view.notice = '';
  view.report = null;
  $('#res-blocker').hidden = true;
  const rep = await loadReport(run.id);
  if (!rep) view.notice = 'Für diesen Lauf gibt es keine Tabellenansicht. Details stehen im Report.';
  else if (rep.blocker) showBlocker(rep.blocker);
  render();
  if (location.hash !== '#/ergebnisse') location.hash = '#/ergebnisse';
  $('#res-title').focus({ preventScroll: true });
}

function showBlocker(text) {
  const el = $('#res-blocker');
  el.hidden = false;
  el.textContent = text;
}

/** Anzeigestatus: running | passed | failed | flaky | cancelled | idle. */
function displayStatus() {
  if (view.status === 'running') return 'running';
  if (view.status === 'cancelled') return 'cancelled';
  const s = view.report?.summary;
  if (s) {
    if (s.failed > 0) return 'failed';
    if (s.flaky > 0) return 'flaky';
    return view.status === 'failed' ? 'failed' : 'passed';
  }
  return view.status;
}

function metaText(now = Date.now()) {
  const parts = [view.envLabel].filter(Boolean);
  if (view.status === 'running') {
    parts.push(`läuft seit ${fmtClock(now - view.startedAt)}`);
    parts.push(`letzte Ausgabe vor ${fmtClock(now - lastLogAt)}`);
  } else {
    parts.push(new Date(view.startedAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }));
    const s = view.report?.summary;
    if (s?.durationMs != null) parts.push(fmtDuration(s.durationMs));
    const settings = runSettingsLabel(view.settings);
    if (settings) parts.push(settings);
  }
  return parts.join(' · ');
}

const STATUS_ICON = { running: 'activity', passed: 'check', failed: 'x', flaky: 'alert', cancelled: 'skip' };

function render() {
  const has = view.runId !== null;
  $('#res-empty').hidden = has;
  $('#res-view').hidden = !has;
  if (!has) return;

  const st = displayStatus();
  const head = $('#res-head');
  head.dataset.status = st;
  $('#res-status-ico').innerHTML = icon(STATUS_ICON[st] || 'skip');
  const s = view.report?.summary;
  $('#res-title').textContent = st === 'running'
    ? 'Tests laufen…'
    : headline(s, view.status) || (view.status === 'failed' ? 'Lauf fehlgeschlagen' : view.status === 'passed' ? 'Lauf erfolgreich' : 'Lauf beendet');
  $('#res-meta').textContent = metaText();
  $('#res-progress').hidden = st !== 'running';
  $('#res-cancel').hidden = st !== 'running';
  $('#open-report').href = view.runId ? `/report/${view.runId}/` : '/report';

  const notice = $('#res-notice');
  notice.hidden = !view.notice;
  notice.textContent = view.notice;
  if (st === 'running') $('#res-blocker').hidden = true;

  $('#res-log').hidden = !view.live;

  const rows = view.report?.rows || [];
  renderCapture(rows);
  renderFilters(rows);
  renderGroups(rows);

  emit('run-state', { running: st === 'running', status: st, elapsed: view.status === 'running' ? fmtClock(Date.now() - view.startedAt) : '' });
}

function renderCapture(rows) {
  const n = rows.filter((r) => r.status === 'skipped' && r.skipReason && /CAPTURE_DIALOGS/i.test(r.skipReason)).length;
  $('#res-capture').hidden = n === 0;
  $('#capture-count').textContent = String(n);
}

const FILTERS = [
  ['all', 'Alle'],
  ['failed', 'Fehlgeschlagen'],
  ['flaky', 'Instabil'],
  ['skipped', 'Übersprungen'],
  ['passed', 'Bestanden'],
];

function renderFilters(rows) {
  const el = $('#res-filters');
  el.hidden = rows.length === 0;
  if (!rows.length) return;
  const counts = { all: rows.length, failed: 0, flaky: 0, skipped: 0, passed: 0 };
  for (const r of rows) counts[statusKind(r)]++;
  el.innerHTML = FILTERS.map(([kind, label]) =>
    `<button type="button" class="filter" data-kind="${kind}" aria-pressed="${view.filter === kind}"${kind !== 'all' && counts[kind] === 0 ? ' disabled' : ''}>` +
    `${label} <span class="n">${counts[kind]}</span></button>`).join('');
}

function artifactInfo(name) {
  const map = [
    ['trace', 'activity', 'Trace'],
    ['video', 'video', 'Video'],
    ['error-context', 'file', 'Fehler-Kontext'],
    ['rendered-page-diff', 'compare', 'Diff'],
    ['rendered-page-expected', 'image', 'Baseline'],
    ['rendered-page-actual', 'image', 'Aufnahme'],
    ['screenshot', 'image', 'Screenshot'],
  ];
  const lower = (name || '').toLowerCase();
  const hit = map.find(([key]) => lower.includes(key));
  if (hit) return { icon: hit[1], label: hit[2] };
  return { icon: 'file', label: name ? name.charAt(0).toUpperCase() + name.slice(1) : 'Anhang' };
}

function artifactLink(a) {
  const { icon: ic, label } = artifactInfo(a.name);
  const lower = (a.name || '').toLowerCase();
  let href = a.url;
  // trace.playwright.dev lädt Traces per URL. Der Server setzt dafür den CORS-Header.
  if (lower.includes('trace')) href = `https://trace.playwright.dev/?trace=${window.location.origin}${a.url}`;
  else if (lower.includes('error-context')) href = `/view-md?file=${encodeURIComponent(a.url)}`;
  return `<a class="artifact" href="${esc(href)}" target="_blank" rel="noopener">${icon(ic)}${esc(label)}</a>`;
}

const KIND_ICON = { failed: 'x', flaky: 'alert', skipped: 'skip', passed: 'check' };

function rowHtml(row, openByDefault) {
  const kind = statusKind(row);
  const title = row.title.charAt(0).toUpperCase() + row.title.slice(1);
  const repeat = row.repeatLabel ? ` · ${esc(row.repeatLabel)}` : '';
  let badge = '';
  if (row.retryCount > 0) {
    badge = row.flaky
      ? `<span class="badge badge-flaky" title="Erst beim ${row.retryCount}. Wiederholungsversuch bestanden">instabil · ${row.retryCount}× wiederholt</span>`
      : `<span class="badge badge-fail" title="Trotz Wiederholung fehlgeschlagen">${row.retryCount}× wiederholt</span>`;
  }
  let body = '';
  if (row.errorSummary) body += `<p class="err-summary">${esc(row.errorSummary)}</p>`;
  if (row.errorDetail && row.errorDetail !== row.errorSummary) body += `<pre class="err-detail">${esc(row.errorDetail)}</pre>`;
  if (row.skipReason) body += `<p class="skip-reason">${esc(row.skipReason)}</p>`;
  const arts = (row.attachments || []).filter((a) => a.url).map(artifactLink).join('');
  if (arts) body += `<div class="artifacts">${arts}</div>`;
  if (!body) body = `<p class="muted">Keine weiteren Details.</p>`;
  return `<details class="trow st-${kind}"${openByDefault ? ' open' : ''}>` +
    `<summary><span class="st-ico">${icon(KIND_ICON[kind])}</span>` +
    `<span class="trow-title"><span>${esc(title)}</span><small>${esc(row.file)}${repeat}</small></span>` +
    `${badge}<span class="trow-meta">${fmtDuration(row.durationMs)}</span>${icon('chevron', 'chev')}</summary>` +
    `<div class="trow-body">${body}</div></details>`;
}

function renderGroups(rows) {
  const el = $('#res-groups');
  if (!rows.length) {
    el.innerHTML = view.status === 'running' || !view.report
      ? ''
      : '<p class="muted">Keine Testergebnisse in diesem Lauf.</p>';
    return;
  }
  const failedTotal = rows.filter((r) => statusKind(r) === 'failed').length;
  const shown = view.filter === 'all' ? rows : rows.filter((r) => statusKind(r) === view.filter);
  if (!shown.length) { el.innerHTML = '<p class="muted">Keine Tests in dieser Ansicht.</p>'; return; }
  el.innerHTML = groupRows(shown).map((g) => {
    const bits = [];
    if (g.counts.failed) bits.push(`${g.counts.failed} fehlgeschlagen`);
    if (g.counts.flaky) bits.push(`${g.counts.flaky} instabil`);
    if (g.counts.skipped) bits.push(`${g.counts.skipped} übersprungen`);
    return `<section class="rgroup"><div class="rgroup-head"><h3>${esc(g.label)}</h3>` +
      `<span class="muted">${g.rows.length} ${g.rows.length === 1 ? 'Test' : 'Tests'}${bits.length ? ' · ' + bits.join(' · ') : ''}</span></div>` +
      g.rows.map((r) => rowHtml(r, statusKind(r) === 'failed' && failedTotal <= 3)).join('') + '</section>';
  }).join('');
}

// ---------------------------------------------------------------------------
// Capture-Lauf (Referenz-Fixtures der Komponenten-Dialoge)
// ---------------------------------------------------------------------------
async function runCapture() {
  const res = await startRunRequest({
    ...baseRunFields(),
    environment: currentEnvironment(),
    files: ['tests/components/dialog-capture.spec.ts'],
    projects: ['chromium'],
    captureDialogs: true,
  });
  if (!res.ok) toast(res.error, 'error');
}

export function init() {
  $('#res-title').setAttribute('aria-live', 'polite');
  $('#res-filters').addEventListener('click', (e) => {
    const btn = e.target.closest('.filter');
    if (!btn || btn.disabled) return;
    view.filter = view.filter === btn.dataset.kind ? 'all' : btn.dataset.kind;
    renderFilters(view.report?.rows || []);
    renderGroups(view.report?.rows || []);
  });
  $('#res-cancel').addEventListener('click', cancelRun);
  $('#run-capture').addEventListener('click', runCapture);
  render();
}
