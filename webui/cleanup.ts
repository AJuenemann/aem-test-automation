/**
 * Erkennung von Testseiten anhand des Namensschemas, für den Aufräum-Task.
 * Reines Modul (kein I/O) -> unit-testbar.
 *
 * Schema (siehe fixtures/test-fixtures.ts):
 *   <level>-<testslug>-<JJJJMMTT>-<HHMMSS>-<uuid4>
 * Nur Namen, die diesem Muster entsprechen und DIREKT unter einer Spielwiese
 * liegen, werden als löschbare Testrückstände erkannt (bewusst eng, damit nichts
 * Fremdes getroffen wird). Das alte `mvp-*` ist NICHT enthalten (Altlast,
 * separat einmalig entfernt).
 */

/** Bekannte Test-Level (Namenspräfix). Spiegelt TEST_LEVELS der Fixtures. */
export const CLEANUP_LEVELS = [
  'smoke',
  'level1',
  'level2-components',
  'integration',
  'regression',
  'unit',
] as const;

// <level>-<slug>-JJJJMMTT-HHMMSS-<hex>[.ext]  (slug: a-z0-9 mit Bindestrichen; .ext für DAM-Assets)
const TEST_PAGE_RE = new RegExp(
  `^(?:${CLEANUP_LEVELS.join('|')})-[a-z0-9-]+-\\d{8}-\\d{6}-[0-9a-f]+(?:\\.[a-z0-9]{1,5})?$`,
);

/** True, wenn der Knotenname eine von uns erzeugte Testseite ist. */
export function isTestPageName(name: string): boolean {
  return TEST_PAGE_RE.test(name);
}

/** Filtert aus einer Liste von Knotennamen die löschbaren Testseiten. */
export function selectTestPages(names: string[]): string[] {
  return names.filter(isTestPageName).sort();
}

/**
 * True, wenn `path` eine Testseite direkt unter einer der Spielwiesen ist
 * (Schutz gegen manipulierte Lösch-Anfragen: keine Tiefe, kein `..`).
 */
export function isAllowedCleanupPath(path: string, roots: string[]): boolean {
  const i = path.lastIndexOf('/');
  return i > 0 && roots.includes(path.slice(0, i)) && isTestPageName(path.slice(i + 1));
}
