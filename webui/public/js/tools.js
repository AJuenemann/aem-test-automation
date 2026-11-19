// Reiter „Werkzeuge": Testseiten aufräumen, Referenzbilder vergleichen, UI-Mode.
import {
  $, $$, state, esc, api, on, toast, confirmDialog, currentEnvironment, apiError, envLabel,
} from './core.js';
import { t, tn } from './i18n.js';
import { collectSelection } from './testrun.js';

// ---------------------------------------------------------------------------
// Aufräumen
// ---------------------------------------------------------------------------
/**
 * Zustand der Aufräum-Anzeige. Die Anzeige wird daraus gezeichnet und bei einem
 * Sprachwechsel neu gezeichnet: idle | searching | error | result.
 */
let cleanup = { kind: 'idle', data: null };

/** Hinweis der API in der aktiven Sprache; ohne bekannten Code gilt der Text des Servers. */
function noteText(note, fallback) {
  if (!note) return fallback;
  if (note.code === 'cleanup.unreadable') return t('warn.unreadable', note.params);
  if (note.code === 'cleanup.notSearched') return t('warn.notSearched', note.params);
  if (note.code === 'env.unknown' || note.code === 'access.incomplete') {
    return t('warn.notSearched', { message: t(`err.${note.code}`, note.params) });
  }
  return fallback;
}

function renderCleanup() {
  const result = $('#cleanup-result');
  // Abgewählte Einträge merken: Das Neuzeichnen darf die Auswahl nicht zurücksetzen.
  const unchecked = new Set($$('.cleanup-cb').filter((cb) => !cb.checked).map((cb) => `${cb.dataset.env}|${cb.value}`));
  $('#cleanup-delete').hidden = true;
  if (cleanup.kind === 'idle') { result.innerHTML = ''; return; }
  if (cleanup.kind === 'searching') {
    result.innerHTML = `<p class="hint">${esc(t('cleanup.searching'))}</p>`;
    return;
  }
  if (cleanup.kind === 'error') {
    result.innerHTML = `<p class="hint">${esc(t('cleanup.error', { message: apiError(cleanup.data, t('cleanup.unknown')) }))}</p>`;
    return;
  }
  const data = cleanup.data;
  result.innerHTML = '';
  let total = 0;
  for (const env of data.environments) {
    const label = envLabel(env);
    result.insertAdjacentHTML('beforeend',
      `<p class="cleanup-env">${esc(env.pages.length ? tn('cleanup.env.pages', env.pages.length, { label }) : t('cleanup.env.none', { label }))}</p>`);
    (env.warnings || []).forEach((w, i) => {
      const message = noteText(env.warningNotes?.[i], w);
      result.insertAdjacentHTML('beforeend', `<p class="hint">${esc(t('cleanup.warning', { message }))}</p>`);
    });
    if (!env.pages.length) continue;
    total += env.pages.length;
    const ul = document.createElement('ul');
    ul.className = 'cleanup-list';
    for (const name of env.pages) {
      const li = document.createElement('li');
      const checked = unchecked.has(`${env.id}|${name}`) ? '' : ' checked';
      li.innerHTML = `<label><input type="checkbox" class="cleanup-cb"${checked} data-env="${esc(env.id)}" data-env-label="${esc(label)}" value="${esc(name)}"><span>${esc(name)}</span></label>`;
      ul.appendChild(li);
    }
    result.appendChild(ul);
  }
  const where = data.playgrounds.join(', ');
  result.insertAdjacentHTML('beforeend', `<p class="hint">${esc(total ? t('cleanup.found', { where }) : t('cleanup.nothing', { where }))}</p>`);
  $('#cleanup-delete').hidden = total === 0;
}

async function cleanupScan() {
  cleanup = { kind: 'searching', data: null };
  renderCleanup();
  const r = await api('/api/cleanup/list');
  cleanup = r.ok ? { kind: 'result', data: r.data } : { kind: 'error', data: r.data };
  renderCleanup();
}

async function cleanupDelete() {
  const checked = $$('.cleanup-cb').filter((cb) => cb.checked);
  if (!checked.length) return;
  const perEnv = new Map();
  for (const cb of checked) perEnv.set(cb.dataset.envLabel, (perEnv.get(cb.dataset.envLabel) ?? 0) + 1);
  const where = [...perEnv].map(([label, n]) => t('cleanup.dialog.where', { n, label })).join(', ');
  const ok = await confirmDialog({
    title: t('cleanup.dialog.title'),
    message: t('cleanup.dialog.message', { where }),
    detail: t('cleanup.dialog.detail'),
    confirmLabel: t('cleanup.dialog.confirm'),
    danger: true,
  });
  if (!ok) return;
  const btn = $('#cleanup-delete');
  btn.disabled = true;
  const r = await api('/api/cleanup/delete', {
    items: checked.map((cb) => ({ env: cb.dataset.env, path: cb.value })),
  });
  btn.disabled = false;
  if (!r.ok) {
    toast(t('cleanup.toast.error', { message: apiError(r.data, t('cleanup.unknown')) }), 'error');
    return;
  }
  const done = r.data.results.filter((x) => x.ok).length;
  const failed = r.data.results.length - done;
  await cleanupScan(); // Liste aktuell halten
  toast(failed ? t('cleanup.toast.doneFailed', { n: done, failed }) : t('cleanup.toast.done', { n: done }), failed ? 'error' : 'success');
}

// ---------------------------------------------------------------------------
// Baselines
// ---------------------------------------------------------------------------
let baselinesReady = false;

async function loadBaselines() {
  const r = await api('/api/baselines');
  const envs = r.data.environments || [];
  state.baselines = r.data.entries || [];
  const selA = $('#base-a');
  const selB = $('#base-b');
  for (const sel of [selA, selB]) {
    sel.innerHTML = envs.map((e) => `<option value="${esc(e)}">${esc(e)}</option>`).join('');
  }
  if (envs.length >= 2) { selA.value = envs[0]; selB.value = envs[1]; }
  $('#baseline-note').hidden = envs.length >= 2 || state.baselines.length === 0;
  const render = () => renderBaselines(selA.value, selB.value);
  selA.onchange = render;
  selB.onchange = render;
  baselinesReady = true;
  render();
}

function renderBaselines(envA, envB) {
  const el = $('#baselines');
  const entries = state.baselines || [];
  if (!entries.length) {
    el.innerHTML = `<p class="hint">${esc(t('base.empty'))}</p>`;
    return;
  }
  el.innerHTML = '';
  for (const entry of entries) {
    const pair = document.createElement('div');
    pair.className = 'pair';
    pair.insertAdjacentHTML('beforeend', `<h4>${esc(entry.key)}</h4>`);
    const imgs = document.createElement('div');
    imgs.className = 'imgs';
    for (const env of [envA, envB]) {
      const fig = document.createElement('figure');
      fig.insertAdjacentHTML('beforeend', `<figcaption>${esc(env)}</figcaption>`);
      const url = entry.perEnv[env];
      if (url) {
        const img = document.createElement('img');
        img.loading = 'lazy';
        img.src = url;
        img.alt = t('base.alt', { key: entry.key, env });
        img.title = t('base.zoom');
        img.addEventListener('click', () => openLightbox(url, `${entry.key} · ${env}`));
        fig.appendChild(img);
      } else {
        fig.insertAdjacentHTML('beforeend', `<div class="missing">${esc(t('base.missing'))}</div>`);
      }
      imgs.appendChild(fig);
    }
    pair.appendChild(imgs);
    el.appendChild(pair);
  }
}

function openLightbox(url, caption) {
  const box = $('#lightbox');
  $('img', box).src = url;
  $('img', box).alt = caption;
  $('figcaption', box).textContent = caption;
  box.showModal();
}

// ---------------------------------------------------------------------------
// Playwright UI-Mode
// ---------------------------------------------------------------------------
// Übernimmt Umgebung, Projekte und grep-Filter. Die Datei/Zeile-Testauswahl kann
// --ui nicht vorfiltern und wird bewusst nicht übergeben.
/** Anzeige des UI-Mode-Starts (wird bei Sprachwechsel neu gezeichnet): null | { kind, ... }. */
let uiMode = null;

function renderUiMode() {
  const out = $('#uimode-result');
  if (!uiMode) { out.textContent = ''; return; }
  if (uiMode.kind === 'starting') out.textContent = t('uimode.starting');
  else if (uiMode.kind === 'failed') out.textContent = apiError(uiMode.data, t('uimode.failed'));
  else {
    const hints = [];
    if (uiMode.projects.length) hints.push(t('uimode.hint.projects', { projects: uiMode.projects.join(', ') }));
    if (uiMode.grep) hints.push(t('uimode.hint.filter', { grep: uiMode.grep }));
    out.textContent = hints.length ? t('uimode.started.hints', { hints: hints.join(' · ') }) : t('uimode.started');
  }
}

async function openUiMode() {
  const { projects } = collectSelection();
  const grep = state.options.grep || undefined;
  uiMode = { kind: 'starting' };
  renderUiMode();
  const r = await api('/api/run', { uiMode: true, environment: currentEnvironment(), projects, grep });
  uiMode = r.ok ? { kind: 'started', projects, grep } : { kind: 'failed', data: r.data };
  renderUiMode();
}

/** UI-Mode braucht eine Umgebung (die Aufräum-Suche nicht: sie durchsucht alle). */
function updateUiModeAvailability() {
  const btn = $('#open-uimode');
  btn.disabled = !currentEnvironment();
  btn.title = btn.disabled ? t('uimode.needEnv') : '';
}

export function init() {
  on('env-change', updateUiModeAvailability);
  on('lang-change', () => {
    updateUiModeAvailability();
    renderCleanup();
    renderUiMode();
    if (baselinesReady) renderBaselines($('#base-a').value, $('#base-b').value);
  });
  updateUiModeAvailability();
  $('#cleanup-scan').addEventListener('click', cleanupScan);
  $('#cleanup-delete').addEventListener('click', cleanupDelete);
  $('#open-uimode').addEventListener('click', openUiMode);
}

/** Beim Öffnen des Reiters aufrufen: lädt die (schwere) Baseline-Liste erst dann. */
let baselinesLoaded = false;
export function onShow() {
  if (baselinesLoaded) return;
  baselinesLoaded = true;
  loadBaselines().catch(() => { baselinesLoaded = false; });
}
