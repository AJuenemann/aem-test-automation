import { test, expect } from '../../fixtures/test-fixtures.js';
import { titleEn, describeEn } from '../../fixtures/titles.js';
import { ALL_COMPONENTS, samplePagePath } from '../../fixtures/samples-components.js';
import {
  hasReference,
  readReference,
  diffAgainstReference,
  emptyFields,
} from '../../fixtures/dialog-reference.js';

/**
 * Komponenten-Dialog-Tests (Author). Pro priorisierter Komponente:
 *  - der Konfig-Dialog oeffnet (Komponente laedt korrekt),
 *  - alle Reiter sind vorhanden (wie in der Referenz),
 *  - die erwarteten Felder sind vorhanden und korrekt befuellt (Werte == Referenz),
 *  - leere Felder werden als fachlicher Nachbesserungs-Befund gemeldet.
 *
 * Sollquelle ist die Referenz-Fixture (Vorher-Stand), erzeugt durch
 * dialog-capture.spec.ts (CAPTURE_DIALOGS=1). Fehlt die Referenz, ueberspringt
 * sich der Test mit Hinweis auf den Capture-Lauf (statt rot ohne Grundlage).
 *
 * Laeuft gegen Author (DEV oder TEST ueber AEM_BASE_URL / AEM_SAMPLES_ROOT).
 */
test.describe('Komponenten: Konfig-Dialog (Author)', { tag: '@level2-components', annotation: describeEn('Components: config dialog (author)') }, () => {
  for (const c of ALL_COMPONENTS) {
    test(`Dialog "${c.label}": Reiter & Feldinhalte wie Referenz`, titleEn(`Dialog "${c.label}": tabs & field values match the reference`), async ({ samplesComponent }) => {
      test.skip(
        !hasReference(c.key),
        `Keine Referenz fuer "${c.key}". Zuerst Capture laufen lassen: ` +
          `CAPTURE_DIALOGS=1 npx playwright test tests/components/dialog-capture.spec.ts`,
      );
      test.setTimeout(120_000);

      await samplesComponent.open(samplePagePath(c));
      await samplesComponent.openConfigDialog(c.component, c.dialogTitle);

      // Dialog ist offen -> Komponente laedt korrekt.
      await expect(samplesComponent.dialog()).toBeVisible();

      const actual = await samplesComponent.readSnapshot(c.component);
      await samplesComponent.closeDialog();

      const reference = readReference(c.key);

      // Leere Felder sind ein Befund, kein harter Fehler des Dialog-Vergleichs:
      // sichtbar melden, damit der Samples-Inhalt nachgebessert werden kann.
      const empties = emptyFields(actual);
      if (empties.length > 0) {
        globalThis.console.warn(
          `\n[LEERE FELDER] "${c.label}" (${empties.length}):\n  - ` + empties.join('\n  - '),
        );
      }

      const problems = diffAgainstReference(reference, actual);
      expect(
        problems,
        `Dialog "${c.label}" weicht von der Referenz ab:\n- ` + problems.join('\n- '),
      ).toEqual([]);
    });
  }
});
