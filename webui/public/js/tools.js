// Reiter „Werkzeuge": Testseiten aufräumen, Referenzbilder vergleichen, UI-Mode.
import {
  $, $$, state, esc, api, on, toast, confirmDialog, currentEnvironment,
} from './core.js';
import { collectSelection } from './testrun.js';

// ---------------------------------------------------------------------------
// Aufräumen
// ---------------------------------------------------------------------------
async function cleanupScan() {
  const result = $('#cleanup-result');
  $('#cleanup-delete').hidden = true;
  result.innerHTML = '<p class="hint">Suche auf allen Umgebungen…</p>';
  const r = await api('/api/cleanup/list');
  if (!r.ok) {
    result.innerHTML = `<p class="hint">Fehler: ${esc(r.data.error || 'unbekannt')}</p>`;
    return;
  }
  result.innerHTML = '';
  let total = 0;
  for (const env of r.data.environments) {
    result.insertAdjacentHTML('beforeend',
      `<p class="cleanup-env">${esc(env.label)}: ${env.pages.length ? `${env.pages.length} Testseite(n)` : 'keine Testseiten'}</p>`);
    for (const w of env.warnings || []) result.insertAdjacentHTML('beforeend', `<p class="hint">Hinweis: ${esc(w)}</p>`);
    if (!env.pages.length) continue;
    total += env.pages.length;
    const ul = document.createElement('ul');
    ul.className = 'cleanup-list';
    for (const name of env.pages) {
      const li = document.createElement('li');
      li.innerHTML = `<label><input type="checkbox" class="cleanup-cb" checked data-env="${esc(env.id)}" data-env-label="${esc(env.label)}" value="${esc(name)}"><span>${esc(name)}</span></label>`;
      ul.appendChild(li);
    }
    result.appendChild(ul);
  }
  const where = r.data.playgrounds.join(', ');
  result.insertAdjacentHTML('beforeend', `<p class="hint">${total ? `Gesucht unter ${esc(where)}.` : `Keine Testseiten unter ${esc(where)} gefunden. Nichts aufzuräumen.`}</p>`);
  $('#cleanup-delete').hidden = total === 0;
}

async function cleanupDelete() {
  const checked = $$('.cleanup-cb').filter((cb) => cb.checked);
  if (!checked.length) return;
  const perEnv = new Map();
  for (const cb of checked) perEnv.set(cb.dataset.envLabel, (perEnv.get(cb.dataset.envLabel) ?? 0) + 1);
  const where = [...perEnv].map(([label, n]) => `${n} auf ${label}`).join(', ');
  const ok = await confirmDialog({
    title: 'Testseiten löschen',
    message: `Testseiten endgültig löschen: ${where}?`,
    detail: 'Gelöscht werden nur Einträge nach dem Testschema direkt unter den Spielwiesen.',
    confirmLabel: 'Endgültig löschen',
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
    toast(`Löschen fehlgeschlagen: ${r.data.error || 'unbekannt'}`, 'error');
    return;
  }
  const done = r.data.results.filter((x) => x.ok).length;
  const failed = r.data.results.length - done;
  await cleanupScan(); // Liste aktuell halten
  toast(`${done} gelöscht${failed ? `, ${failed} fehlgeschlagen` : ''}.`, failed ? 'error' : 'success');
}

// ---------------------------------------------------------------------------
// Baselines
// ---------------------------------------------------------------------------
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
  render();
}

function renderBaselines(envA, envB) {
  const el = $('#baselines');
  const entries = state.baselines || [];
  if (!entries.length) {
    el.innerHTML = '<p class="hint">Keine Baselines gefunden. Zuerst „Baselines aktualisieren" ausführen.</p>';
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
        img.alt = `${entry.key} in ${env}`;
        img.title = 'Zum Vergrößern klicken';
        img.addEventListener('click', () => openLightbox(url, `${entry.key} · ${env}`));
        fig.appendChild(img);
      } else {
        fig.insertAdjacentHTML('beforeend', '<div class="missing">keine Baseline</div>');
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
async function openUiMode() {
  const { projects } = collectSelection();
  const grep = state.options.grep || undefined;
  const out = $('#uimode-result');
  out.textContent = 'Starte…';
  const r = await api('/api/run', { uiMode: true, environment: currentEnvironment(), projects, grep });
  if (!r.ok) {
    out.textContent = r.data.error || 'UI-Mode konnte nicht gestartet werden.';
    return;
  }
  const hints = [];
  if (projects.length) hints.push(`Projekte: ${projects.join(', ')}`);
  if (grep) hints.push(`Filter: ${grep}`);
  out.textContent = `Gestartet in einem eigenen Fenster.${hints.length ? ` Übernommen: ${hints.join(' · ')}.` : ''}`;
}

/** UI-Mode braucht eine Umgebung (die Aufräum-Suche nicht: sie durchsucht alle). */
function updateUiModeAvailability() {
  const btn = $('#open-uimode');
  btn.disabled = !currentEnvironment();
  btn.title = btn.disabled ? 'Zuerst unter „Testlauf" eine Umgebung wählen.' : '';
}

export function init() {
  on('env-change', updateUiModeAvailability);
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

