// Übersetzungskern der Web-UI (ohne DOM, unter Node importierbar).
// Wörterbücher: js/i18n/de.js und js/i18n/en.js (flache Schlüssel -> Text).
// Der Default ist Deutsch: so liefern die reinen Logik-Tests ohne Browser deutsche Texte.
import de from './i18n/de.js';
import en from './i18n/en.js';

export const LANGS = ['de', 'en'];
export const DICTIONARIES = { de, en };
export const LANG_KEY = 'aem-webui-lang';
/** Start-Kennung des Dienstes, zu der die gespeicherte Sprachwahl gehört (neuer Start = Systemsprache). */
export const LANG_SERVER_KEY = 'aem-webui-lang-server';

let current = 'de';

/** Setzt die Sprache. Unbekannte Werte werden ignoriert. */
export function setLang(lang) {
  if (LANGS.includes(lang)) current = lang;
}
export const getLang = () => current;

/** Locale für Datum, Zeit und Zahlen. */
export const locale = () => (current === 'en' ? 'en-US' : 'de-DE');

/** Ersetzt {name}-Platzhalter. Fehlende Werte bleiben als Platzhalter stehen. */
function fill(text, params) {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));
}

function lookup(key) {
  return DICTIONARIES[current][key] ?? DICTIONARIES.de[key];
}

/** Text zum Schlüssel. Fallback: Deutsch, dann der Schlüssel selbst. */
export function t(key, params) {
  const text = lookup(key);
  return text === undefined ? key : fill(text, params);
}

/** true, wenn der Schlüssel im Wörterbuch der aktuellen Sprache oder im deutschen steht. */
export const hasKey = (key) => lookup(key) !== undefined;

/**
 * Pluralform: sucht `<key>.<one|other>` nach Intl.PluralRules der aktuellen Sprache.
 * {n} steht automatisch zur Verfügung.
 */
export function tn(key, n, params) {
  const form = new Intl.PluralRules(locale()).select(n);
  const k = hasKey(`${key}.${form}`) ? `${key}.${form}` : `${key}.other`;
  return t(k, { n, ...params });
}
