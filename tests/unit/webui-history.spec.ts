import { test, expect } from '@playwright/test';
import { sortRunsNewestFirst, baselinePath, runSettingsFrom } from '../../webui/history.js';

test.describe('Web-UI: Historie', { tag: '@unit' }, () => {
  test('Lauf-Einstellungen (runSettingsFrom): Tempo nur sichtbar, Defaults gesetzt', () => {
    expect(runSettingsFrom({ headed: true, slowMo: 3000, repeatEach: 3, smokeGate: true })).toEqual({
      headed: true, slowMo: 3000, repeatEach: 3, workers: 1, smokeGate: true, updateSnapshots: false,
    });
    // Headless: Tempo wirkt nicht und wird als 0 gespeichert.
    expect(runSettingsFrom({ headed: false, slowMo: 3000 })).toEqual({
      headed: false, slowMo: 0, repeatEach: 1, workers: 1, smokeGate: false, updateSnapshots: false,
    });
  });

  test('Sortiert Läufe neueste zuerst', () => {
    const runs = [
      { id: 'a', startedAt: '2026-11-01T10:00:00Z', status: 'passed' },
      { id: 'b', startedAt: '2026-11-03T10:00:00Z', status: 'failed' },
      { id: 'c', startedAt: '2026-11-02T10:00:00Z', status: 'passed' },
    ];
    expect(sortRunsNewestFirst(runs).map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });

  test('Baseline-Pfad (baselinePath) folgt dem snapshotPathTemplate je Umgebung', () => {
    expect(
      baselinePath('legacy', 'basics/visual-regression.spec.ts', 'rendered-page-chromium'),
    ).toBe(
      '__snapshots__/legacy/basics/visual-regression.spec.ts/rendered-page-chromium.png',
    );
    expect(
      baselinePath('test', 'basics/visual-regression.spec.ts', 'rendered-page-chromium', '.png'),
    ).toBe(
      '__snapshots__/test/basics/visual-regression.spec.ts/rendered-page-chromium.png',
    );
  });
});
