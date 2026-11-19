import { test } from '../../fixtures/test-fixtures.js';
import { SAMPLE_COMPONENTS, samplePagePath } from '../../fixtures/samples-components.js';
import { writeReference, emptyFields } from '../../fixtures/dialog-reference.js';

/**
 * Capture der Komponenten-Dialogstruktur als Referenz-Fixture (Vorher-Stand).
 *
 * Analog zu `update-snapshots` für die visuelle Regression: liest pro
 * Komponente den Konfig-Dialog (alle Reiter + Felder + aktuelle Werte) aus und
 * schreibt ihn nach fixtures/component-dialogs/<key>.json. Der eigentliche
 * Dialog-Test (dialog.spec.ts) vergleicht spaeter dagegen.
 *
 * Laeuft NUR mit CAPTURE_DIALOGS=1, damit ein normaler Testlauf keine
 * Referenzen ueberschreibt:
 *   CAPTURE_DIALOGS=1 AEM_ENV=<umgebung> AEM_BASE_URL=<author> \
 *     npx playwright test tests/components/dialog-capture.spec.ts
 *
 * WICHTIG: Leere Felder werden auf der Konsole gemeldet. Sie sind ein
 * fachlicher Nachbesserungs-Befund (Samples-Inhalt fehlt) und sollten VOR dem
 * Festschreiben der Referenz geklaert werden.
 */
const CAPTURE = process.env.CAPTURE_DIALOGS === '1';

// Tag @tooling: Werkzeug (Referenz-Erzeugung), kein fachlicher Testfall ->
// in der Web-UI ausgeblendet (categories.json: hidden). Läuft via npm run
// capture-dialogs / CLI. @level2-components zusätzlich für die Level-Ableitung
// der Testseiten-Namen (makeTestPage) — hier nicht genutzt, aber konsistent.
test.describe('Komponenten: Dialog-Capture (Referenz)', { tag: ['@tooling', '@level2-components'] }, () => {
  test.skip(!CAPTURE, 'Capture nur mit CAPTURE_DIALOGS=1 (erzeugt Referenz-Fixtures).');

  for (const c of SAMPLE_COMPONENTS) {
    test(`Dialog von "${c.label}" auslesen`, async ({ samplesComponent }) => {
      test.setTimeout(120_000);
      await samplesComponent.open(samplePagePath(c));
      await samplesComponent.openConfigDialog(c.component);
      const snapshot = await samplesComponent.readSnapshot(c.component);
      await samplesComponent.closeDialog();

      const empties = emptyFields(snapshot);
      if (empties.length > 0) {
        // Deutlich sichtbarer Befund fuer die Nachbesserung.
        globalThis.console.warn(
          `\n[LEERE FELDER] Komponente "${c.label}" (${empties.length}):\n  - ` +
            empties.join('\n  - ') +
            '\n',
        );
      }

      writeReference(c.key, snapshot);
      globalThis.console.log(
        `[CAPTURE] ${c.label}: ${snapshot.tabs.length} Reiter, ` +
          `${snapshot.fields.length} Felder -> fixtures/component-dialogs/${c.key}.json`,
      );
    });
  }
});
