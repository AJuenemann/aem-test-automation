// Einstieg des Cockpits: Sprache, Reiter-Routing, Theme, Lauf-Anzeige im Kopf, Beenden.
// Vanilla-JS mit ES-Modulen, kein Build-Schritt. Die bisherige Oberfläche liegt
// unverändert unter /legacy/ (Fallback bis zur Abnahme).
import { $, $$, on, emit, state, loadPrefs, api, confirmDialog } from './js/core.js';
import { resolveTheme, resolveLang } from './js/logic.js';
import { t, setLang, getLang, LANG_KEY, LANG_SERVER_KEY } from './js/i18n.js';
import * as testrun from './js/testrun.js';
import * as results from './js/results.js';
import * as history from './js/history.js';
import * as tools from './js/tools.js';

// ---------------------------------------------------------------------------
// Sprache: gespeicherte Wahl, sonst Systemsprache (de* -> Deutsch, sonst Englisch).
// Das Setzen von <html lang> vor dem ersten Zeichnen passiert im <head> von index.html.
// ---------------------------------------------------------------------------
function storedLang() {
  try { return localStorage.getItem(LANG_KEY); } catch { return null; }
}

/** Übersetzt alle Elemente mit data-i18n, data-i18n-title, -aria-label und -placeholder. */
function applyStatic() {
  $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  const attrs = [['title', 'i18nTitle'], ['aria-label', 'i18nAriaLabel'], ['placeholder', 'i18nPlaceholder']];
  for (const [attr, key] of attrs) {
    $$(`[data-i18n-${attr}]`).forEach((el) => el.setAttribute(attr, t(el.dataset[key])));
  }
}

/** Sprache setzen und die Oberfläche neu beschriften. Die Module zeichnen sich über `lang-change` neu. */
function applyLang(lang) {
  setLang(lang);
  document.documentElement.lang = lang;
  applyStatic();
  const btn = $('#lang-toggle');
  $('#lang-toggle-text').textContent = lang.toUpperCase();
  const label = t('lang.toggle', { name: t(`lang.name.${lang}`) });
  btn.setAttribute('aria-label', label);
  btn.title = label;
  applyTheme(document.documentElement.dataset.theme);
  updateTitle();
  renderPill();
  emit('lang-change', { lang });
}

const systemLanguages = () => navigator.languages || [navigator.language];
let langChosenInSession = false;

function initLang() {
  applyLang(resolveLang(storedLang(), systemLanguages()));
  $('#lang-toggle').addEventListener('click', () => {
    const next = getLang() === 'de' ? 'en' : 'de';
    langChosenInSession = true;
    try {
      localStorage.setItem(LANG_KEY, next);
      localStorage.setItem(LANG_SERVER_KEY, state.serverStartId || '');
    } catch { /* privater Modus */ }
    applyLang(next);
  });
}

/**
 * Wie bei der Umgebung gilt die gespeicherte Sprachwahl nur, solange derselbe Dienst läuft
 * (Reload). Nach einem Neustart von `npm run cockpit` gilt wieder die Systemsprache.
 * Aufruf, sobald die Start-Kennung des Dienstes bekannt ist.
 */
function syncLangWithServer() {
  const id = state.serverStartId;
  if (!id) return;
  try {
    if (langChosenInSession) { localStorage.setItem(LANG_SERVER_KEY, id); return; }
    if (!storedLang() || localStorage.getItem(LANG_SERVER_KEY) === id) return;
    localStorage.removeItem(LANG_KEY);
    localStorage.removeItem(LANG_SERVER_KEY);
  } catch { return; }
  applyLang(resolveLang(null, systemLanguages()));
}

// ---------------------------------------------------------------------------
// Theme: gespeicherte Wahl, sonst Systemeinstellung. Das Setzen vor dem ersten
// Zeichnen passiert im <head> von index.html.
// ---------------------------------------------------------------------------
const THEME_KEY = 'aem-cockpit-theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');

function storedTheme() {
  try { return localStorage.getItem(THEME_KEY); } catch { return null; }
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const toggle = $('#theme-toggle');
  toggle.setAttribute('aria-label', theme === 'dark' ? t('theme.toLight') : t('theme.toDark'));
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

function currentTab() {
  const m = location.hash.match(/^#\/([a-z]+)/);
  return m && TABS.includes(m[1]) ? m[1] : 'testlauf';
}

function updateTitle() {
  document.title = `${t(`tab.${currentTab()}`)} · ${t('app.title')}`;
}

function route() {
  const tab = currentTab();
  for (const name of TABS) {
    const selected = name === tab;
    $(`#tab-${name}`).hidden = !selected;
    const link = $(`#tab-btn-${name}`);
    link.setAttribute('aria-selected', String(selected));
    link.tabIndex = selected ? 0 : -1;
  }
  updateTitle();
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
let pillState = { running: false, elapsed: '' };

function renderPill() {
  const pill = $('#run-pill');
  pill.hidden = !pillState.running;
  if (pillState.running) {
    $('#run-pill-text').textContent = t('top.runPill.elapsed', { elapsed: pillState.elapsed || '0:00' });
  }
}

function initRunIndicators() {
  const pill = $('#run-pill');
  const dot = $('#tab-dot');
  pill.addEventListener('click', () => { location.hash = '#/ergebnisse'; });
  on('run-state', (d) => {
    pillState = { running: !!d.running, elapsed: d.elapsed };
    renderPill();
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
      title: t('shutdown.dialog.title'),
      message: t('shutdown.dialog.message'),
      confirmLabel: t('shutdown.dialog.confirm'),
      danger: true,
    });
    if (!ok) return;
    await api('/api/shutdown', {});
    const note = document.createElement('p');
    note.style.cssText = 'padding:48px;text-align:center;font-family:system-ui;color:#5f6166';
    note.textContent = t('shutdown.done');
    document.body.replaceChildren(note);
  });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
async function main() {
  initLang();
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
  syncLangWithServer();
  await testrun.loadCatalog();
}

main();
