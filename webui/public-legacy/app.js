// Frontend der Test-Web-UI. Vanilla-JS, kein Build-Step.
// Hält den UI-Zustand, baut die Lauf-Anforderung und redet mit dem Runner-Service.

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
  catalog: { projects: [], files: [] },
  environments: [],
  selectedEnvId: null,
  mode: 'headless',
  slowMo: 0,
  activeRunId: null,
  eventSource: null,
  baselines: [],
  searchTerm: '',
  // Gewählte Tests als Datei:Zeile-Schlüssel (überlebt das Filtern/Neu-Rendern).
  selectedKeys: new Set(),
  // Geladene Läufe der Historie — für "Neu starten" aus der Lauf-Tabelle.
  runs: [],
};

// ---------------------------------------------------------------------------
// Zuletzt verwendete Optionen (localStorage) - überlebt Reload UND Neustart des
// Web-UI-Service. Bewusst OHNE Testauswahl: die wechselt je Vorhaben, ein
// vorausgewählter Lauf wäre unerwünscht. Pro Arbeitsplatz/Browser.
// ---------------------------------------------------------------------------
const PREFS_KEY = 'aem-webui-prefs-v1';

function savePrefs() {
  try {
    const prefs = {
      mode: state.mode,
      slowMo: state.slowMo,
      selectedEnvId: state.selectedEnvId,
      grep: $('#grep').value,
      repeatEach: $('#repeat-each').value,
      updateSnapshots: $('#update-snapshots').checked,
      smokeGate: $('#smoke-gate').checked,
    };
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage nicht verfügbar (z.B. privater Modus) -> still ignorieren.
  }
}

function readPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Wendet gespeicherte Zusatzoptionen + Modus/Tempo an. Die Umgebung wird separat
 * nach dem Laden der Presets gesetzt (applyPrefsEnv), da ihre Gültigkeit erst
 * dann feststeht.
 */
function applyPrefsControls() {
  const p = readPrefs();
  if (!p) return;
  if (p.mode === 'headless' || p.mode === 'headed') state.mode = p.mode;
  if (typeof p.slowMo === 'number') state.slowMo = p.slowMo;
  if (typeof p.grep === 'string') $('#grep').value = p.grep;
  if (typeof p.repeatEach === 'string' && p.repeatEach !== '') $('#repeat-each').value = p.repeatEach;
  if (typeof p.updateSnapshots === 'boolean') $('#update-snapshots').checked = p.updateSnapshots;
  if (typeof p.smokeGate === 'boolean') $('#smoke-gate').checked = p.smokeGate;
}

/** Setzt die zuletzt gewählte Umgebung, sofern sie noch existiert. */
function applyPrefsEnv() {
  const p = readPrefs();
  if (p && state.environments.some((e) => e.id === p.selectedEnvId)) {
    state.selectedEnvId = p.selectedEnvId;
  }
}

// ---------------------------------------------------------------------------
// Laden: Katalog + Umgebungen
// ---------------------------------------------------------------------------
async function loadCatalog(refresh = false) {
  $('#catalog').textContent = 'Lade Tests…';
  const res = await fetch(`/api/tests${refresh ? '?refresh=1' : ''}`);
  if (!res.ok) {
    $('#catalog').textContent = 'Tests konnten nicht geladen werden.';
    return;
  }
  state.catalog = await res.json();
  renderCatalog();
  syncParentCheckboxes();
  updateSelectionHint();
  renderChips();
  updatePreview();
}

async function loadEnvironments() {
  const res = await fetch('/api/environments');
  const data = await res.json();
  state.environments = data.environments || [];
  if (state.environments.length) state.selectedEnvId = state.environments[0].id;
  // Zuletzt gewählte Umgebung bevorzugen (falls noch vorhanden).
  applyPrefsEnv();
  renderEnvCards();
  updateEnvHint();
}

function currentEnvironment() {
  return state.environments.find((e) => e.id === state.selectedEnvId);
}

// ---------------------------------------------------------------------------
// Umgebungs-Karten
// ---------------------------------------------------------------------------
function renderEnvCards() {
  const root = $('#env-cards');
  root.innerHTML = '';
  for (const env of state.environments) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'card';
    btn.setAttribute('role', 'radio');
    btn.setAttribute('aria-pressed', String(env.id === state.selectedEnvId));
    const short = env.label.split(' (')[0];
    const desc = env.label.includes('(') ? env.label.slice(env.label.indexOf('(') + 1, -1) : '';
    btn.innerHTML =
      `<span class="card-title">${escapeHtml(short)}</span>` +
      `<span class="card-desc">${escapeHtml(desc || env.baseUrl || '')}</span>`;
    btn.addEventListener('click', () => {
      state.selectedEnvId = env.id;
      renderEnvCards();
      updateEnvHint();
      savePrefs();
      // In der neuen Umgebung nicht verfügbare Tests aus der Auswahl entfernen,
      // dann Katalog neu zeichnen (Deaktivierung + Tooltip aktualisieren).
      pruneSelectionForEnv();
      renderCatalog();
      afterSelectionReset();
    });
    root.appendChild(btn);
  }
}

function updateEnvHint() {
  const env = currentEnvironment();
  const hint = $('#env-hint');
  if (!env) { hint.textContent = ''; return; }
  hint.textContent = env.baseUrl
    ? `${env.baseUrl} · Zugangsdaten kommen aus der .env`
    : 'Keine Basis-URL im Preset hinterlegt — in environments.json ergänzen.';
}

// ---------------------------------------------------------------------------
// Modus-Karten
// ---------------------------------------------------------------------------
function renderModeCards() {
  $$('#mode-cards .card').forEach((card) => {
    const active = card.dataset.mode === state.mode;
    card.setAttribute('aria-pressed', String(active));
  });
  // Tempo nur im sichtbaren Lauf UND nur, wenn der sichtbare Modus überhaupt
  // verfügbar ist (bei Unit-only ist er gesperrt).
  const headedCard = document.querySelector('#mode-cards .card[data-mode="headed"]');
  const headedAvailable = headedCard ? !headedCard.disabled : true;
  $('#slowmo-row').hidden = !(state.mode === 'headed' && headedAvailable);
}

function renderSlowmoSteps() {
  $$('#slowmo-steps button').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(Number(btn.dataset.ms) === state.slowMo));
  });
}

// ---------------------------------------------------------------------------
// Katalog rendern (lesbare Labels, Pfad sekundär)
// ---------------------------------------------------------------------------
function renderCatalog() {
  const root = $('#catalog');
  root.innerHTML = '';
  const groups = state.catalog.groups || [];
  if (!groups.length) {
    root.textContent = 'Keine Tests gefunden.';
    return;
  }
  const term = state.searchTerm.trim().toLowerCase();
  let shownGroups = 0;
  let shownTests = 0;
  for (const group of groups) {
    const el = renderGroup(group, term);
    if (el) {
      root.appendChild(el);
      shownGroups++;
      shownTests += el._matchCount || 0;
    }
  }
  if (shownGroups === 0) {
    root.textContent = `Kein Test passt zu „${state.searchTerm}".`;
  }
  return shownTests;
}

// Prüft, ob ein Test zum Suchbegriff passt (Name, Kategorie-Label, Tags, Datei).
function testMatches(test, file, group, term) {
  if (!term) return true;
  const haystack = [
    test.title,
    file.label,
    file.file,
    group.label,
    ...(test.tags || []),
  ].join(' ').toLowerCase();
  return haystack.includes(term);
}

// Eine Kategorie als einklappbarer Block (<details>, standardmäßig ZU). Jede
// Zeile = genau ein Test. Bei aktiver Suche werden nur Treffer gezeigt und der
// Block automatisch aufgeklappt. Gibt null zurück, wenn kein Test passt.
function renderGroup(group, term) {
  // Passende Tests pro Datei vorfiltern.
  const matchedFiles = group.files
    .map((file) => ({ file, tests: file.tests.filter((t) => testMatches(t, file, group, term)) }))
    .filter((mf) => mf.tests.length > 0);
  const matchCount = matchedFiles.reduce((n, mf) => n + mf.tests.length, 0);
  if (matchCount === 0) return null;

  const section = document.createElement('details');
  section.className = 'cat-group';
  // Eingeklappt im Normalfall; bei aktiver Suche aufgeklappt (Treffer zeigen).
  section.open = term.length > 0;

  const head = document.createElement('summary');
  head.className = 'cat-head';
  // Kategorie-Haken: Klick darf das <details> nicht auf-/zuklappen.
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'cat-cb';
  cb.title = 'Ganze Kategorie wählen';
  cb.addEventListener('click', (e) => e.stopPropagation());
  cb.addEventListener('change', () => {
    // Deaktivierte (umgebungsfremde) Tests nicht mitwählen.
    section.querySelectorAll('.test-cb').forEach((t) => {
      if (!t.disabled) t.checked = cb.checked;
    });
    onSelectionChange();
  });
  const title = document.createElement('span');
  title.className = 'cat-title';
  title.textContent = group.label;
  const count = document.createElement('span');
  count.className = 'cat-count';
  count.textContent = String(matchCount);
  head.append(cb, title, count);
  if (group.description) {
    const desc = document.createElement('span');
    desc.className = 'cat-desc';
    desc.textContent = group.description;
    head.appendChild(desc);
  }
  section.appendChild(head);

  const ul = document.createElement('ul');
  ul.className = 'test-list';
  for (const mf of matchedFiles) {
    for (const test of mf.tests) {
      ul.appendChild(renderTestRow(test, mf.file));
    }
  }
  section.appendChild(ul);
  section._matchCount = matchCount;
  return section;
}

// Eindeutiger Schlüssel eines Tests. Datei:Zeile reicht NICHT: datengetriebene
// Tests (mehrere test(...) aus einer Schleife) teilen sich Datei UND Zeile.
// Daher den Titel einbeziehen, sonst markiert ein Haken alle Geschwister.
function testKey(file, line, title) {
  return `${file}:${line}:${title}`;
}

// Eine Testzeile: Checkbox + Testname + dezente Herkunft (Suite).
function renderTestRow(test, file) {
  const li = document.createElement('li');
  const lbl = document.createElement('label');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'test-cb';
  cb.dataset.file = test.file;
  cb.dataset.line = String(test.line);
  cb.dataset.title = test.title;
  cb.dataset.projects = test.projects.join(',');

  // In der gewählten Umgebung nicht verfügbar? -> deaktivieren, nicht wählbar.
  const allowed = isTestAllowedInSelectedEnv(test);
  const envLabel = currentEnvironment()?.label.split(' (')[0] || 'dieser Umgebung';
  const reason = `In der ausgewählten Umgebung (${envLabel}) nicht verfügbar.`;
  if (!allowed) {
    li.classList.add('disabled');
    cb.disabled = true;
    cb.checked = false;
  } else {
    // Auswahl aus dem bewahrten Zustand wiederherstellen.
    cb.checked = state.selectedKeys?.has(testKey(test.file, test.line, test.title)) || false;
  }
  cb.addEventListener('change', onSelectionChange);

  const txt = document.createElement('span');
  txt.className = 'test-name';
  txt.textContent = test.title;
  // Bei gesperrtem Test der Umgebungs-Grund als Tooltip, sonst der volle Name.
  // Auf ALLE Kinder setzen, damit der Hinweis überall in der Zeile erscheint
  // (ein Kind mit eigenem title würde den Zeilen-Tooltip sonst verdecken).
  txt.title = allowed ? test.title : reason;

  const origin = document.createElement('span');
  origin.className = 'test-origin';
  origin.textContent = file.label; // Herkunft (Suite), dezent
  origin.title = allowed ? file.file : reason;

  // Tooltip auch auf Zeile und Label (Lücken zwischen den Kindern).
  li.title = allowed ? '' : reason;
  lbl.title = allowed ? '' : reason;

  lbl.append(cb, txt, origin);
  li.appendChild(lbl);
  return li;
}

// Aus den Tags eines Tests die erlaubten Umgebungen ableiten: jeder Tag
// `env:<id>` schränkt ein. Ohne `env:*`-Tag läuft der Test überall.
function allowedEnvsOf(test) {
  return (test.tags || [])
    .filter((t) => t.startsWith('env:'))
    .map((t) => t.slice('env:'.length));
}

// true, wenn der Test in der aktuell gewählten Umgebung laufen darf.
function isTestAllowedInSelectedEnv(test) {
  const allowed = allowedEnvsOf(test);
  if (allowed.length === 0) return true; // keine Einschränkung
  const env = currentEnvironment();
  return env ? allowed.includes(env.env) : true;
}

// Entfernt aus der bewahrten Auswahl alle Tests, die in der aktuell gewählten
// Umgebung nicht verfügbar sind (nach einem Umgebungswechsel aufrufen).
function pruneSelectionForEnv() {
  for (const { test } of allCatalogTests()) {
    if (!isTestAllowedInSelectedEnv(test)) {
      state.selectedKeys.delete(testKey(test.file, test.line, test.title));
    }
  }
}

function onSelectionChange() {
  // Zustand der aktuell SICHTBAREN Boxen in selectedKeys spiegeln. Durch den
  // Filter ausgeblendete (nicht im DOM vorhandene) Auswahlen bleiben erhalten.
  $$('.test-cb').forEach((cb) => {
    const key = testKey(cb.dataset.file, cb.dataset.line, cb.dataset.title);
    if (cb.checked) state.selectedKeys.add(key);
    else state.selectedKeys.delete(key);
  });
  syncParentCheckboxes();
  updateModeAvailability();
  updateSelectionHint();
  renderChips();
  updatePreview();
}

// True, wenn mindestens ein Test gewählt ist und ALLE gewählten Tests nur zum
// `unit`-Projekt gehören. Dann braucht es keinen Browser -> sichtbare Modi aus.
function isUnitOnly() {
  const { tests, projects } = collectSelection();
  if (!tests.length) return false; // nichts gewählt
  return projects.length > 0 && projects.every((p) => p === 'unit');
}

// Graut "Sichtbar", "UI-Mode" und die Tempo-Stufen aus, wenn nur Unit-Tests
// gewählt sind (laufen ohne Browser). Erzwingt dann den Headless-Modus.
function updateModeAvailability() {
  const unitOnly = isUnitOnly();
  if (unitOnly && state.mode !== 'headless') {
    state.mode = 'headless';
  }
  $$('#mode-cards .card').forEach((card) => {
    const disabled = unitOnly && card.dataset.mode !== 'headless';
    card.disabled = disabled;
    card.title = disabled ? 'Nur für UI-Tests — Unit-Tests laufen ohne Browser.' : '';
  });
  // Nach dem Setzen der disabled-Flags neu zeichnen: blendet auch die
  // Tempo-Zeile korrekt aus (sie hängt an der Verfügbarkeit von "Sichtbar").
  renderModeCards();
}

// Kategorie-Haken den Zustand ihrer Tests spiegeln lassen:
// checked = alle Tests an, indeterminate = teilweise, leer = keiner.
function syncParentCheckboxes() {
  $$('.cat-group').forEach((group) => {
    // Deaktivierte (umgebungsfremde) Tests zählen nicht mit — sonst wäre der
    // Kategorie-Haken nie "voll", obwohl alle wählbaren Tests gewählt sind.
    const boxes = Array.from(group.querySelectorAll('.test-cb')).filter((b) => !b.disabled);
    const catCb = group.querySelector('.cat-cb');
    if (!catCb) return;
    if (!boxes.length) {
      // Nur deaktivierte Tests in der Gruppe -> Kategorie-Haken selbst sperren.
      catCb.checked = false;
      catCb.indeterminate = false;
      catCb.disabled = true;
      return;
    }
    catCb.disabled = false;
    const checked = boxes.filter((b) => b.checked).length;
    catCb.checked = checked === boxes.length;
    catCb.indeterminate = checked > 0 && checked < boxes.length;
  });
}

function updateSelectionHint() {
  const total = allCatalogTests().length;
  const n = collectSelection().tests.length;
  const hint = $('#selection-hint');
  hint.textContent = n === 0
    ? 'Noch nichts ausgewählt — zum Starten mindestens einen Test wählen.'
    : `${n} Test${n === 1 ? '' : 's'} ausgewählt.`;
  // "Keine" nur zeigen, wenn mindestens ein Test gewählt ist.
  $('#select-none').hidden = n === 0;
  // "Alle" nur zeigen, wenn noch nicht alle gewählt sind.
  $('#select-all').hidden = total > 0 && n === total;
}

// Aktive Auswahl als Chips: eine pro Kategorie mit Anzahl, plus "× alle".
// Klick auf das × einer Kategorie wählt deren Tests ab.
function renderChips() {
  const el = $('#active-chips');
  el.innerHTML = '';
  const perGroup = new Map();
  for (const { test, group } of allCatalogTests()) {
    if (state.selectedKeys.has(testKey(test.file, test.line, test.title))) {
      perGroup.set(group.label, (perGroup.get(group.label) || 0) + 1);
    }
  }
  if (perGroup.size === 0) return;

  for (const [label, count] of perGroup) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = `${label}: ${count}`;
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'chip-x';
    x.setAttribute('aria-label', `Auswahl „${label}" entfernen`);
    x.textContent = '×';
    x.addEventListener('click', () => deselectGroup(label));
    chip.appendChild(x);
    el.appendChild(chip);
  }
  // "Alles abwählen"-Chip.
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'chip chip-clear';
  clear.textContent = 'Alle abwählen';
  clear.addEventListener('click', () => {
    state.selectedKeys.clear();
    renderCatalog();
    afterSelectionReset();
  });
  el.appendChild(clear);
}

// Wählt alle Tests einer Kategorie (per Label) ab.
function deselectGroup(label) {
  for (const { test, group } of allCatalogTests()) {
    if (group.label === label) state.selectedKeys.delete(testKey(test.file, test.line, test.title));
  }
  renderCatalog();
  afterSelectionReset();
}

// Nach einer Auswahl-Änderung, die das DOM neu gebaut hat: abgeleitete UI
// aktualisieren (ohne erneut aus dem DOM zu lesen).
function afterSelectionReset() {
  syncParentCheckboxes();
  updateModeAvailability();
  updateSelectionHint();
  renderChips();
  updatePreview();
}

// ---------------------------------------------------------------------------
// UI-Zustand -> Lauf-Anforderung
// ---------------------------------------------------------------------------
// Alle Tests des (sichtbaren) Katalogs als flache Liste. Basis für Auswahl-
// Ableitung aus selectedKeys — unabhängig davon, was der Filter gerade zeigt.
function allCatalogTests() {
  const out = [];
  for (const group of state.catalog.groups || []) {
    for (const file of group.files) {
      for (const test of file.tests) {
        out.push({ test, file, group });
      }
    }
  }
  return out;
}

function collectSelection() {
  const tests = [];
  const projectSet = new Set();
  for (const { test } of allCatalogTests()) {
    if (state.selectedKeys.has(testKey(test.file, test.line, test.title))) {
      // Titel mitgeben: der Server grenzt datengetriebene Geschwister (gleiche
      // Datei:Zeile) per --grep auf genau diesen Titel ein.
      tests.push({ file: test.file, line: test.line, title: test.title });
      (test.projects || []).forEach((p) => projectSet.add(p));
    }
  }
  return { tests, projects: [...projectSet] };
}

function buildRequest() {
  const { tests, projects } = collectSelection();
  return {
    tests,
    projects,
    environment: currentEnvironment(),
    headed: state.mode === 'headed',
    grep: $('#grep').value || undefined,
    repeatEach: Number($('#repeat-each').value) || 1,
    workers: Number($('#workers').value) || 1,
    updateSnapshots: $('#update-snapshots').checked,
    smokeGate: $('#smoke-gate').checked,
    slowMo: state.slowMo,
  };
}

let previewTimer = null;
function updatePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(async () => {
    const res = await fetch('/api/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildRequest()),
    });
    const data = await res.json();
    $('#preview').textContent = data.preview || '';
  }, 120);
}

// ---------------------------------------------------------------------------
// Lauf starten / abbrechen / streamen
// ---------------------------------------------------------------------------
async function startRun() {
  // Ohne Auswahl nicht starten: ein leerer Filter würde sonst ALLE Tests laufen.
  const { tests } = collectSelection();
  if (!tests.length) {
    revealResults();
    focusResults();
    setStatus('failed', 'Bitte zuerst mindestens einen Test auswählen.');
    return;
  }
  const res = await fetch('/api/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(buildRequest()),
  });
  const data = await res.json();
  if (!res.ok) {
    revealResults();
    focusResults();
    setStatus('failed', data.error || 'Start fehlgeschlagen.');
    return;
  }
  state.activeRunId = data.id;
  revealResults();
  focusResults();
  $('#log').textContent = '';
  $('#result-table').hidden = true;
  $('#summary').hidden = true;
  $('#blocker').hidden = true;
  $('#log-box').hidden = false;
  $('#log-box').open = true;
  $('#run').disabled = true;
  $('#cancel').disabled = false;
  setStatus('running', 'Tests werden ausgeführt…');
  streamRun(data.id);
}

function revealResults() {
  $('#empty-state').hidden = true;
  $('#status-line').hidden = false;
}

// Nach dem Start den Blick auf den Ergebnisbereich lenken (bei schmalem Layout
// steht er unter der Konfiguration; der Nutzer bliebe sonst am Start-Button).
function focusResults() {
  const results = $('#results');
  results.scrollIntoView({ behavior: 'smooth', block: 'start' });
  // Statuszeile fokussierbar machen und fokussieren (Screenreader/Tastatur).
  const status = $('#status-line');
  status.setAttribute('tabindex', '-1');
  status.focus({ preventScroll: true });
}

// Lebenszeichen während eines Laufs: Laufzeit + Zeit seit der letzten Log-Ausgabe.
// Headless kommt lange keine Ausgabe, solange ein Test läuft.
function formatDuration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function startRunTicker(startedAt) {
  stopRunTicker();
  const started = startedAt ? new Date(startedAt).getTime() : Date.now();
  state.lastLogAt = Date.now();
  const el = $('#status-line');
  const base = el.textContent;
  const tick = () => {
    const now = Date.now();
    el.textContent = `${base} · läuft seit ${formatDuration(now - started)} · letzte Ausgabe vor ${formatDuration(now - state.lastLogAt)}`;
  };
  tick();
  state.runTicker = setInterval(tick, 1000);
}

function stopRunTicker() {
  if (state.runTicker) clearInterval(state.runTicker);
  state.runTicker = null;
}

function streamRun(id, startedAt) {
  if (state.eventSource) state.eventSource.close();
  const es = new EventSource(`/api/run/${id}/stream`);
  state.eventSource = es;
  startRunTicker(startedAt);
  es.addEventListener('log', (e) => {
    state.lastLogAt = Date.now();
    const logEl = $('#log');
    logEl.textContent += JSON.parse(e.data);
    logEl.scrollTop = logEl.scrollHeight;
  });
  es.addEventListener('done', (e) => {
    const info = JSON.parse(e.data);
    es.close();
    state.eventSource = null;
    stopRunTicker();
    $('#run').disabled = false;
    $('#cancel').disabled = true;
    if (info.status === 'cancelled') {
      setStatus('failed', 'Lauf abgebrochen.');
    } else {
      setStatus(info.status === 'passed' ? 'passed' : 'failed',
        info.status === 'passed' ? 'Lauf erfolgreich.' : 'Lauf fehlgeschlagen.');
    }
    if (info.blocker) showBlocker(info.blocker);
    loadReport(id);
    loadHistory();
  });
  es.onerror = () => {
    // Nur reagieren, wenn der Lauf noch als aktiv gilt. Nach erfolgreichem
    // 'done' ist state.eventSource bereits null -> normaler Verbindungsschluss,
    // keine Fehlermeldung zeigen.
    if (!state.eventSource) return;
    state.eventSource = null;
    stopRunTicker();
    $('#run').disabled = false;
    $('#cancel').disabled = true;
    setStatus('failed', 'Verbindung zum Lauf verloren.');
  };
}

async function cancelRun() {
  if (!state.activeRunId) return;
  await fetch(`/api/run/${state.activeRunId}/cancel`, { method: 'POST' });
  stopRunTicker();
  setStatus('failed', 'Abbruch angefordert…');
}

// Öffnet Playwrights UI-Mode in einem eigenen Fenster. Übernimmt so viel wie
// technisch sinnvoll: Umgebung, Projekte und grep-Filter. Die Datei/Zeile-
// Testauswahl kann --ui nicht vorfiltern -> bewusst nicht übergeben.
async function openUiMode() {
  const { projects } = collectSelection();
  const grep = $('#grep').value || undefined;
  const res = await fetch('/api/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      uiMode: true,
      environment: currentEnvironment(),
      projects,
      grep,
    }),
  });
  const data = await res.json();
  revealResults();
  focusResults();
  $('#log-box').hidden = true;
  $('#result-table').hidden = true;
  $('#summary').hidden = true;
  if (!res.ok) {
    setStatus('failed', data.error || 'UI-Mode konnte nicht gestartet werden.');
    return;
  }
  const hints = [];
  if (projects.length) hints.push(`Projekte: ${projects.join(', ')}`);
  if (grep) hints.push(`Filter: ${grep}`);
  const hintText = hints.length ? ` Übernommen — ${hints.join(' · ')}.` : '';
  setStatus('passed',
    'Playwright UI-Mode gestartet (eigenes Fenster).' + hintText +
    ' Die Testauswahl (Datei/Zeile) wird dort nicht übernommen — nutze das Suchfeld im UI-Mode.');
}

function setStatus(kind, text) {
  const el = $('#status-line');
  el.hidden = false;
  el.className = `status-line ${kind}`;
  el.textContent = text;
}

function showBlocker(text) {
  const el = $('#blocker');
  el.hidden = false;
  el.textContent = text;
}

// ---------------------------------------------------------------------------
// Beenden
// ---------------------------------------------------------------------------
async function shutdownApp() {
  if (!confirm('Anwendung beenden? Der lokale Service stoppt und gibt den Port frei.')) return;
  try {
    await fetch('/api/shutdown', { method: 'POST' });
  } catch { /* Verbindung bricht erwartungsgemäß ab */ }
  document.body.innerHTML =
    '<div style="padding:48px;text-align:center;color:#6b7280;font-family:system-ui">' +
    'Die Anwendung wurde beendet. Dieses Fenster kann geschlossen werden.</div>';
}

// ---------------------------------------------------------------------------
// Ergebnis-Tabelle
// ---------------------------------------------------------------------------
/** Icon und Name für einen Artefakt-Namen (getrennt für Anzeige vs. Tooltip). */
function artifactInfo(name) {
  const map = [
    ['trace',                   '🔍', 'Trace'],
    ['video',                   '🎥', 'Video'],
    ['error-context',           '📋', 'Fehler-Kontext'],
    ['rendered-page-diff',      '🆚', 'Diff'],
    ['rendered-page-expected',  '🎯', 'Baseline'],
    ['rendered-page-actual',    '👁️', 'Aufnahme'],
    ['screenshot',              '🖼️', 'Screenshot'],
  ];
  const lower = (name || '').toLowerCase();
  const hit = map.find(([key]) => lower.includes(key));
  if (hit) return { icon: hit[1], label: hit[2] };
  // Fallback: kein bekanntes Icon, Name mit Großschreibung.
  const fallback = name ? name.charAt(0).toUpperCase() + name.slice(1) : name;
  return { icon: '📎', label: fallback };
}

/**
 * Erstellt ein Artefakt-Element:
 * - Trace → Link zu trace.playwright.dev (öffnet direkt im Viewer)
 * - Fehler-Kontext → Link zu /view-md (gerendertes Markdown, neuer Tab)
 * - Sonstige → normaler Link in neuem Tab
 */
function renderArtifactLink(a) {
  const { icon, label } = artifactInfo(a.name);
  const lower = (a.name || '').toLowerCase();

  if (lower.includes('trace') && a.url) {
    // trace.playwright.dev lädt Traces per ?trace=<vollständige-URL>.
    // Der Server liefert Traces mit CORS-Header für diese Domain.
    const traceUrl = `https://trace.playwright.dev/?trace=${window.location.origin}${a.url}`;
    const link = document.createElement('a');
    link.href = traceUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = icon;
    link.dataset.tooltip = label;
    return link;
  }

  if (lower.includes('error-context') && a.url) {
    // Markdown-Viewer: /view-md rendert die .md-Datei als gestyltes HTML.
    const link = document.createElement('a');
    link.href = `/view-md?file=${encodeURIComponent(a.url)}`;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = icon;
    link.dataset.tooltip = label;
    return link;
  }

  const link = document.createElement('a');
  link.href = a.url || '#';
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = icon;
  link.dataset.tooltip = label;
  return link;
}

function fmtDuration(ms) {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

/** Lesbare Kurzbezeichnung für einen Level-Tag. */
function levelLabel(level) {
  const map = {
    'smoke': 'Smoketest',
    'level1': 'Basisfunktionen (L1)',
    'level2-components': 'Komponenten (L2)',
    'integration': 'Integrationstest',
    'regression': 'Regressionstest',
    'unit': 'Unit',
  };
  return map[level] || level || '—';
}

/**
 * Zeigt ein Banner, wenn übersprungene Tests auf fehlende Referenz-Fixtures
 * hinweisen, und bietet einen Button zum Starten des Capture-Laufs.
 */
function checkCaptureNeeded(rows) {
  const hint = $('#capture-hint');
  if (!hint) return;
  const captureRows = (rows || []).filter(
    (r) => r.status === 'skipped' && r.skipReason && /CAPTURE_DIALOGS/i.test(r.skipReason),
  );
  if (!captureRows.length) {
    hint.hidden = true;
    return;
  }
  hint.hidden = false;
  $('#capture-count').textContent = captureRows.length;
}

async function runCapture() {
  const req = {
    files: ['tests/components/dialog-capture.spec.ts'],
    projects: ['chromium'],
    environment: currentEnvironment(),
    headed: state.mode === 'headed',
    slowMo: state.slowMo,
    workers: 1,
    captureDialogs: true,
  };
  const res = await fetch('/api/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
  });
  const data = await res.json();
  if (!res.ok) {
    revealResults();
    focusResults();
    setStatus('failed', data.error || 'Capture-Start fehlgeschlagen.');
    return;
  }
  state.activeRunId = data.id;
  revealResults();
  focusResults();
  $('#log').textContent = '';
  $('#result-table').hidden = true;
  $('#summary').hidden = true;
  $('#blocker').hidden = true;
  $('#capture-hint').hidden = true;
  $('#log-box').hidden = false;
  $('#log-box').open = true;
  $('#run').disabled = true;
  $('#cancel').disabled = false;
  setStatus('running', 'Tests werden ausgeführt…');
  streamRun(data.id);
}

async function loadReport(id) {
  const res = await fetch(`/api/run/${id}/report`);
  if (!res.ok) return false;
  const data = await res.json();
  revealResults();
  renderSummary(data.summary);
  renderTable(data.rows);
  if (data.blocker) showBlocker(data.blocker);
  checkCaptureNeeded(data.rows);
  return true;
}

function renderSummary(s) {
  if (!s) return;
  const el = $('#summary');
  el.hidden = false;
  el.innerHTML =
    `<span class="pill pass">${s.passed} bestanden</span>` +
    `<span class="pill fail">${s.failed} fehlgeschlagen</span>` +
    `<span class="pill skip">${s.skipped} übersprungen</span>` +
    // Instabil ist in „bestanden" enthalten, daher nur als Zusatz.
    (s.flaky ? `<span class="pill flaky" title="Erst im Wiederholungsversuch bestanden">davon ${s.flaky} instabil</span>` : '') +
    `<span>Gesamt: ${fmtDuration(s.durationMs)}</span>`;
}

function renderTable(rows) {
  const table = $('#result-table');
  const tbody = table.querySelector('tbody');
  tbody.innerHTML = '';
  if (!rows || !rows.length) { table.hidden = true; return; }
  table.hidden = false;
  for (const row of rows) {
    const tr = document.createElement('tr');

    const tdLevel = document.createElement('td');
    tdLevel.textContent = levelLabel(row.level);
    tr.appendChild(tdLevel);

    const tdSuite = document.createElement('td');
    tdSuite.textContent = row.suite || '—';
    tr.appendChild(tdSuite);

    const tdTitle = document.createElement('td');
    const displayTitle = row.title.charAt(0).toUpperCase() + row.title.slice(1);
    const repeat = row.repeatLabel ? ` · ${escapeHtml(row.repeatLabel)}` : '';
    tdTitle.innerHTML = `${escapeHtml(displayTitle)}<br><small>${escapeHtml(row.file)}${repeat}</small>`;
    // Retry-Badge mit CSS-Tooltip (sofort sichtbar beim Hovern, kein Delay).
    if (row.retryCount > 0) {
      const badge = document.createElement('span');
      badge.className = `retry-badge${row.flaky ? ' retry-recovered' : ''}`;
      badge.dataset.tooltip = row.flaky
        ? `Instabil: erst beim ${row.retryCount}. Wiederholungsversuch bestanden`
        : `${row.retryCount}× wiederholt, trotzdem fehlgeschlagen`;
      badge.textContent = row.flaky ? `⚠ instabil (↺ ${row.retryCount}×)` : `↺ ${row.retryCount}×`;
      tdTitle.appendChild(badge);
    }
    if (row.errorSummary) {
      const det = document.createElement('details');
      det.className = 'err';
      const sum = document.createElement('summary');
      sum.textContent = row.errorSummary;
      det.appendChild(sum);
      const pre = document.createElement('pre');
      pre.textContent = row.errorDetail || row.errorSummary;
      det.appendChild(pre);
      tdTitle.appendChild(det);
    }
    if (row.skipReason) {
      const skipDiv = document.createElement('div');
      skipDiv.className = 'skip-reason';
      skipDiv.textContent = `⏭ ${row.skipReason}`;
      tdTitle.appendChild(skipDiv);
    }
    tr.appendChild(tdTitle);

    const tdStatus = document.createElement('td');
    tdStatus.className = `st ${row.status}`;
    tdStatus.textContent = row.status;
    tr.appendChild(tdStatus);

    const tdDur = document.createElement('td');
    tdDur.textContent = fmtDuration(row.durationMs);
    tr.appendChild(tdDur);

    const tdArt = document.createElement('td');
    for (const a of row.attachments || []) {
      if (!a.url) continue;
      const div = document.createElement('div');
      div.appendChild(renderArtifactLink(a));
      tdArt.appendChild(div);
    }
    tr.appendChild(tdArt);

    tbody.appendChild(tr);
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------------------------------------------------------------------------
// Erweiterte Analyse: Historie + Baseline-Vergleich
// ---------------------------------------------------------------------------
async function toggleAdvanced() {
  const adv = $('#advanced');
  const btn = $('#toggle-advanced');
  const open = adv.hidden; // wird gleich geöffnet
  adv.hidden = !open;
  btn.setAttribute('aria-pressed', String(open));
  btn.textContent = open ? 'Baseline-Vergleich ausblenden' : 'Baseline-Vergleich';
  if (open) {
    await loadBaselines();
    adv.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// ---------------------------------------------------------------------------
// Lauf-Historie: gruppiert nach Jahr/Monat/Tag mit Checkboxen + Löschen
// ---------------------------------------------------------------------------

/** Formatiert Bytes lesbar (B / KB / MB). */
function fmtSize(bytes) {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Gruppiert Läufe in Map<Jahr → Map<Monatsbezeichnung → Map<Tagesbezeichnung → Run[]>>>. */
function groupRunsByDate(runs) {
  const byYear = new Map();
  for (const run of runs) {
    const d = new Date(run.startedAt);
    const year = d.getFullYear();
    const monthKey = d.toLocaleString('de-DE', { month: 'long', year: 'numeric' });
    const dayKey = d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' });
    if (!byYear.has(year)) byYear.set(year, new Map());
    const byMonth = byYear.get(year);
    if (!byMonth.has(monthKey)) byMonth.set(monthKey, new Map());
    const byDay = byMonth.get(monthKey);
    if (!byDay.has(dayKey)) byDay.set(dayKey, []);
    byDay.get(dayKey).push(run);
  }
  return byYear;
}

/** Gibt die Summe sizeBytes aller übergebenen Läufe zurück. */
function totalSizeOfRuns(runs) {
  return runs.reduce((s, r) => s + (r.sizeBytes || 0), 0);
}

/** Synct Parent-Checkboxen mit ihren Kind-Checkboxen (checked / indeterminate). */
function syncRunGroupCheckboxes(container) {
  (container || document).querySelectorAll('.runs-group').forEach((group) => {
    const children = Array.from(group.querySelectorAll(':scope > .runs-group-body .run-cb, :scope > .runs-group-body .runs-group-cb'));
    const groupCb = group.querySelector(':scope > .runs-group-head .runs-group-cb');
    if (!groupCb || !children.length) return;
    const checkedCount = children.filter((cb) => cb.checked).length;
    groupCb.checked = checkedCount === children.length;
    groupCb.indeterminate = checkedCount > 0 && checkedCount < children.length;
  });
}

/** Aktualisiert Löschen- und Neu-starten-Button (Anzahl + Zustand). */
function updateRunsActions() {
  const checked = Array.from(document.querySelectorAll('.run-cb')).filter((cb) => cb.checked);
  const n = checked.length;

  // Löschen-Button.
  const deleteBtn = $('#runs-delete-btn');
  if (deleteBtn) {
    const sizeSum = checked.reduce((s, cb) => s + (Number(cb.dataset.size) || 0), 0);
    deleteBtn.disabled = n === 0;
    deleteBtn.textContent = n === 0
      ? 'Ausgewählte löschen'
      : `${n} ${n === 1 ? 'Eintrag' : 'Einträge'} löschen (${fmtSize(sizeSum)})`;
  }

  // Neu-starten-Button.
  const rerunBtn = $('#runs-rerun-btn');
  if (rerunBtn) {
    const runsWithReq = checked.filter((cb) => {
      const run = (state.runs || []).find((r) => r.id === cb.dataset.id);
      return run && run.originalRequest &&
        ((run.originalRequest.tests?.length || 0) > 0 ||
         (run.originalRequest.projects?.length || 0) > 0);
    });
    const hasAny = runsWithReq.length > 0;
    rerunBtn.disabled = !hasAny;
    rerunBtn.textContent = hasAny ? `Neu starten (${runsWithReq.length})` : 'Neu starten';
    const missing = n - runsWithReq.length;
    rerunBtn.title = missing > 0
      ? `${missing} Lauf${missing === 1 ? '' : 'läufe'} ohne gespeicherte Test-Auswahl werden übersprungen`
      : '';
  }
}

/**
 * Lesbares Label für die Test-Auswahl eines Laufs.
 * Zeigt Dateinamen (ohne Pfad/Endung), max. 3, Rest als "(+N)".
 * Fallback auf meta.selection für ältere Läufe ohne originalRequest.
 */
/** Scrollt zur Summary-Zeile (Kopf des Ergebnisbereichs) und lässt die
 *  Ergebnistabelle aufblitzen — als konsistente Rückmeldung nach jedem Klick. */
function flashElement(el) {
  if (!el || el.hidden) return;
  // Immer zum Kopf des Ergebnisbereichs scrollen (summary oder status-line),
  // damit der Nutzer den Kontext sieht — nicht irgendwo in der Tabellenmitte.
  const scrollAnchor = $('#summary').hidden ? $('#status-line') : $('#summary');
  if (scrollAnchor && !scrollAnchor.hidden) {
    scrollAnchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
}

/** Tempo-Stufen wie in der Oberfläche (#slowmo-steps). */
const SLOWMO_LABELS = { 0: 'Normal', 500: 'Etwas langsamer', 1500: 'Langsam', 3000: 'Sehr langsam' };

/**
 * Kurztext der Lauf-Einstellungen, z.B. „Sichtbar, Sehr langsam, 3×, Smoketest vorab".
 * Leer bei älteren Läufen ohne gespeicherte Einstellungen.
 */
function runSettingsLabel(s) {
  if (!s) return '';
  const parts = [s.headed ? `Sichtbar, ${SLOWMO_LABELS[s.slowMo] ?? `${s.slowMo} ms`}` : 'Headless'];
  if (s.repeatEach > 1) parts.push(`${s.repeatEach}×`);
  if (s.smokeGate) parts.push('Smoketest vorab');
  if (s.updateSnapshots) parts.push('Baselines aktualisiert');
  return parts.join(', ');
}

function runSelectionLabel(run) {
  const tests = run.originalRequest?.tests;
  const projects = run.originalRequest?.projects;

  if (tests?.length) {
    // Dateinamen aus Pfaden ableiten: "basics/page-crud.spec.ts" → "page-crud"
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

/** Erstellt eine Lauf-Zeile. */
function renderRunEntry(run) {
  const li = document.createElement('li');
  li.className = 'run-entry';

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'run-cb';
  cb.dataset.id = run.id;
  cb.dataset.size = String(run.sizeBytes || 0);
  cb.addEventListener('click', (e) => e.stopPropagation());
  cb.addEventListener('change', () => {
    syncRunGroupCheckboxes($('#history'));
    updateRunsActions();
  });

  const statusMap = { passed: '✓', failed: '✗', cancelled: '⊘', running: '●' };
  const badge = document.createElement('span');
  const flaky = run.status === 'passed' && (run.summary?.flaky || 0) > 0;
  badge.className = `run-status ${flaky ? 'flaky' : run.status}`;
  badge.textContent = flaky ? '⚠' : (statusMap[run.status] || '?');
  badge.title = flaky ? 'Bestanden, aber instabil (erst im Wiederholungsversuch grün)' : run.status;

  const time = document.createElement('span');
  time.className = 'run-time';
  time.textContent = new Date(run.startedAt).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  const meta = document.createElement('span');
  meta.className = 'run-meta';
  const envShort = (run.environment || '—').split(' ')[0];
  const flakyText = run.summary?.flaky ? ` · ${run.summary.flaky} instabil` : '';
  const summary = run.summary ? `${run.summary.passed}/${run.summary.total} ok${flakyText}` : run.status;
  const settings = runSettingsLabel(run.settings);
  meta.textContent = settings ? `${envShort} · ${settings} · ${summary}` : `${envShort} · ${summary}`;
  if (settings) meta.title = `Einstellungen: ${settings}`;

  const sel = document.createElement('span');
  sel.className = 'run-sel';
  sel.textContent = runSelectionLabel(run);
  sel.title = runSelectionLabel(run);

  const size = document.createElement('span');
  size.className = 'run-size';
  size.textContent = fmtSize(run.sizeBytes);

  const reportLink = document.createElement('a');
  reportLink.href = `/report/${run.id}/`;
  reportLink.target = '_blank';
  reportLink.rel = 'noopener';
  reportLink.className = 'run-report-link';
  reportLink.textContent = 'Report ↗';
  reportLink.addEventListener('click', (e) => e.stopPropagation());

  li.append(cb, badge, time, meta, sel, size, reportLink);

  // Klick auf die Zeile (nicht Checkbox/Link) lädt Ergebnis in die Tabelle.
  // Kein Scroll: Die Tabelle liegt im Layout oberhalb der früheren Testergebnisse;
  // ein automatischer Sprung nach oben ist räumlich verwirrend.
  // Stattdessen: angeklickte Zeile als aktiv markieren + Ergebnisbereich
  // kurz aufblitzen lassen, damit der Nutzer weiß, wo die Daten erschienen sind.
  li.addEventListener('click', async () => {
    // Vorherige Auswahl aufheben.
    document.querySelectorAll('.run-entry.selected').forEach((el) => el.classList.remove('selected'));
    li.classList.add('selected');

    const ok = await loadReport(run.id);
    revealResults();
    if (ok) {
      $('#status-line').hidden = true;
      flashElement($('#result-table'));
    } else {
      $('#result-table').hidden = true;
      $('#summary').hidden = true;
      setStatus('failed', 'Für diesen Lauf gibt es keine Tabellenansicht. Nutze „Report ↗" für die Details.');
      flashElement($('#status-line'));
    }
  });

  return li;
}

/** Baut einen Group-<details>-Block mit Checkbox, Label, Zähler und Body. */
function renderGroupDetails(label, runs, level, defaultOpen) {
  const details = document.createElement('details');
  details.className = `runs-group runs-${level}-group`;
  if (defaultOpen) details.open = true;

  const summary = document.createElement('summary');
  summary.className = 'runs-group-head';

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'runs-group-cb';
  cb.addEventListener('click', (e) => e.stopPropagation());
  cb.addEventListener('change', () => {
    // Alle Kindboxen dieser Gruppe setzen (nur nicht-deaktivierte).
    details.querySelectorAll('.run-cb, .runs-group-cb').forEach((child) => {
      if (child !== cb && !child.disabled) child.checked = cb.checked;
    });
    syncRunGroupCheckboxes($('#history'));
    updateRunsActions();
  });

  const lbl = document.createElement('span');
  lbl.className = 'runs-group-label';
  lbl.textContent = String(label);

  const countBadge = document.createElement('span');
  countBadge.className = 'runs-group-meta';
  countBadge.textContent = `${runs.length} ${runs.length === 1 ? 'Eintrag' : 'Einträge'} · ${fmtSize(totalSizeOfRuns(runs))}`;

  summary.append(cb, lbl, countBadge);
  details.appendChild(summary);

  const body = document.createElement('div');
  body.className = 'runs-group-body';
  details.appendChild(body);

  return { details, body };
}

/** Rendert die gruppierte Lauf-Verwaltung. */
function renderGroupedHistory(runs, totalSizeBytes) {
  const now = new Date();
  const nowYear = now.getFullYear();
  const nowMonth = now.toLocaleString('de-DE', { month: 'long', year: 'numeric' });
  const nowDay = now.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' });
  const grouped = groupRunsByDate(runs);

  const wrapper = document.createElement('div');

  // Toolbar.
  const toolbar = document.createElement('div');
  toolbar.className = 'runs-manager-header';
  const totalInfo = document.createElement('span');
  totalInfo.className = 'runs-total-info';
  totalInfo.textContent = `${runs.length} ${runs.length === 1 ? 'Eintrag' : 'Einträge'} · ${fmtSize(totalSizeBytes)} gesamt`;
  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.id = 'runs-delete-btn';
  deleteBtn.className = 'danger';
  deleteBtn.disabled = true;
  deleteBtn.textContent = 'Ausgewählte löschen';
  deleteBtn.addEventListener('click', confirmDeleteRuns);
  const rerunBtn = document.createElement('button');
  rerunBtn.type = 'button';
  rerunBtn.id = 'runs-rerun-btn';
  rerunBtn.className = 'btn';
  rerunBtn.disabled = true;
  rerunBtn.textContent = 'Neu starten';
  rerunBtn.addEventListener('click', rerunSelectedRuns);
  toolbar.append(totalInfo, rerunBtn, deleteBtn);
  wrapper.appendChild(toolbar);

  // Gruppierte Ebenen.
  for (const [year, byMonth] of grouped) {
    const allRunsYear = [...byMonth.values()].flatMap((m) => [...m.values()].flat());
    const { details: yearDetails, body: yearBody } = renderGroupDetails(year, allRunsYear, 'year', year === nowYear);
    wrapper.appendChild(yearDetails);

    for (const [monthLabel, byDay] of byMonth) {
      const allRunsMonth = [...byDay.values()].flat();
      const { details: monthDetails, body: monthBody } = renderGroupDetails(monthLabel, allRunsMonth, 'month', monthLabel === nowMonth);
      yearBody.appendChild(monthDetails);

      for (const [dayLabel, dayRuns] of byDay) {
        const { details: dayDetails, body: dayBody } = renderGroupDetails(dayLabel, dayRuns, 'day', dayLabel === nowDay);
        monthBody.appendChild(dayDetails);

        const ul = document.createElement('ul');
        ul.className = 'runs-list';
        for (const run of dayRuns) {
          ul.appendChild(renderRunEntry(run));
        }
        dayBody.appendChild(ul);
      }
    }
  }

  return wrapper;
}

/** Öffnet den Bestätigungs-Dialog. */
function confirmDeleteRuns() {
  const checked = Array.from(document.querySelectorAll('.run-cb')).filter((cb) => cb.checked);
  if (!checked.length) return;
  const n = checked.length;
  const msg = document.getElementById('runs-delete-msg');
  if (msg) msg.textContent = `${n} Lauf${n === 1 ? '' : 'läufe'} endgültig löschen?`;
  const dlg = /** @type {HTMLDialogElement} */ (document.getElementById('runs-delete-dialog'));
  dlg?.showModal();
}

/** Führt die Löschung aus. */
async function executeDeleteRuns() {
  const ids = Array.from(document.querySelectorAll('.run-cb'))
    .filter((cb) => cb.checked)
    .map((cb) => cb.dataset.id);
  if (!ids.length) return;

  const res = await fetch('/api/runs/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  const data = await res.json();
  const failed = (data.results || []).filter((r) => !r.ok);
  if (failed.length > 0) {
    setStatus('failed', `${failed.length} Lauf/Läufe konnten nicht gelöscht werden.`);
  }
  await loadHistory();
  if (typeof loadHistory === 'function') updateRunsActions();
}

/** Startet einen neuen Lauf mit den Tests der ausgewählten Läufe. */
async function rerunSelectedRuns() {
  const ids = Array.from(document.querySelectorAll('.run-cb'))
    .filter((cb) => cb.checked)
    .map((cb) => cb.dataset.id);
  const runs = ids
    .map((id) => (state.runs || []).find((r) => r.id === id))
    .filter(Boolean);

  // Tests aus allen ausgewählten Läufen zusammenführen (dedupliziert).
  const seen = new Set();
  const allTests = [];
  for (const run of runs) {
    for (const t of (run.originalRequest?.tests || [])) {
      const key = `${t.file}:${t.line}:${t.title}`;
      if (!seen.has(key)) { seen.add(key); allTests.push(t); }
    }
  }

  // Falls keine test-genaue Auswahl vorhanden → Projekt-Ebene verwenden.
  const allProjects = [...new Set(
    runs.flatMap((r) => r.originalRequest?.projects || []),
  )];

  if (!allTests.length && !allProjects.length) {
    revealResults();
    focusResults();
    setStatus('failed', 'Kein ausgewählter Lauf hat eine gespeicherte Test-Auswahl (ältere Läufe).');
    return;
  }

  // grep zusammenführen (nur wenn genau ein Lauf mit grep vorhanden ist).
  const greps = runs.map((r) => r.originalRequest?.grep).filter(Boolean);
  const combinedGrep = greps.length === 1 ? greps[0] : undefined;

  const req = {
    tests: allTests.length ? allTests : undefined,
    files: undefined,
    projects: allProjects.length ? allProjects : undefined,
    grep: combinedGrep,
    environment: currentEnvironment(),
    headed: state.mode === 'headed',
    slowMo: state.slowMo,
    workers: Number($('#workers').value) || 1,
    updateSnapshots: $('#update-snapshots').checked,
    smokeGate: $('#smoke-gate').checked,
  };

  const res = await fetch('/api/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
  });
  const data = await res.json();
  if (!res.ok) {
    revealResults();
    focusResults();
    setStatus('failed', data.error || 'Start fehlgeschlagen.');
    return;
  }
  state.activeRunId = data.id;
  revealResults();
  focusResults();
  $('#log').textContent = '';
  $('#result-table').hidden = true;
  $('#summary').hidden = true;
  $('#blocker').hidden = true;
  $('#log-box').hidden = false;
  $('#log-box').open = true;
  $('#run').disabled = true;
  $('#cancel').disabled = false;
  setStatus('running', 'Tests werden ausgeführt…');
  streamRun(data.id);
}

async function loadHistory() {
  const res = await fetch('/api/runs');
  const data = await res.json();
  state.runs = data.runs || [];
  const el = $('#history');
  if (!data.runs || !data.runs.length) {
    el.innerHTML = '<p class="empty-hint">Noch keine früheren Testergebnisse. Die Liste füllt sich, sobald du einen Testlauf gestartet hast.</p>';
    return;
  }
  el.innerHTML = '';
  el.appendChild(renderGroupedHistory(data.runs, data.totalSizeBytes || 0));
}

async function loadBaselines() {
  const res = await fetch('/api/baselines');
  const data = await res.json();
  const envs = data.environments || [];
  const entries = data.entries || [];
  // Panel nur zeigen, wenn es überhaupt Baselines gibt — sonst stünde ein
  // gefülltes Panel neben einer leeren Historie (wirkt uneinheitlich).
  const panel = $('#baseline-panel');
  if (!entries.length) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  const selA = $('#base-a');
  const selB = $('#base-b');
  for (const sel of [selA, selB]) {
    sel.innerHTML = '';
    for (const env of envs) {
      const opt = document.createElement('option');
      opt.value = env; opt.textContent = env;
      sel.appendChild(opt);
    }
  }
  if (envs.length >= 2) { selA.value = envs[0]; selB.value = envs[1]; }
  // Hinweis, wenn nur eine Umgebung Baselines hat: ein echter Vorher/Nachher-
  // Vergleich braucht zwei (z.B. legacy vs. test, siehe README).
  const note = $('#baseline-note');
  note.hidden = envs.length >= 2;
  state.baselines = data.entries || [];
  const render = () => renderBaselines(selA.value, selB.value);
  selA.onchange = render;
  selB.onchange = render;
  render();
}

function renderBaselines(envA, envB) {
  const el = $('#baselines');
  el.innerHTML = '';
  const entries = state.baselines || [];
  if (!entries.length) {
    el.innerHTML = '<div class="missing">Keine Baselines gefunden. Erst „Baselines aktualisieren" ausführen.</div>';
    return;
  }
  for (const entry of entries) {
    const pair = document.createElement('div');
    pair.className = 'pair';
    const h4 = document.createElement('h4');
    h4.textContent = entry.key;
    pair.appendChild(h4);
    const imgs = document.createElement('div');
    imgs.className = 'imgs';
    for (const env of [envA, envB]) {
      const fig = document.createElement('figure');
      const cap = document.createElement('figcaption');
      cap.textContent = env;
      fig.appendChild(cap);
      const url = entry.perEnv[env];
      if (url) {
        const img = document.createElement('img');
        img.loading = 'lazy';
        img.src = url;
        img.title = 'Zum Vergrößern klicken';
        img.addEventListener('click', () => openLightbox(url, `${entry.key} · ${env}`));
        fig.appendChild(img);
      } else {
        const miss = document.createElement('div');
        miss.className = 'missing';
        miss.textContent = 'keine Baseline';
        fig.appendChild(miss);
      }
      imgs.appendChild(fig);
    }
    pair.appendChild(imgs);
    el.appendChild(pair);
  }
}

// Vollbild-Ansicht eines Referenzbilds (Klick auf Overlay oder Escape schließt).
function openLightbox(url, caption) {
  let box = $('#lightbox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'lightbox';
    box.innerHTML = '<figure><img alt=""><figcaption></figcaption></figure>';
    box.addEventListener('click', () => { box.hidden = true; });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') box.hidden = true; });
    document.body.appendChild(box);
  }
  box.querySelector('img').src = url;
  box.querySelector('figcaption').textContent = caption;
  box.hidden = false;
}

// ---------------------------------------------------------------------------
// Aufräum-Task: Testseiten suchen und löschen
// ---------------------------------------------------------------------------
async function cleanupScan() {
  const result = $('#cleanup-result');
  const delBtn = $('#cleanup-delete');
  delBtn.hidden = true;
  result.innerHTML = '<p class="empty-hint">Suche auf allen Umgebungen…</p>';
  const res = await fetch('/api/cleanup/list');
  const data = await res.json();
  if (!res.ok) {
    result.innerHTML = `<p class="empty-hint">Fehler: ${escapeHtml(data.error || 'unbekannt')}</p>`;
    return;
  }
  result.innerHTML = '';
  let total = 0;
  for (const env of data.environments) {
    const head = document.createElement('p');
    head.className = 'panel-hint';
    head.innerHTML = `<strong>${escapeHtml(env.label)}</strong>: ${env.pages.length ? `${env.pages.length} Testseite(n)` : 'keine Testseiten'}`;
    result.appendChild(head);
    for (const w of env.warnings || []) {
      const p = document.createElement('p');
      p.className = 'empty-hint';
      p.textContent = `Hinweis: ${w}`;
      result.appendChild(p);
    }
    if (!env.pages.length) continue;
    total += env.pages.length;
    const ul = document.createElement('ul');
    ul.className = 'cleanup-list';
    for (const name of env.pages) {
      const li = document.createElement('li');
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'cleanup-cb';
      cb.value = name;
      cb.dataset.env = env.id;
      cb.dataset.envLabel = env.label;
      cb.checked = true;
      const span = document.createElement('span');
      span.textContent = name;
      label.append(cb, span);
      li.appendChild(label);
      ul.appendChild(li);
    }
    result.appendChild(ul);
  }
  const foot = document.createElement('p');
  foot.className = 'empty-hint';
  foot.textContent = total ? `Gesucht unter ${data.playgrounds.join(', ')}.` : `Keine Testseiten unter ${data.playgrounds.join(', ')} gefunden, nichts aufzuräumen.`;
  result.appendChild(foot);
  delBtn.hidden = total === 0;
}

async function cleanupDelete() {
  const checked = $$('.cleanup-cb').filter((cb) => cb.checked);
  if (!checked.length) return;
  // Bestätigung nennt die Umgebungen, auf denen gelöscht wird.
  const perEnv = new Map();
  for (const cb of checked) perEnv.set(cb.dataset.envLabel, (perEnv.get(cb.dataset.envLabel) ?? 0) + 1);
  const where = [...perEnv].map(([l, n]) => `${n} auf ${l}`).join(', ');
  if (!confirm(`Testseiten endgültig löschen: ${where}?`)) return;
  const delBtn = $('#cleanup-delete');
  delBtn.disabled = true;
  const res = await fetch('/api/cleanup/delete', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ items: checked.map((cb) => ({ env: cb.dataset.env, path: cb.value })) }),
  });
  const data = await res.json();
  delBtn.disabled = false;
  if (!res.ok) {
    $('#cleanup-result').innerHTML = `<p class="empty-hint">Fehler: ${escapeHtml(data.error || 'unbekannt')}</p>`;
    return;
  }
  const ok = data.results.filter((r) => r.ok).length;
  const failed = data.results.length - ok;
  // Nach dem Löschen neu suchen, damit die Liste aktuell ist.
  await cleanupScan();
  const summary = document.createElement('p');
  summary.className = 'panel-hint';
  summary.textContent = `${ok} gelöscht${failed ? `, ${failed} fehlgeschlagen` : ''}.`;
  $('#cleanup-result').prepend(summary);
}

// ---------------------------------------------------------------------------
// Reconnect nach Seiten-Refresh: laufenden Test wiedererkennen
// ---------------------------------------------------------------------------
/**
 * Prüft beim Seitenstart, ob der Server noch einen aktiven Lauf hat.
 * Falls ja: UI in den laufenden Zustand versetzen und SSE-Stream neu verbinden.
 * Der Server puffert das Log und schickt es sofort beim Verbindungsaufbau.
 */
async function checkActiveRun() {
  let data;
  try {
    const res = await fetch('/api/status');
    data = await res.json();
  } catch {
    return; // Server nicht erreichbar — still ignorieren.
  }
  if (!data || !data.activeRunId) return;

  const id = data.activeRunId;
  state.activeRunId = id;
  revealResults();
  focusResults();
  $('#log').textContent = '';
  $('#result-table').hidden = true;
  $('#summary').hidden = true;
  $('#blocker').hidden = true;
  $('#log-box').hidden = false;
  $('#log-box').open = true;
  $('#run').disabled = true;
  $('#cancel').disabled = false;
  const envLabel = data.environment ? ` · ${data.environment.split(' (')[0]}` : '';
  const selLabel = data.selection ? ` · ${data.selection}` : '';
  setStatus('running', `Tests werden ausgeführt…${envLabel}${selLabel} (Seite wurde neu geladen — Verbinde Log…)`);
  streamRun(id, data.startedAt);
}

// ---------------------------------------------------------------------------
// Verdrahtung
// ---------------------------------------------------------------------------
$('#cleanup-scan').addEventListener('click', cleanupScan);
$('#cleanup-delete').addEventListener('click', cleanupDelete);
document.getElementById('run-capture')?.addEventListener('click', runCapture);

// Dialog-Buttons für Lauf-Löschen.
document.getElementById('runs-delete-cancel')?.addEventListener('click', () => {
  /** @type {HTMLDialogElement} */ (document.getElementById('runs-delete-dialog'))?.close();
});
document.getElementById('runs-delete-confirm')?.addEventListener('click', async () => {
  /** @type {HTMLDialogElement} */ (document.getElementById('runs-delete-dialog'))?.close();
  await executeDeleteRuns();
});
// "Alle": alle Tests des gesamten Katalogs wählen (nicht nur die gefilterten).
$('#select-all').addEventListener('click', () => {
  // Nur in der aktuellen Umgebung verfügbare Tests wählen.
  for (const { test } of allCatalogTests()) {
    if (isTestAllowedInSelectedEnv(test)) {
      state.selectedKeys.add(testKey(test.file, test.line, test.title));
    }
  }
  renderCatalog();
  afterSelectionReset();
});
$('#select-none').addEventListener('click', () => {
  state.selectedKeys.clear();
  renderCatalog();
  afterSelectionReset();
});

// Suchfeld: filtert den Katalog live; Auswahl bleibt über selectedKeys erhalten.
$('#catalog-search').addEventListener('input', (e) => {
  state.searchTerm = e.target.value;
  renderCatalog();
  syncParentCheckboxes();
});
$('#refresh-catalog').addEventListener('click', () => loadCatalog(true));
$$('#mode-cards .card').forEach((card) =>
  card.addEventListener('click', () => {
    if (card.disabled) return;
    state.mode = card.dataset.mode;
    renderModeCards();
    savePrefs();
    updatePreview();
  }));
['#grep', '#repeat-each', '#update-snapshots', '#smoke-gate'].forEach((sel) =>
  $(sel).addEventListener('input', () => { savePrefs(); updatePreview(); }));
$$('#slowmo-steps button').forEach((btn) =>
  btn.addEventListener('click', () => {
    state.slowMo = Number(btn.dataset.ms) || 0;
    renderSlowmoSteps();
    savePrefs();
    updatePreview();
  }));
$('#run').addEventListener('click', startRun);
$('#cancel').addEventListener('click', cancelRun);
$('#toggle-advanced').addEventListener('click', toggleAdvanced);
$('#open-uimode').addEventListener('click', openUiMode);
$('#shutdown').addEventListener('click', shutdownApp);

// Start: zuletzt verwendete Optionen anwenden, dann zeichnen.
applyPrefsControls();
renderModeCards();
renderSlowmoSteps();
loadEnvironments().then(() => loadCatalog());
// Historie und Baselines sofort laden — keine Interaktion nötig.
loadHistory().catch(() => {});
loadBaselines().catch(() => {});
// Nach Seiten-Refresh: laufenden Test erkennen und SSE-Stream wieder verbinden.
checkActiveRun().catch(() => {});
