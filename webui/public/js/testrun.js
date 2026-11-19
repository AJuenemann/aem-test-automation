// Reiter „Testlauf": Schritte (Tests, Umgebung, Ausführung) und Start-Leiste.
import {
  $, $$, state, esc, icon, api, on, toast, savePrefs, currentEnvironment, baseRunFields,
} from './core.js';
import {
  testKey, isTestAllowed, isUnitOnly, testMatches,
} from './logic.js';
import { startRunRequest, cancelRun } from './results.js';

let running = false;
const closedInAllMode = new Set();
/** Aufgeklappte Kategorien: überleben das Neuzeichnen (z. B. nach Umgebungswechsel). */
const openGroups = new Set();

const envShort = (label) => (label || '').split(' (')[0];

// ---------------------------------------------------------------------------
// Laden
// ---------------------------------------------------------------------------
export async function loadCatalog(refresh = false) {
  $('#catalog').textContent = 'Lade Tests…';
  const r = await api(`/api/tests${refresh ? '?refresh=1' : ''}`);
  if (!r.ok) {
    $('#catalog').textContent = 'Tests konnten nicht geladen werden.';
    return;
  }
  state.catalog = r.data;
  renderCatalog();
  afterSelectionChange();
}

export async function loadEnvironments() {
  const r = await api('/api/environments');
  state.environments = r.data.environments || [];
  if (state.environments.length) state.selectedEnvId = state.environments[0].id;
  if (state._prefEnv && state.environments.some((e) => e.id === state._prefEnv)) {
    state.selectedEnvId = state._prefEnv;
  }
  renderEnvCards();
}

// ---------------------------------------------------------------------------
// Auswahl (Zustand -> Lauf-Anforderung)
// ---------------------------------------------------------------------------
/** Alle Tests des Katalogs als flache Liste, unabhängig vom Suchfilter. */
export function allCatalogTests() {
  const out = [];
  for (const group of state.catalog.groups || []) {
    for (const file of group.files) {
      for (const test of file.tests) out.push({ test, file, group });
    }
  }
  return out;
}

export function collectSelection() {
  const tests = [];
  const projectSet = new Set();
  for (const { test } of allCatalogTests()) {
    if (state.selectedKeys.has(testKey(test.file, test.line, test.title))) {
      // Titel mitgeben: der Server grenzt datengetriebene Geschwister per --grep ein.
      tests.push({ file: test.file, line: test.line, title: test.title });
      (test.projects || []).forEach((p) => projectSet.add(p));
    }
  }
  return { tests, projects: [...projectSet] };
}

export function buildRequest() {
  const { tests, projects } = collectSelection();
  return {
    ...baseRunFields(),
    tests,
    projects,
    grep: state.options.grep || undefined,
    repeatEach: state.options.repeatEach,
  };
}

const allowedHere = (test) => isTestAllowed(test, currentEnvironment());

// ---------------------------------------------------------------------------
// Katalog
// ---------------------------------------------------------------------------
function renderCatalog() {
  const root = $('#catalog');
  root.innerHTML = '';
  const groups = state.catalog.groups || [];
  if (!groups.length) { root.textContent = 'Keine Tests gefunden.'; return; }
  const term = state.searchTerm.trim().toLowerCase();
  let shown = 0;
  for (const group of groups) {
    const el = renderGroup(group, term);
    if (el) { root.appendChild(el); shown++; }
  }
  if (!shown) root.textContent = `Kein Test passt zu „${state.searchTerm}".`;
}

function renderGroup(group, term) {
  const matched = group.files
    .map((file) => ({ file, tests: file.tests.filter((t) => testMatches(t, file, group, term)) }))
    .filter((m) => m.tests.length > 0);
  const count = matched.reduce((n, m) => n + m.tests.length, 0);
  if (!count) return null;

  const section = document.createElement('details');
  section.className = 'cat-group';
  // Bei Suche aufgeklappt (Treffer zeigen), sonst wie vom Nutzer zuletzt gewählt.
  section.open = term.length > 0 || openGroups.has(group.label);
  section.addEventListener('toggle', () => {
    if (term.length > 0) return;
    if (section.open) openGroups.add(group.label); else openGroups.delete(group.label);
    updateStartbar();
  });

  const head = document.createElement('summary');
  head.className = 'cat-head';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'cat-cb';
  cb.setAttribute('aria-label', `Ganze Kategorie „${group.label}" wählen`);
  cb.addEventListener('click', (e) => e.stopPropagation());
  cb.addEventListener('change', () => {
    // Nicht verfügbare Tests (andere Umgebung) nicht mitwählen.
    $$('.test-cb', section).forEach((t) => { if (!t.disabled) t.checked = cb.checked; });
    onCheckboxChange();
  });
  head.append(cb);
  head.insertAdjacentHTML('beforeend',
    `<span class="cat-title">${esc(group.label)}</span><span class="cat-count">${count}</span>` +
    (group.description ? `<span class="cat-desc">${esc(group.description)}</span>` : ''));
  section.appendChild(head);

  const ul = document.createElement('ul');
  ul.className = 'test-list';
  for (const m of matched) for (const test of m.tests) ul.appendChild(renderTestRow(test, m.file));
  section.appendChild(ul);
  return section;
}

function renderTestRow(test, file) {
  const li = document.createElement('li');
  const lbl = document.createElement('label');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'test-cb';
  cb.dataset.file = test.file;
  cb.dataset.line = String(test.line);
  cb.dataset.title = test.title;

  const allowed = allowedHere(test);
  const reason = `In der gewählten Umgebung (${envShort(currentEnvironment()?.label) || 'dieser'}) nicht verfügbar.`;
  if (!allowed) {
    li.classList.add('disabled');
    cb.disabled = true;
    li.title = reason;
  } else {
    cb.checked = state.selectedKeys.has(testKey(test.file, test.line, test.title));
  }
  cb.addEventListener('change', onCheckboxChange);

  const name = document.createElement('span');
  name.className = 'test-name';
  name.textContent = test.title;
  name.title = allowed ? test.title : reason;
  const origin = document.createElement('span');
  origin.className = 'test-origin';
  origin.textContent = file.label;
  lbl.append(cb, name);
  if (!allowed) lbl.insertAdjacentHTML('beforeend', icon('lock', 'lock'));
  lbl.append(origin);
  li.appendChild(lbl);
  return li;
}

/** Sichtbare Häkchen in den Zustand spiegeln. Ausgeblendete (gefilterte) bleiben erhalten. */
function onCheckboxChange() {
  $$('.test-cb').forEach((cb) => {
    const key = testKey(cb.dataset.file, cb.dataset.line, cb.dataset.title);
    if (cb.checked) state.selectedKeys.add(key);
    else state.selectedKeys.delete(key);
  });
  afterSelectionChange();
}

function syncCategoryBoxes() {
  $$('.cat-group').forEach((group) => {
    const boxes = $$('.test-cb', group).filter((b) => !b.disabled);
    const cat = $('.cat-cb', group);
    if (!cat) return;
    if (!boxes.length) { cat.checked = false; cat.indeterminate = false; cat.disabled = true; return; }
    cat.disabled = false;
    const checked = boxes.filter((b) => b.checked).length;
    cat.checked = checked === boxes.length;
    cat.indeterminate = checked > 0 && checked < boxes.length;
  });
}

function renderChips() {
  const el = $('#active-chips');
  el.innerHTML = '';
  const perGroup = new Map();
  for (const { test, group } of allCatalogTests()) {
    if (state.selectedKeys.has(testKey(test.file, test.line, test.title))) {
      perGroup.set(group.label, (perGroup.get(group.label) || 0) + 1);
    }
  }
  if (!perGroup.size) return;
  for (const [label, n] of perGroup) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.insertAdjacentHTML('beforeend', `${esc(label)}: ${n}`);
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'chip-x';
    x.setAttribute('aria-label', `Auswahl „${label}" entfernen`);
    x.innerHTML = icon('x');
    x.addEventListener('click', () => {
      for (const { test, group } of allCatalogTests()) {
        if (group.label === label) state.selectedKeys.delete(testKey(test.file, test.line, test.title));
      }
      renderCatalog();
      afterSelectionChange();
    });
    chip.appendChild(x);
    el.appendChild(chip);
  }
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'chip-clear chip';
  clear.textContent = 'Alle abwählen';
  clear.addEventListener('click', clearSelection);
  el.appendChild(clear);
}

/** Auswahl, Suchfeld und aufgeklappte Kategorien zurücksetzen. */
function resetSelection() {
  state.selectedKeys.clear();
  state.searchTerm = '';
  $('#catalog-search').value = '';
  openGroups.clear();
  renderCatalog();
  afterSelectionChange();
  $('#catalog-search').focus();
}

function clearSelection() {
  state.selectedKeys.clear();
  renderCatalog();
  afterSelectionChange();
}

function selectAll() {
  for (const { test } of allCatalogTests()) {
    if (allowedHere(test)) state.selectedKeys.add(testKey(test.file, test.line, test.title));
  }
  renderCatalog();
  afterSelectionChange();
}

/** Nicht verfügbare Tests aus der Auswahl entfernen (nach Umgebungswechsel). */
function pruneSelectionForEnv() {
  for (const { test } of allCatalogTests()) {
    if (!allowedHere(test)) state.selectedKeys.delete(testKey(test.file, test.line, test.title));
  }
}

// ---------------------------------------------------------------------------
// Umgebung und Modus
// ---------------------------------------------------------------------------
function renderEnvCards() {
  const root = $('#env-cards');
  root.innerHTML = '';
  for (const env of state.environments) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'choice';
    btn.setAttribute('aria-pressed', String(env.id === state.selectedEnvId));
    const desc = env.label.includes('(') ? env.label.slice(env.label.indexOf('(') + 1, -1) : '';
    btn.innerHTML = `<span class="choice-title">${esc(envShort(env.label))}</span>` +
      `<span class="choice-desc">${esc(desc || env.baseUrl || '')}</span>`;
    btn.addEventListener('click', () => {
      state.selectedEnvId = env.id;
      savePrefs();
      pruneSelectionForEnv();
      renderEnvCards();
      renderCatalog();
      afterSelectionChange();
    });
    root.appendChild(btn);
  }
  const env = currentEnvironment();
  $('#env-hint').textContent = !env ? '' : env.baseUrl
    ? `${env.baseUrl} · Zugangsdaten kommen aus der .env`
    : 'Keine Basis-URL im Preset hinterlegt. In environments.json ergänzen.';
}

function updateModeUi() {
  const { tests, projects } = collectSelection();
  const unitOnly = isUnitOnly(tests.length, projects);
  // Unit-Tests laufen ohne Browser: sichtbarer Modus ist sinnlos.
  if (unitOnly && state.mode !== 'headless') state.mode = 'headless';
  $$('#mode-cards .choice').forEach((card) => {
    const headed = card.dataset.mode === 'headed';
    card.disabled = unitOnly && headed;
    card.title = card.disabled ? 'Nur für UI-Tests. Unit-Tests laufen ohne Browser.' : '';
    card.setAttribute('aria-pressed', String(card.dataset.mode === state.mode));
  });
  $('#slowmo-row').hidden = !(state.mode === 'headed' && !unitOnly);
  $$('#slowmo-steps button').forEach((b) =>
    b.setAttribute('aria-pressed', String(Number(b.dataset.ms) === state.slowMo)));
}

// ---------------------------------------------------------------------------
// Schritte
// ---------------------------------------------------------------------------
function isStepOpen(n) {
  return state.stepMode === 'all' ? !closedInAllMode.has(n) : state.openStep === n;
}

function renderSteps() {
  const { tests } = collectSelection();
  const env = currentEnvironment();
  $('#steps').dataset.stepmodeActive = state.stepMode;
  $$('#steps .step').forEach((li) => {
    const n = Number(li.dataset.step);
    const open = isStepOpen(n);
    li.dataset.open = String(open);
    $('.step-head', li).setAttribute('aria-expanded', String(open));
    li.dataset.done = String(n === 1 ? tests.length > 0 : n === 2 ? !!env : false);
  });
  $$('[data-stepmode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.stepmode === state.stepMode)));

  const nGroups = new Set(allCatalogTests()
    .filter(({ test }) => state.selectedKeys.has(testKey(test.file, test.line, test.title)))
    .map(({ group }) => group.label)).size;
  $('#sum-1').textContent = tests.length
    ? `${tests.length} ${tests.length === 1 ? 'Test' : 'Tests'} in ${nGroups} ${nGroups === 1 ? 'Bereich' : 'Bereichen'}`
    : 'Noch nichts ausgewählt';
  $('#sum-2').textContent = env ? envShort(env.label) : '—';
  $('#sum-3').textContent = modeSummary();
}

function modeSummary() {
  const parts = [state.mode === 'headed' ? 'Sichtbar' : 'Headless'];
  if (state.options.repeatEach > 1) parts.push(`${state.options.repeatEach}×`);
  if (state.options.smokeGate) parts.push('Smoketest vorab');
  if (state.options.updateSnapshots) parts.push('Baselines aktualisieren');
  if (state.options.grep) parts.push(`Filter „${state.options.grep}"`);
  return parts.join(' · ');
}

function openStep(n) {
  if (state.stepMode === 'all') {
    if (closedInAllMode.has(n)) closedInAllMode.delete(n); else closedInAllMode.add(n);
  } else {
    state.openStep = n;
  }
  renderSteps();
}

// ---------------------------------------------------------------------------
// Start-Leiste
// ---------------------------------------------------------------------------
function updateStartbar() {
  const { tests } = collectSelection();
  const n = tests.length;
  $('#sb-count').textContent = n
    ? `${n} ${n === 1 ? 'Test' : 'Tests'} bereit`
    : 'Noch nichts ausgewählt';
  const env = currentEnvironment();
  $('#sb-detail').textContent = n
    ? `${envShort(env?.label) || '—'} · ${modeSummary()}`
    : 'Wähle in Schritt 1 mindestens einen Test.';
  $('#run').disabled = n === 0 || running;
  $('#run').title = n === 0 ? 'Zuerst mindestens einen Test wählen.' : running ? 'Es läuft bereits ein Lauf.' : '';
  $('#cancel').hidden = !running;
  $('#select-none').hidden = n === 0;
  $('#reset-selection').hidden = n === 0 && !state.searchTerm && openGroups.size === 0;
  $('#select-all').hidden = n > 0 && n === allCatalogTests().filter(({ test }) => allowedHere(test)).length;
}

let previewTimer = null;
function updatePreview() {
  if ($('#cmd-panel').hidden) return;
  clearTimeout(previewTimer);
  previewTimer = setTimeout(async () => {
    const r = await api('/api/preview', buildRequest());
    $('#preview').textContent = r.data.preview || '';
  }, 120);
}

function afterSelectionChange() {
  syncCategoryBoxes();
  updateModeUi();
  renderChips();
  renderSteps();
  updateStartbar();
  updatePreview();
}

async function startRun() {
  if (!collectSelection().tests.length || running) return;
  const r = await startRunRequest(buildRequest());
  if (!r.ok) toast(r.error, 'error');
}

// ---------------------------------------------------------------------------
// Verdrahtung
// ---------------------------------------------------------------------------
export function init() {
  // Gespeicherte Optionen in die Felder schreiben.
  $('#grep').value = state.options.grep;
  $('#repeat-each').value = String(state.options.repeatEach);
  $('#update-snapshots').checked = state.options.updateSnapshots;
  $('#smoke-gate').checked = state.options.smokeGate;

  $$('#steps .step').forEach((li) => {
    const n = Number(li.dataset.step);
    $('.step-head', li).addEventListener('click', () => openStep(n));
  });
  $$('[data-next]').forEach((b) => b.addEventListener('click', () => {
    const n = Number(b.dataset.next);
    state.openStep = n;
    renderSteps();
    $(`#steps .step[data-step="${n}"]`).scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }));
  $$('[data-stepmode]').forEach((b) => b.addEventListener('click', () => {
    state.stepMode = b.dataset.stepmode;
    closedInAllMode.clear();
    savePrefs();
    renderSteps();
  }));

  $('#catalog-search').addEventListener('input', (e) => {
    state.searchTerm = e.target.value;
    renderCatalog();
    syncCategoryBoxes();
    updateStartbar();
  });
  $('#select-all').addEventListener('click', selectAll);
  $('#select-none').addEventListener('click', clearSelection);
  $('#reset-selection').addEventListener('click', resetSelection);

  $$('#mode-cards .choice').forEach((card) => card.addEventListener('click', () => {
    if (card.disabled) return;
    state.mode = card.dataset.mode;
    savePrefs();
    afterSelectionChange();
  }));
  $$('#slowmo-steps button').forEach((b) => b.addEventListener('click', () => {
    state.slowMo = Number(b.dataset.ms) || 0;
    savePrefs();
    afterSelectionChange();
  }));
  const options = () => {
    state.options.grep = $('#grep').value;
    state.options.repeatEach = Math.max(1, Number($('#repeat-each').value) || 1);
    state.options.updateSnapshots = $('#update-snapshots').checked;
    state.options.smokeGate = $('#smoke-gate').checked;
    savePrefs();
    afterSelectionChange();
  };
  ['#grep', '#repeat-each', '#update-snapshots', '#smoke-gate'].forEach((s) =>
    $(s).addEventListener('input', options));

  $('#cmd-toggle').addEventListener('click', () => {
    const panel = $('#cmd-panel');
    panel.hidden = !panel.hidden;
    $('#cmd-toggle').setAttribute('aria-expanded', String(!panel.hidden));
    updatePreview();
  });
  $('#run').addEventListener('click', startRun);
  $('#cancel').addEventListener('click', cancelRun);

  on('run-state', (d) => {
    if (d.running === running) return;
    running = d.running;
    updateStartbar();
  });

  updateModeUi();
  renderSteps();
  updateStartbar();
}
