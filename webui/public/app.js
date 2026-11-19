// Einstieg der Web-UI: Reiter-Routing, Theme, Lauf-Anzeige im Kopf, Beenden.
// Vanilla-JS mit ES-Modulen, kein Build-Schritt. Die bisherige Oberfläche liegt
// unverändert unter /legacy/ (Fallback bis zur Abnahme).
import { $, $$, on, loadPrefs, api, confirmDialog } from './js/core.js';
import { resolveTheme } from './js/logic.js';
import * as testrun from './js/testrun.js';
import * as results from './js/results.js';
import * as history from './js/history.js';
import * as tools from './js/tools.js';

// ---------------------------------------------------------------------------
// Theme: gespeicherte Wahl, sonst Systemeinstellung. Das Setzen vor dem ersten
// Zeichnen passiert im <head> von index.html.
// ---------------------------------------------------------------------------
const THEME_KEY = 'aem-webui-theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');

function storedTheme() {
  try { return localStorage.getItem(THEME_KEY); } catch { return null; }
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const toggle = $('#theme-toggle');
  toggle.setAttribute('aria-label', theme === 'dark' ? 'Zum hellen Theme wechseln' : 'Zum dunklen Theme wechseln');
}

function initTheme() {
  applyTheme(resolveTheme(storedTheme(), media.matches));
  $('#theme-toggle').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(THEME_KEY, next); } catch { /* privater Modus */ }
    applyTheme(next);
  });
  // Ohne eigene Wahl dem System folgen.
  media.addEventListener('change', () => {
    if (!storedTheme()) applyTheme(resolveTheme(null, media.matches));
  });
}

// ---------------------------------------------------------------------------
// Reiter (Hash-Routing: #/testlauf, #/ergebnisse, #/werkzeuge)
// ---------------------------------------------------------------------------
const TABS = ['testlauf', 'ergebnisse', 'werkzeuge'];
const TITLES = { testlauf: 'Testlauf', ergebnisse: 'Ergebnisse', werkzeuge: 'Werkzeuge' };

function currentTab() {
  const m = location.hash.match(/^#\/([a-z]+)/);
  return m && TABS.includes(m[1]) ? m[1] : 'testlauf';
}

function route() {
  const tab = currentTab();
  for (const t of TABS) {
    const selected = t === tab;
    $(`#tab-${t}`).hidden = !selected;
    const link = $(`#tab-btn-${t}`);
    link.setAttribute('aria-selected', String(selected));
    link.tabIndex = selected ? 0 : -1;
  }
  document.title = `${TITLES[tab]} · AEM Testautomatisierung`;
  if (tab === 'werkzeuge') tools.onShow();
  if (tab === 'testlauf') testrun.onShow();
}

function initTabs() {
  $('.tabs').addEventListener('keydown', (e) => {
    const keys = { ArrowRight: 1, ArrowLeft: -1 };
    if (!(e.key in keys) && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const i = TABS.indexOf(currentTab());
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1
      : (i + keys[e.key] + TABS.length) % TABS.length;
    location.hash = `#/${TABS[next]}`;
    $(`#tab-btn-${TABS[next]}`).focus();
  });
  window.addEventListener('hashchange', route);
}

// ---------------------------------------------------------------------------
// Lauf-Anzeige im Kopf (unabhängig vom offenen Reiter)
// ---------------------------------------------------------------------------
function initRunIndicators() {
  const pill = $('#run-pill');
  const dot = $('#tab-dot');
  pill.addEventListener('click', () => { location.hash = '#/ergebnisse'; });
  on('run-state', (d) => {
    pill.hidden = !d.running;
    if (d.running) $('#run-pill-text').textContent = `Lauf aktiv · ${d.elapsed || '0:00'}`;
    const known = ['running', 'passed', 'failed', 'flaky'];
    dot.hidden = !known.includes(d.status);
    dot.dataset.status = d.status;
  });
}

// ---------------------------------------------------------------------------
// Beenden
// ---------------------------------------------------------------------------
function initShutdown() {
  $('#shutdown').addEventListener('click', async () => {
    const ok = await confirmDialog({
      title: 'Anwendung beenden?',
      message: 'Der lokale Service stoppt und gibt den Port frei.',
      confirmLabel: 'Beenden',
      danger: true,
    });
    if (!ok) return;
    await api('/api/shutdown', {});
    document.body.innerHTML =
      '<p style="padding:48px;text-align:center;font-family:system-ui;color:#5f6166">' +
      'Die Anwendung wurde beendet. Dieses Fenster kann geschlossen werden.</p>';
  });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
async function main() {
  initTheme();
  loadPrefs();
  testrun.init();
  results.init();
  history.init();
  tools.init();
  initTabs();
  initRunIndicators();
  initShutdown();
  route();

  // Laufenden Lauf nach Reload wiedererkennen und zur Ergebnisansicht wechseln.
  results.resumeActiveRun().then((resumed) => {
    if (resumed && !location.hash) location.hash = '#/ergebnisse';
  }).catch(() => {});

  await testrun.loadEnvironments();
  await testrun.loadCatalog();
}

main();
