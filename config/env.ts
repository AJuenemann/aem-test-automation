import dotenv from 'dotenv';

// `.env` laden, sofern vorhanden. In CI werden die Werte stattdessen
// über echte Umgebungsvariablen / Secrets bereitgestellt.
dotenv.config();

/**
 * Logischer Umgebungsname. Steuert u.a. die Trennung der
 * Screenshot-Baselines (siehe snapshotPathTemplate in der Playwright-Config).
 */
export type AemEnvName = 'test' | 'dev' | 'legacy';

export interface AemConfig {
  /** Basis-URL der AEM-Author-Instanz, ohne abschließenden Slash. */
  baseUrl: string;
  /** Logischer Umgebungsname (test | dev | legacy). */
  env: AemEnvName;
  /** Benutzername für den Author-Login. */
  user: string;
  /** Passwort für den Author-Login. */
  password: string;
  /** Pfad der Spielwiese; nur hier sind Schreiboperationen erlaubt. */
  playgroundPath: string;
  /** Spielwiese im Visitenkarten-Bereich (LDAP-Import erzwingt /content/businesscards/...). */
  businesscardPlaygroundPath: string;
  /** Spielwiese in der DAM (Asset-Upload). */
  damPlaygroundPath: string;
  /** Nur-lesender Pfad (Zentralverwaltung) für Smoke-Checks. */
  readonlyPath: string;
  /** Wurzelpfad der Komponenten-Beispielseiten (/content/samples/...). */
  samplesRoot: string;
}

/**
 * Konfiguration der Publish-Instanz für die visuelle Regression. `url` ist
 * leer, wenn weder AEM_PUBLISH_URL gesetzt noch aus der Author-URL ableitbar
 * ist; `reason` erklärt dann, warum Publish-Tests übersprungen werden.
 */
export interface PublishConfig {
  /** Basis-URL der Publish-Instanz, ohne Slash, oder leer wenn nicht verfügbar. */
  url: string;
  /** Grund für das Fehlen der URL (für test.skip-Meldung). Leer bei Erfolg. */
  reason: string;
}

class MissingEnvError extends Error {
  constructor(missing: string[]) {
    super(
      `Fehlende Umgebungsvariable(n): ${missing.join(', ')}.\n` +
        `Bitte .env.example nach .env kopieren und die Werte eintragen ` +
        `(oder die Variablen in der CI als Secrets setzen).`,
    );
    this.name = 'MissingEnvError';
  }
}

function requireEnv(name: string, missing: string[]): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === '') {
    missing.push(name);
    return '';
  }
  return value.trim();
}

function normalizeEnvName(raw: string): AemEnvName {
  const value = raw.toLowerCase();
  if (value === 'test' || value === 'dev' || value === 'legacy') {
    return value;
  }
  throw new Error(
    `Ungültiger Wert für AEM_ENV: "${raw}". Erlaubt sind: test | dev | legacy.`,
  );
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function normalizePath(p: string): string {
  // Führenden Slash sicherstellen, abschließende Slashes entfernen.
  const withLeading = p.startsWith('/') ? p : `/${p}`;
  return withLeading.replace(/\/+$/, '') || '/';
}

let cached: AemConfig | undefined;

/**
 * Liest und validiert die AEM-Konfiguration aus den Umgebungsvariablen.
 * Wirft eine aussagekräftige Fehlermeldung, wenn Pflichtwerte fehlen.
 */
export function getAemConfig(): AemConfig {
  if (cached) {
    return cached;
  }

  const missing: string[] = [];

  const baseUrl = requireEnv('AEM_BASE_URL', missing);
  const envRaw = requireEnv('AEM_ENV', missing);
  const user = requireEnv('AEM_USER', missing);
  const password = requireEnv('AEM_PASSWORD', missing);

  // Optionale Werte mit sinnvollen Defaults.
  const playgroundPath = process.env.AEM_PLAYGROUND_PATH?.trim() || '/content/fhgtest';
  const businesscardPlaygroundPath =
    process.env.AEM_BUSINESSCARD_PLAYGROUND_PATH?.trim() || '/content/businesscards/fhgtest';
  const damPlaygroundPath = process.env.AEM_DAM_PLAYGROUND_PATH?.trim() || '/content/dam/fhgtest';
  const readonlyPath = process.env.AEM_READONLY_PATH?.trim() || '/content/zv';
  const samplesRoot = process.env.AEM_SAMPLES_ROOT?.trim() || '/content/samples/de/components';

  if (missing.length > 0) {
    throw new MissingEnvError(missing);
  }

  cached = {
    baseUrl: stripTrailingSlash(baseUrl),
    env: normalizeEnvName(envRaw),
    user,
    password,
    playgroundPath: normalizePath(playgroundPath),
    businesscardPlaygroundPath: normalizePath(businesscardPlaygroundPath),
    damPlaygroundPath: normalizePath(damPlaygroundPath),
    readonlyPath: normalizePath(readonlyPath),
    samplesRoot: normalizePath(samplesRoot),
  };

  return cached;
}

/**
 * Leitet eine Publish-URL aus einer Author-URL ab, indem das Host-Präfix
 * `aem-author-` durch `aem-publish1-` ersetzt wird (Fraunhofer-Namensschema).
 * Gibt leer zurück, wenn die URL dem Schema nicht entspricht.
 *
 * Exportiert für Unit-Tests (ohne AEM).
 */
export function derivePublishUrl(authorUrl: string): string {
  const base = stripTrailingSlash(authorUrl.trim());
  if (base === '' || !/aem-author-/.test(base)) {
    return '';
  }
  return base.replace('aem-author-', 'aem-publish1-');
}

/**
 * Ermittelt die Publish-Konfiguration für die visuelle Regression.
 * Vorrang: explizite AEM_PUBLISH_URL. Fallback: Ableitung aus AEM_BASE_URL
 * (author->publish1). Ist keine URL ermittelbar, trägt `reason` den Grund für
 * ein sauberes test.skip.
 *
 * Reine Funktion der übergebenen Rohwerte (für Unit-Tests ohne AEM-Config).
 */
export function resolvePublishConfig(params: {
  publishUrlRaw?: string;
  authorUrlRaw?: string;
}): PublishConfig {
  const explicit = stripTrailingSlash((params.publishUrlRaw ?? '').trim());
  if (explicit !== '') {
    return { url: explicit, reason: '' };
  }
  const derived = derivePublishUrl(params.authorUrlRaw ?? '');
  if (derived !== '') {
    return { url: derived, reason: '' };
  }
  return {
    url: '',
    reason:
      'Keine Publish-URL: AEM_PUBLISH_URL nicht gesetzt und aus AEM_BASE_URL ' +
      'nicht ableitbar (erwartet Host-Präfix "aem-author-").',
  };
}

/**
 * Publish-Konfiguration aus den Prozess-Umgebungsvariablen (AEM_PUBLISH_URL,
 * Fallback AEM_BASE_URL).
 */
export function getPublishConfig(): PublishConfig {
  return resolvePublishConfig({
    publishUrlRaw: process.env.AEM_PUBLISH_URL,
    authorUrlRaw: process.env.AEM_BASE_URL,
  });
}

/**
 * Pfad-Guard: stellt sicher, dass ein Zielpfad innerhalb einer Spielwiese
 * liegt. Ohne explizite Angabe gelten AEM_PLAYGROUND_PATH und die
 * Visitenkarten-Spielwiese AEM_BUSINESSCARD_PLAYGROUND_PATH (setzt den
 * Testdaten-Scope technisch durch).
 *
 * @throws Error wenn der Pfad außerhalb aller Spielwiesen liegt.
 */
export function assertWithinPlayground(targetPath: string, playgroundPath?: string | string[]): void {
  const cfg = playgroundPath === undefined ? getAemConfig() : undefined;
  const roots = (cfg ? [cfg.playgroundPath, cfg.businesscardPlaygroundPath, cfg.damPlaygroundPath] : ([] as string[]).concat(playgroundPath ?? []))
    .map(normalizePath);
  const target = normalizePath(targetPath);
  const isInside = roots.some((root) => target === root || target.startsWith(`${root}/`));
  if (!isInside) {
    throw new Error(
      `Pfad-Guard: Schreiboperation außerhalb der Spielwiese blockiert.\n` +
        `  Ziel:       ${target}\n` +
        `  Erlaubt nur unterhalb von: ${roots.join(', ')}`,
    );
  }
}
