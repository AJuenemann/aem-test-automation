import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DialogSnapshot } from '../pageobjects/SamplesComponentPage.js';

/**
 * Lesen/Schreiben der Referenz-Fixtures der Komponenten-Dialoge (Vorher-Stand).
 * Pro Komponente eine JSON unter fixtures/component-dialogs/<key>.json.
 *
 * Erzeugt wird die Datei durch den Capture-Diag
 * (tests/components/dialog-capture.spec.ts), geprüft im Dialog-Test.
 */
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'component-dialogs');

export function referencePath(key: string): string {
  return path.join(DIR, `${key}.json`);
}

export function hasReference(key: string): boolean {
  return fs.existsSync(referencePath(key));
}

export function readReference(key: string): DialogSnapshot {
  const raw = fs.readFileSync(referencePath(key), 'utf-8');
  return JSON.parse(raw) as DialogSnapshot;
}

export function writeReference(key: string, snapshot: DialogSnapshot): void {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(referencePath(key), JSON.stringify(snapshot, null, 2) + '\n', 'utf-8');
}

/**
 * Vergleicht einen frisch ausgelesenen Dialog gegen die Referenz. Liefert eine
 * Liste von Abweichungen (leer = identisch). Prüft: gleiche Reiter, gleiche
 * Feldmenge (tab+name+label), gleiche Werte.
 */
export function diffAgainstReference(
  reference: DialogSnapshot,
  actual: DialogSnapshot,
): string[] {
  const problems: string[] = [];

  if (reference.dialogTitle && reference.dialogTitle !== actual.dialogTitle) {
    problems.push(
      `Falscher Dialog geöffnet. Erwartet "${reference.dialogTitle}", ` +
        `aktuell "${actual.dialogTitle ?? ''}".`,
    );
  }

  if (reference.tabs.join('|') !== actual.tabs.join('|')) {
    problems.push(
      `Reiter weichen ab. Erwartet: [${reference.tabs.join(', ')}], ` +
        `aktuell: [${actual.tabs.join(', ')}].`,
    );
  }

  const keyOf = (tab: string, name: string, label: string) => `${tab}::${name}::${label}`;
  const actualByKey = new Map(actual.fields.map((f) => [keyOf(f.tab, f.name, f.label), f]));

  for (const ref of reference.fields) {
    const k = keyOf(ref.tab, ref.name, ref.label);
    const act = actualByKey.get(k);
    if (!act) {
      problems.push(`Feld fehlt: Reiter "${ref.tab}", Feld "${ref.label || ref.name}".`);
      continue;
    }
    if (act.value !== ref.value) {
      problems.push(
        `Wert weicht ab: Reiter "${ref.tab}", Feld "${ref.label || ref.name}". ` +
          `Erwartet "${ref.value}", aktuell "${act.value}".`,
      );
    }
  }
  return problems;
}

/** Leere Felder eines Snapshots (fachlicher Nachbesserungs-Befund). */
export function emptyFields(snapshot: DialogSnapshot): string[] {
  return snapshot.fields
    .filter((f) => f.empty)
    .map((f) => `Reiter "${f.tab}" -> Feld "${f.label || f.name}" ist leer.`);
}
