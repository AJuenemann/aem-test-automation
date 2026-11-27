// Reiter „Ergebnisse": Lauf starten, Live-Stream, Kernaussage, Filter, Ergebnisliste.
import {
  $, $$, state, esc, icon, api, emit, on, toast, baseRunFields, currentEnvironment, apiError, envShort, contentLangAttr, testTitle,
} from './core.js';
import { t, tn, hasKey, locale, getLang } from './i18n.js';
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
  /** Schlüssel des Hinweises (Wörterbuch), damit er beim Sprachwechsel mitwechselt. */
  noticeKey: '',
  /** Blocker-Hinweis: { text, info } (info = maschinenlesbar vom Server, text = deutscher Fallback). */
  blocker: null,
};
/** Der laufende Lauf, unabhängig davon, welcher Lauf gerade angezeigt wird. */
const active = { id: null, startedAt: null, envLabel: '', settings: null };
/** true: die Ansicht zeigt den laufenden Lauf. */
const viewingActive = () => !!active.id && view.runId === active.id;
let es = null;
let ticker = null;
let lastLogAt = 0;

const shortEnv = envShort;

// ---------------------------------------------------------------------------
// Lauf starten / abbrechen / streamen
// ---------------------------------------------------------------------------
/** Startet einen Lauf und wechselt zur Ergebnisansicht. { ok, error? } */
export async function startRunRequest(req) {
  if (!req.environment) return { ok: false, error: t('run.error.noEnv') };
  const r = await api('/api/run', req);
  if (!r.ok) return { ok: false, error: apiError(r.data, t('run.error.start')) };
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
  view.noticeKey = 'res.notice.reloaded';
  render();
  stream(d.activeRunId, d.startedAt);
  return true;
}

function beginView(id, { envLabel = '', startedAt = null, settings = null } = {}) {
  active.id = id;
  active.startedAt = startedAt ? new Date(startedAt).getTime() : Date.now();
  active.envLabel = envLabel;
  active.settings = settings
    ? { headed: !!settings.headed, slowMo: settings.slowMo, repeatEach: settings.repeatEach, smokeGate: !!settings.smokeGate, updateSnapshots: !!settings.updateSnapshots }
    : null;
  state.activeRunId = id;
  $('#log').textContent = '';
  $('#res-log').open = true;
  showActive();
  emit('run-started', { id });
}

/** Zeigt den laufenden Lauf (Log bleibt erhalten). */
function showActive() {
  view.runId = active.id;
  view.status = 'running';
  view.startedAt = active.startedAt;
  view.envLabel = active.envLabel;
  view.settings = active.settings;
  view.report = null;
  view.filter = 'all';
  view.live = true;
  view.noticeKey = '';
  view.blocker = null;
  render();
  emit('run-view', { id: active.id });
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
    const status = info.status === 'passed' ? 'passed' : info.status === 'cancelled' ? 'cancelled' : 'failed';
    const shown = viewingActive();
    active.id = null;
    state.activeRunId = null;
    if (shown) {
      view.status = status;
      const rep = await loadReport(id);
      if (view.runId === id) {
        if (info.blocker) showBlocker(info.blocker, info.blockerInfo);
        else if (rep?.blocker) showBlocker(rep.blocker, rep.blockerInfo);
        if (rep) $('#res-log').open = false;
        render();
      }
    } else {
      // Angezeigt wird ein früherer Lauf: die Ansicht bleibt, nur Kopfzeile und Historie wechseln.
      render();
      emit('run-state', { running: false, status, elapsed: '' });
      toast(t('res.toast.runDone'), 'info');
    }
    emit('run-done', { id, status });
  });
  es.onerror = () => {
    // Nach 'done' ist es normaler Verbindungsschluss: keine Meldung.
    if (!es) return;
    es.close();
    es = null;
    stopTicker();
    const shown = viewingActive();
    active.id = null;
    state.activeRunId = null;
    if (shown) {
      view.status = 'failed';
      view.noticeKey = 'res.notice.lost';
    } else {
      toast(t('res.notice.lost'), 'error');
    }
    render();
    if (!shown) emit('run-state', { running: false, status: 'failed', elapsed: '' });
  };
}

export async function cancelRun() {
  if (!state.activeRunId) return;
  await api(`/api/run/${state.activeRunId}/cancel`, {});
  view.noticeKey = 'res.notice.cancelRequested';
  render();
}

function startTicker() {
  stopTicker();
  const tick = () => {
    const now = Date.now();
    if (viewingActive()) $('#res-meta').textContent = metaText(now);
    emit('run-state', { running: true, status: 'running', elapsed: fmtClock(now - active.startedAt) });
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
  const rep = r.ok ? r.data : null;
  // Nur in die Ansicht schreiben, wenn sie noch diesen Lauf zeigt.
  if (view.runId === id) view.report = rep;
  return rep;
}

/** Zeigt einen früheren Lauf aus der Historie. */
export async function showRun(run) {
  if (active.id && run.id === active.id) {
    showActive();
  } else {
    await showPastRun(run);
  }
  if (location.hash !== '#/ergebnisse') location.hash = '#/ergebnisse';
  $('#res-title').focus({ preventScroll: true });
}

async function showPastRun(run) {
  // Der laufende Lauf läuft im Hintergrund weiter (Stream und Ticker bleiben).
  view.runId = run.id;
  view.status = run.status === 'running' ? 'running' : run.status || 'idle';
  view.startedAt = new Date(run.startedAt).getTime();
  view.envLabel = shortEnv(run.environment);
  view.settings = run.settings || null;
  view.live = false;
  view.filter = 'all';
  view.noticeKey = '';
  view.blocker = null;
  view.report = null;
  const rep = await loadReport(run.id);
  if (view.runId !== run.id) return; // inzwischen ein anderer Lauf gewählt
  if (!rep) view.noticeKey = 'res.notice.noTable';
  else if (rep.blocker) showBlocker(rep.blocker, rep.blockerInfo);
  render();
  emit('run-view', { id: run.id });
}

function showBlocker(text, info) {
  view.blocker = { text, info };
  renderBlocker();
}

/** Blocker in der aktiven Sprache: per Code aus dem Wörterbuch, sonst der Text des Servers. */
function blockerMessage({ text, info }) {
  if (!info || !hasKey(`blocker.${info.code}`)) return text;
  const params = { ...info.params };
  if (info.code === 'network') params.hostPart = params.host ? ` (${params.host})` : '';
  return t(`blocker.${info.code}`, params);
}

function renderBlocker() {
  const el = $('#res-blocker');
  const show = view.blocker && view.status !== 'running';
  el.hidden = !show;
  el.textContent = show ? blockerMessage(view.blocker) : '';
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
    parts.push(t('res.meta.running', { time: fmtClock(now - view.startedAt) }));
    parts.push(t('res.meta.lastOutput', { time: fmtClock(now - lastLogAt) }));
  } else {
    parts.push(new Date(view.startedAt).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' }));
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
    ? t('res.title.running')
    : headline(s, view.status) || (view.status === 'failed' ? t('res.title.failed') : view.status === 'passed' ? t('res.title.passed') : t('res.title.done'));
  $('#res-meta').textContent = metaText();
  $('#res-progress').hidden = st !== 'running';
  $('#res-cancel').hidden = st !== 'running';
  $('#open-report').href = view.runId ? `/report/${view.runId}/` : '/report';

  const notice = $('#res-notice');
  const elsewhere = !!active.id && !viewingActive();
  notice.hidden = !view.noticeKey && !elsewhere;
  notice.innerHTML = [
    view.noticeKey ? esc(t(view.noticeKey)) : '',
    elsewhere ? `${esc(t('res.notice.activeElsewhere'))} <button type="button" class="btn btn-sm" id="res-back-active">${esc(t('res.notice.backToActive'))}</button>` : '',
  ].filter(Boolean).join(' ');
  renderBlocker();

  $('#res-log').hidden = !view.live;

  const rows = view.report?.rows || [];
  renderCapture(rows);
  renderFilters(rows);
  renderGroups(rows);

  // Während eines Laufs meldet der Ticker den Zustand, nicht der angezeigte Lauf.
  if (!active.id) emit('run-state', { running: st === 'running', status: st, elapsed: '' });
}

function renderCapture(rows) {
  const n = rows.filter((r) => r.status === 'skipped' && r.skipReason && /CAPTURE_DIALOGS/i.test(r.skipReason)).length;
  $('#res-capture').hidden = n === 0;
  $('#capture-count').textContent = String(n);
  $('#capture-label').textContent = tn('res.capture.label', n);
}

const FILTERS = ['all', 'failed', 'flaky', 'skipped', 'passed'];

function renderFilters(rows) {
  const el = $('#res-filters');
  el.hidden = rows.length === 0;
  if (!rows.length) return;
  const counts = { all: rows.length, failed: 0, flaky: 0, skipped: 0, passed: 0 };
  for (const r of rows) counts[statusKind(r)]++;
  el.innerHTML = FILTERS.map((kind) =>
    `<button type="button" class="filter" data-kind="${kind}" aria-pressed="${view.filter === kind}"${kind !== 'all' && counts[kind] === 0 ? ' disabled' : ''}>` +
    `${esc(t(`res.filter.${kind}`))} <span class="n">${counts[kind]}</span></button>`).join('');
}

function artifactInfo(name) {
  const map = [
    ['trace', 'activity', 'artifact.trace'],
    ['video', 'video', 'artifact.video'],
    ['error-context', 'file', 'artifact.error-context'],
    ['rendered-page-diff', 'compare', 'artifact.diff'],
    ['rendered-page-expected', 'image', 'artifact.expected'],
    ['rendered-page-actual', 'image', 'artifact.actual'],
    ['screenshot', 'image', 'artifact.screenshot'],
  ];
  const lower = (name || '').toLowerCase();
  const hit = map.find(([key]) => lower.includes(key));
  if (hit) return { icon: hit[1], label: t(hit[2]) };
  return { icon: 'file', label: name ? name.charAt(0).toUpperCase() + name.slice(1) : t('artifact.other') };
}

function artifactLink(a) {
  const { icon: ic, label } = artifactInfo(a.name);
  const lower = (a.name || '').toLowerCase();
  let href = a.url;
  // trace.playwright.dev lädt Traces per URL. Der Server setzt dafür den CORS-Header.
  if (lower.includes('trace')) href = `https://trace.playwright.dev/?trace=${window.location.origin}${a.url}`;
  else if (lower.includes('error-context')) href = `/view-md?file=${encodeURIComponent(a.url)}&lang=${getLang()}`;
  return `<a class="artifact" href="${esc(href)}" target="_blank" rel="noopener">${icon(ic)}${esc(label)}</a>`;
}

const KIND_ICON = { failed: 'x', flaky: 'alert', skipped: 'skip', passed: 'check' };

function rowHtml(row, openByDefault) {
  const kind = statusKind(row);
  const shown = testTitle(row);
  const title = shown.charAt(0).toUpperCase() + shown.slice(1);
  const repeatText = row.repeatIndex
    ? t('res.row.repeat', { i: row.repeatIndex, n: row.repeatTotal })
    : row.repeatLabel;
  const repeat = repeatText ? ` · ${esc(repeatText)}` : '';
  let badge = '';
  if (row.retryCount > 0) {
    const n = row.retryCount;
    badge = row.flaky
      ? `<span class="badge badge-flaky" title="${esc(t('res.row.flaky.title', { n }))}">${esc(t('res.row.flaky', { n }))}</span>`
      : `<span class="badge badge-fail" title="${esc(t('res.row.retried.title'))}">${esc(t('res.row.retried', { n }))}</span>`;
  }
  let body = '';
  const de = contentLangAttr();
  const deTitle = contentLangAttr(!!row.titleEn);
  if (row.errorSummary) body += `<p class="err-summary"${de}>${esc(row.errorSummary)}</p>`;
  if (row.errorDetail && row.errorDetail !== row.errorSummary) body += `<pre class="err-detail"${de}>${esc(row.errorDetail)}</pre>`;
  if (row.skipReason) body += `<p class="skip-reason"${de}>${esc(row.skipReason)}</p>`;
  const arts = (row.attachments || []).filter((a) => a.url).map(artifactLink).join('');
  if (arts) body += `<div class="artifacts">${arts}</div>`;
  if (!body) body = `<p class="muted">${esc(t('res.row.noDetails'))}</p>`;
  return `<details class="trow st-${kind}"${openByDefault ? ' open' : ''}>` +
    `<summary><span class="st-ico">${icon(KIND_ICON[kind])}</span>` +
    `<span class="trow-title"><span${deTitle}>${esc(title)}</span><small>${esc(row.file)}${repeat}</small></span>` +
    `${badge}<span class="trow-meta">${fmtDuration(row.durationMs)}</span>${icon('chevron', 'chev')}</summary>` +
    `<div class="trow-body">${body}</div></details>`;
}

function renderGroups(rows) {
  const el = $('#res-groups');
  if (!rows.length) {
    el.innerHTML = view.status === 'running' || !view.report
      ? ''
      : `<p class="muted">${esc(t('res.noResults'))}</p>`;
    return;
  }
  const failedTotal = rows.filter((r) => statusKind(r) === 'failed').length;
  const shown = view.filter === 'all' ? rows : rows.filter((r) => statusKind(r) === view.filter);
  if (!shown.length) { el.innerHTML = `<p class="muted">${esc(t('res.noInView'))}</p>`; return; }
  el.innerHTML = groupRows(shown).map((g) => {
    const bits = [];
    if (g.counts.failed) bits.push(t('res.group.failed', { n: g.counts.failed }));
    if (g.counts.flaky) bits.push(t('res.group.flaky', { n: g.counts.flaky }));
    if (g.counts.skipped) bits.push(t('res.group.skipped', { n: g.counts.skipped }));
    return `<section class="rgroup"><div class="rgroup-head"><h3>${esc(g.label)}</h3>` +
      `<span class="muted">${esc(tn('count.tests', g.rows.length))}${bits.length ? ' · ' + esc(bits.join(' · ')) : ''}</span></div>` +
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
  $('#res-notice').addEventListener('click', (e) => {
    if (!e.target.closest('#res-back-active') || !active.id) return;
    showActive();
    $('#res-title').focus({ preventScroll: true });
  });
  $('#run-capture').addEventListener('click', runCapture);
  on('lang-change', render);
  render();
}
