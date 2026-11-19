// Frühere Läufe: gruppiert nach Monat und Tag, Mehrfachauswahl, Neu starten, Löschen.
import {
  $, $$, state, esc, icon, api, on, toast, confirmDialog, baseRunFields,
} from './core.js';
import { t, tn, hasKey, locale } from './i18n.js';

import {
  fmtSize, groupRunsByMonthDay, runAreaLabel, runHeadline, runSelectionLabel, runSettingsLabel,
} from './logic.js';
import { showRun, startRunRequest } from './results.js';
import { fileToGroupMap } from './testrun.js';

const statusText = (status) => (hasKey(`status.${status}`) ? t(`status.${status}`) : status || '');

let shownRunId = null;
let totalSizeBytes = 0;

export async function loadHistory() {
  const r = await api('/api/runs');
  state.runs = r.data.runs || [];
  totalSizeBytes = r.data.totalSizeBytes || 0;
  renderList();
}

function renderList() {
  const el = $('#history');
  if (!state.runs.length) {
    el.innerHTML = `<p class="muted">${esc(t('history.empty'))}</p>`;
    return;
  }
  // Auswahl und aufgeklappte Monate überleben das Neuzeichnen (z. B. beim Sprachwechsel).
  const checkedIds = new Set(checkedBoxes().map((cb) => cb.dataset.id));
  const openMonths = $$('.runs-month').map((m) => m.open);
  el.innerHTML = '';
  el.appendChild(renderHistory(state.runs, totalSizeBytes));
  $$('.runs-month').forEach((m, i) => { if (i < openMonths.length) m.open = openMonths[i]; });
  $$('.run-cb').forEach((cb) => { cb.checked = checkedIds.has(cb.dataset.id); });
  syncGroups();
  updateActions();
}

function renderHistory(runs, totalSizeBytes) {
  const wrap = document.createElement('div');
  wrap.insertAdjacentHTML('beforeend',
    `<div class="runs-toolbar">` +
    `<button type="button" id="runs-rerun" class="btn btn-sm" disabled>${esc(t('history.rerun'))}</button>` +
    `<button type="button" id="runs-delete" class="btn btn-sm btn-danger" disabled>${esc(t('history.delete'))}</button>` +
    `<span class="runs-total">${esc(tn('history.total', runs.length, { size: fmtSize(totalSizeBytes) }))}</span></div>`);
  $('#runs-rerun', wrap).addEventListener('click', rerunSelected);
  $('#runs-delete', wrap).addEventListener('click', deleteSelected);

  for (const month of groupRunsByMonthDay(runs)) {
    const det = document.createElement('details');
    det.className = 'runs-month';
    det.open = month.open;
    const sum = document.createElement('summary');
    sum.append(groupCheckbox(t('history.month.aria', { label: month.label }), det));
    sum.insertAdjacentHTML('beforeend', `<span class="grp-label">${esc(month.label)}</span><span class="muted">${month.runs.length}</span>`);
    det.appendChild(sum);
    for (const day of month.days) {
      const dayEl = document.createElement('div');
      const head = document.createElement('div');
      head.className = 'runs-day-head';
      head.append(groupCheckbox(t('history.day.aria', { label: day.label }), dayEl));
      head.insertAdjacentHTML('beforeend', `<span class="grp-label">${esc(day.label)}</span>`);
      dayEl.appendChild(head);
      const ul = document.createElement('ul');
      ul.className = 'runs-list';
      for (const run of day.runs) ul.appendChild(renderRun(run));
      dayEl.appendChild(ul);
      det.appendChild(dayEl);
    }
    wrap.appendChild(det);
  }
  return wrap;
}

function groupCheckbox(label, scope) {
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'grp-cb';
  cb.setAttribute('aria-label', label);
  cb.addEventListener('click', (e) => e.stopPropagation());
  cb.addEventListener('change', () => {
    $$('.run-cb, .grp-cb', scope).forEach((c) => { if (c !== cb) c.checked = cb.checked; });
    syncGroups();
    updateActions();
  });
  return cb;
}

/** Gruppenhäkchen spiegeln den Zustand ihrer Läufe (voll, teilweise, leer). */
function syncGroups() {
  $$('.runs-month, .runs-month > div').forEach((scope) => {
    const head = scope.matches('.runs-month') ? $('summary .grp-cb', scope) : $('.runs-day-head .grp-cb', scope);
    const boxes = $$('.run-cb', scope);
    if (!head || !boxes.length) return;
    const n = boxes.filter((b) => b.checked).length;
    head.checked = n === boxes.length;
    head.indeterminate = n > 0 && n < boxes.length;
  });
}

const RUN_ICON = { passed: 'check', failed: 'x', cancelled: 'skip', running: 'activity' };

function renderRun(run) {
  const li = document.createElement('li');
  li.className = 'run-entry';
  if (run.id === shownRunId) li.classList.add('selected');
  const flaky = run.status === 'passed' && (run.summary?.flaky || 0) > 0;
  const kind = flaky ? 'flaky' : run.status;
  const time = new Date(run.startedAt).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  const env = (run.environment || '—').split(' ')[0];
  // Wie in der Detailansicht: Bereich als Überschrift, darunter die Kernaussage.
  const area = runAreaLabel(run, fileToGroupMap());
  const sel = area || runSelectionLabel(run);
  const files = runSelectionLabel(run);
  const headline = run.summary?.flaky
    ? t('history.flakyCount', { headline: runHeadline(run), n: run.summary.flaky })
    : runHeadline(run);
  const headKind = run.summary?.failed > 0 ? 'failed' : flaky ? 'flaky' : '';
  const settings = runSettingsLabel(run.settings);

  li.innerHTML =
    `<input type="checkbox" class="run-cb" data-id="${esc(run.id)}" data-size="${run.sizeBytes || 0}" aria-label="${esc(t('history.run.aria', { time }))}">` +
    `<span class="run-ico ${kind}" title="${esc(flaky ? t('history.flakyTitle') : statusText(run.status))}">${icon(flaky ? 'alert' : RUN_ICON[run.status] || 'skip')}</span>` +
    `<span class="run-sel" title="${esc(`${sel} · ${files}`)}"><span class="run-time">${esc(time)}</span> · ${esc(sel)}</span>` +
    `<a class="run-link" href="/report/${esc(run.id)}/" target="_blank" rel="noopener" aria-label="${esc(t('history.report.aria'))}">${esc(t('history.report'))}</a>` +
    `<span class="run-sub"><span class="run-head ${headKind}">${esc(headline)}</span> · ${esc(env)}${settings ? ' · ' + esc(settings) : ''} · ${fmtSize(run.sizeBytes).replace(' ', '\u00a0')}</span>`;

  $('.run-cb', li).addEventListener('click', (e) => e.stopPropagation());
  $('.run-cb', li).addEventListener('change', () => { syncGroups(); updateActions(); });
  $('.run-link', li).addEventListener('click', (e) => e.stopPropagation());
  li.addEventListener('click', () => {
    shownRunId = run.id;
    $$('.run-entry.selected').forEach((el) => el.classList.remove('selected'));
    li.classList.add('selected');
    showRun(run);
  });
  return li;
}

const checkedBoxes = () => $$('.run-cb').filter((cb) => cb.checked);

function rerunnable(run) {
  const o = run?.originalRequest;
  return !!o && ((o.tests?.length || 0) > 0 || (o.projects?.length || 0) > 0);
}

function updateActions() {
  const checked = checkedBoxes();
  const del = $('#runs-delete');
  const rerun = $('#runs-rerun');
  if (!del || !rerun) return;
  const size = checked.reduce((s, cb) => s + (Number(cb.dataset.size) || 0), 0);
  del.disabled = checked.length === 0;
  del.textContent = checked.length ? t('history.delete.n', { n: checked.length, size: fmtSize(size) }) : t('history.delete');
  const withReq = checked.filter((cb) => rerunnable(state.runs.find((r) => r.id === cb.dataset.id)));
  rerun.disabled = withReq.length === 0;
  rerun.textContent = withReq.length ? t('history.rerun.n', { n: withReq.length }) : t('history.rerun');
  const missing = checked.length - withReq.length;
  rerun.title = missing > 0 ? t('history.rerun.skipped', { n: missing }) : '';
}

async function deleteSelected() {
  const ids = checkedBoxes().map((cb) => cb.dataset.id);
  if (!ids.length) return;
  const ok = await confirmDialog({
    title: t('history.dialog.title'),
    message: tn('history.dialog.message', ids.length),
    detail: t('history.dialog.detail'),
    confirmLabel: t('history.dialog.confirm'),
    danger: true,
  });
  if (!ok) return;
  const r = await api('/api/runs/delete', { ids });
  const failed = (r.data.results || []).filter((x) => !x.ok).length;
  if (!r.ok || failed) toast(t('history.error.delete', { n: failed || ids.length }), 'error');
  await loadHistory();
}

/** Startet einen neuen Lauf mit den Tests der gewählten Läufe. */
async function rerunSelected() {
  const runs = checkedBoxes().map((cb) => state.runs.find((r) => r.id === cb.dataset.id)).filter(rerunnable);
  const seen = new Set();
  const tests = [];
  for (const run of runs) {
    for (const t of run.originalRequest.tests || []) {
      const key = `${t.file}:${t.line}:${t.title}`;
      if (!seen.has(key)) { seen.add(key); tests.push(t); }
    }
  }
  const projects = [...new Set(runs.flatMap((r) => r.originalRequest.projects || []))];
  // grep nur übernehmen, wenn genau ein Lauf einen hat.
  const greps = runs.map((r) => r.originalRequest.grep).filter(Boolean);
  const res = await startRunRequest({
    ...baseRunFields(),
    tests: tests.length ? tests : undefined,
    projects: projects.length ? projects : undefined,
    grep: greps.length === 1 ? greps[0] : undefined,
  });
  if (!res.ok) toast(res.error, 'error');
}

export function init() {
  on('run-done', () => loadHistory().catch(() => {}));
  on('lang-change', renderList);
  // Der Katalog kommt oft nach der Historie: Bereiche erst dann auflösen.
  on('catalog-loaded', renderList);
  loadHistory().catch(() => {});
}
