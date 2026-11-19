/**
 * Reine Helfer für Lauf-Historie und Baseline-Pfadauflösung (kein I/O).
 * Das Datei-Scannen macht der Server; hier nur Sortier-/Pfad-Logik, damit
 * unit-testbar ohne Dateisystem.
 */

/** Metadaten eines Laufs (als meta.json je Lauf gespeichert). */
export interface RunMeta {
  id: string;
  /** ISO-Zeitstempel des Starts. */
  startedAt: string;
  /** Umgebungs-Label (z.B. "TEST (...)"). */
  environment?: string;
  /** Kurzbeschreibung der Auswahl (z.B. "unit" oder "3 Tests"). */
  selection?: string;
  /** Endstatus: passed | failed | cancelled | running. */
  status: string;
  /** Kurz-Summary (total/passed/failed), optional. */
  /** `flaky` = instabil bestanden. Ältere Läufe ergänzt listRuns einmalig aus report.json. */
  summary?: { total: number; passed: number; failed: number; flaky?: number };
  /** Größe des Lauf-Verzeichnisses in Bytes (meta + report + html + artifacts). */
  sizeBytes?: number;
  /**
   * Ursprüngliche Test-Auswahl — ermöglicht „Neu starten" aus der Historie.
   * Fehlt bei Läufen, die vor dieser Änderung erstellt wurden.
   */
  originalRequest?: {
    tests?: Array<{ file: string; line: number; title?: string }>;
    files?: string[];
    projects?: string[];
    grep?: string;
  };
  /**
   * Lauf-Einstellungen zum Nachvollziehen (Modus, Tempo, Wiederholungen …).
   * Fehlt bei Läufen vor dem 19.11.2026. „Neu starten" übernimmt sie bewusst
   * nicht, sondern nutzt die aktuelle Auswahl der Oberfläche.
   */
  settings?: RunSettings;
}

/** Ausführungs-Einstellungen eines Laufs, wie sie in meta.json stehen. */
export interface RunSettings {
  headed: boolean;
  /** Verlangsamung in ms pro Aktion; 0 = Normal (nur sichtbar wirksam). */
  slowMo: number;
  repeatEach: number;
  workers: number;
  smokeGate: boolean;
  updateSnapshots: boolean;
}

/** Leitet die zu speichernden Einstellungen aus der Lauf-Anforderung ab. */
export function runSettingsFrom(req: {
  headed?: boolean;
  slowMo?: number;
  repeatEach?: number;
  workers?: number;
  smokeGate?: boolean;
  updateSnapshots?: boolean;
}): RunSettings {
  const headed = !!req.headed;
  return {
    headed,
    // Wie buildRun: Tempo wirkt nur im sichtbaren Lauf.
    slowMo: headed && typeof req.slowMo === 'number' && req.slowMo > 0 ? Math.floor(req.slowMo) : 0,
    repeatEach: typeof req.repeatEach === 'number' && req.repeatEach > 1 ? req.repeatEach : 1,
    workers: typeof req.workers === 'number' && req.workers >= 1 ? req.workers : 1,
    smokeGate: !!req.smokeGate,
    updateSnapshots: !!req.updateSnapshots,
  };
}

/**
 * Sortiert Lauf-Metadaten absteigend nach Startzeit (neueste zuerst).
 */
export function sortRunsNewestFirst(runs: RunMeta[]): RunMeta[] {
  return [...runs].sort((a, b) => {
    const ta = Date.parse(a.startedAt) || 0;
    const tb = Date.parse(b.startedAt) || 0;
    return tb - ta;
  });
}

/**
 * Baut den Baseline-Pfad eines Screenshots für eine Umgebung gemäß dem
 * `snapshotPathTemplate` der Playwright-Config:
 *   {testDir}/__snapshots__/<env>/{testFilePath}/{arg}{ext}
 *
 * @param env           Umgebungsname (test | dev | legacy).
 * @param testFilePath  Spec-Pfad relativ zum testDir (z.B. basics/visual-regression.spec.ts).
 * @param arg           Snapshot-Name ohne Endung (z.B. rendered-page-chromium).
 * @param ext           Dateiendung inkl. Punkt (Default .png).
 * @returns Pfad relativ zum testDir (`tests/`).
 */
export function baselinePath(
  env: string,
  testFilePath: string,
  arg: string,
  ext = '.png',
): string {
  return `__snapshots__/${env}/${testFilePath}/${arg}${ext}`;
}
