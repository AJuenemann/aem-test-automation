// Gemeinsamer Kern des Cockpits: Zustand, Einstellungen, API-Helfer, Dialog, Toast.
import { esc } from './logic.js';
import { t, hasKey, getLang } from './i18n.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export { esc };

/** SVG-Icon aus dem Sprite in index.html. */
export const icon = (name, cls = '') =>
  `<svg class="icon ${cls}" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;

// --- Ereignisse zwischen den Modulen (vermeidet zyklische Importe) ----------
const bus = new EventTarget();
export const emit = (type, detail) => bus.dispatchEvent(new CustomEvent(type, { detail }));
export const on = (type, fn) => bus.addEventListener(type, (e) => fn(e.detail));

// --- Zustand -----------------------------------------------------------------
export const state = {
  catalog: { groups: [] },
  environments: [],
  selectedEnvId: null,
  mode: 'headless',
  slowMo: 0,
  // Weitere Optionen. workers bleibt intern 1: AEM verträgt keinen parallelen Zugriff.
  options: { grep: '', repeatEach: 1, updateSnapshots: false, smokeGate: false },
  stepMode: 'single', // single = Assistent (ein Schritt offen), all = alle Schritte offen
  openStep: 1,
  // Gewählte Tests als Schlüssel (überlebt Filtern und Neu-Rendern).
  selectedKeys: new Set(),
  searchTerm: '',
  runs: [],
  activeRunId: null,
  /** Kennung des laufenden Dienstes (wechselt bei jedem Start von npm run cockpit). */
  serverStartId: null,
};

// --- Anzeigenamen je Sprache (der Server liefert `labelEn`/`descriptionEn` additiv) ----------
const english = () => getLang() === 'en';
/** Stabiler Schlüssel einer Katalog-Gruppe (unabhängig von der Sprache). */
export const groupKey = (group) => group.tag ?? 'other';
export const groupLabel = (group) => (english() && group.labelEn) || group.label;
export const groupDescription = (group) => (english() && group.descriptionEn) || group.description;
/** Voller Umgebungs-Label, z. B. „DEV (Entwicklung, …)“ bzw. „DEV (development, …)“. */
export const envLabel = (env) => (english() && env?.labelEn) || env?.label || '';
/** Kurzname vor der Klammer, z. B. „DEV“. Sprachneutral. */
export const envShort = (label) => (label || '').split(' (')[0];

/**
 * Testnamen kommen aus den Tests: deutsch, in der Annotation `_title-en`/`_describe-en` auch englisch.
 * In der englischen Oberfläche gilt der englische Name, sonst der deutsche.
 */
export const testTitle = (item) => (english() && item.titleEn) || item.title;
export const suiteLabel = (file) => (english() && file.labelEn) || file.label;

/**
 * Texte aus den Tests (Titel ohne englischen Namen, Dateinamen, Fehlertexte) sind deutsch. Zeigt die
 * englische Oberfläche sie an, bekommen die Elemente `lang="de"`, damit Screenreader sie richtig aussprechen.
 * `translated`: Der Text liegt bereits auf Englisch vor.
 */
export const contentLangAttr = (translated = false) => (english() && !translated ? ' lang="de"' : '');
export const markContent = (el, translated = false) => {
  if (english() && !translated) el.lang = 'de'; else el.removeAttribute('lang');
  return el;
};

export const currentEnvironment = () =>
  state.environments.find((e) => e.id === state.selectedEnvId);

/** Gemeinsame Felder jeder Lauf-Anforderung (Auswahl kommt vom Aufrufer). */
export function baseRunFields() {
  return {
    environment: currentEnvironment(),
    headed: state.mode === 'headed',
    slowMo: state.slowMo,
    workers: 1,
    updateSnapshots: state.options.updateSnapshots,
    smokeGate: state.options.smokeGate,
  };
}

// --- Einstellungen (localStorage) ---------------------------------------------
// Eigener Schlüssel (v2): die alte Oberfläche unter /legacy/ nutzt v1 weiter.
// Bewusst ohne Testauswahl: die wechselt je Vorhaben.
const PREFS_KEY = 'aem-cockpit-prefs-v2';

export function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({
      mode: state.mode,
      slowMo: state.slowMo,
      selectedEnvId: state.selectedEnvId,
      serverStartId: state.serverStartId,
      options: state.options,
      stepMode: state.stepMode,
    }));
  } catch { /* localStorage nicht verfügbar (z.B. privater Modus) */ }
}

export function loadPrefs() {
  let p = null;
  try { p = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null'); } catch { /* ignorieren */ }
  if (!p) return;
  if (p.mode === 'headless' || p.mode === 'headed') state.mode = p.mode;
  if (typeof p.slowMo === 'number') state.slowMo = p.slowMo;
  if (p.stepMode === 'single' || p.stepMode === 'all') state.stepMode = p.stepMode;
  const o = p.options || {};
  if (typeof o.grep === 'string') state.options.grep = o.grep;
  if (Number(o.repeatEach) >= 1) state.options.repeatEach = Number(o.repeatEach);
  if (typeof o.updateSnapshots === 'boolean') state.options.updateSnapshots = o.updateSnapshots;
  if (typeof o.smokeGate === 'boolean') state.options.smokeGate = o.smokeGate;
  state._prefEnv = p.selectedEnvId;
  state._prefServerId = p.serverStartId;
}

// --- API ---------------------------------------------------------------------
/** JSON-Anfrage. Gibt { ok, status, data } zurück und wirft nie bei HTTP-Fehlern. */
export async function api(url, body) {
  const init = body === undefined ? {} : {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
  try {
    const res = await fetch(url, init);
    let data = null;
    try { data = await res.json(); } catch { /* leere Antwort */ }
    return { ok: res.ok, status: res.status, data: data || {} };
  } catch (err) {
    return { ok: false, status: 0, data: { error: t('net.error', { message: err.message }) } };
  }
}

/**
 * Fehlertext einer API-Antwort in der aktiven Sprache. Der Server liefert zu bekannten Fehlern
 * `code` und `params` (Schlüssel `err.<code>`), sonst gilt sein `error`-Text.
 */
export function apiError(data, fallback = '') {
  if (data?.code && hasKey(`err.${data.code}`)) return t(`err.${data.code}`, data.params);
  return data?.error || fallback;
}

// --- Toast -------------------------------------------------------------------
let toastTimer = null;
/** Kurze Rückmeldung unten rechts. kind: info | error | success. */
export function toast(message, kind = 'info') {
  const el = $('#toast');
  if (!el) return;
  el.className = `toast toast-${kind}`;
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, kind === 'error' ? 8000 : 4500);
}

// --- Bestätigungsdialog --------------------------------------------------------
/**
 * Bestätigung über <dialog>. Gibt true zurück, wenn bestätigt wurde.
 * @param {{title:string, message:string, detail?:string, confirmLabel?:string, danger?:boolean}} o
 */
export function confirmDialog(o) {
  const dlg = $('#confirm-dialog');
  $('#confirm-title').textContent = o.title;
  $('#confirm-message').textContent = o.message;
  const detail = $('#confirm-detail');
  detail.textContent = o.detail || '';
  detail.hidden = !o.detail;
  const ok = $('#confirm-ok');
  ok.textContent = o.confirmLabel || t('dialog.confirm.ok');
  ok.className = o.danger ? 'btn btn-danger' : 'btn btn-primary';
  return new Promise((resolve) => {
    const done = (value) => {
      dlg.removeEventListener('close', onClose);
      resolve(value);
    };
    const onClose = () => done(dlg.returnValue === 'ok');
    dlg.returnValue = 'cancel';
    dlg.addEventListener('close', onClose);
    dlg.showModal();
  });
}
