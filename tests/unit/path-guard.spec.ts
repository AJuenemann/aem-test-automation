import { test, expect } from '@playwright/test';
import { assertWithinPlayground } from '../../config/env.js';

/**
 * Unit-nahe Tests für den Pfad-Guard. Benötigt kein AEM und keinen Login,
 * daher ohne storageState lauffähig. Sichert technisch ab, dass
 * Schreiboperationen auf die Spielwiese beschränkt bleiben (Scope 5=b).
 */
test.describe('Pfad-Guard (assertWithinPlayground)', { tag: '@unit' }, () => {
  const playground = '/content/fhgtest';

  test('Erlaubt Pfade innerhalb der Spielwiese', () => {
    expect(() => assertWithinPlayground('/content/fhgtest/mvp-123', playground)).not.toThrow();
    expect(() => assertWithinPlayground('/content/fhgtest', playground)).not.toThrow();
    expect(() => assertWithinPlayground('/content/fhgtest/a/b/c', playground)).not.toThrow();
  });

  test('Blockiert Pfade außerhalb der Spielwiese', () => {
    expect(() => assertWithinPlayground('/content/zv', playground)).toThrow(/außerhalb/);
    expect(() => assertWithinPlayground('/content/zv/seite', playground)).toThrow(/außerhalb/);
    expect(() => assertWithinPlayground('/content', playground)).toThrow(/außerhalb/);
  });

  test('Mehrere Spielwiesen: Visitenkarten-Spielwiese erlaubt, echte Institutsordner nicht', () => {
    const roots = [playground, '/content/businesscards/fhgtest'];
    expect(() => assertWithinPlayground('/content/businesscards/fhgtest/karte', roots)).not.toThrow();
    expect(() => assertWithinPlayground('/content/fhgtest/seite', roots)).not.toThrow();
    expect(() => assertWithinPlayground('/content/businesscards/IOF/karte', roots)).toThrow(/außerhalb/);
    expect(() => assertWithinPlayground('/content/businesscards/fhgtest-evil', roots)).toThrow(/außerhalb/);
  });

  test('Blockiert Präfix-Trickserei (fhgtest-evil)', () => {
    // Darf NICHT als "innerhalb" durchgehen, nur weil der String mit dem
    // Playground-Pfad beginnt.
    expect(() => assertWithinPlayground('/content/fhgtest-evil', playground)).toThrow(/außerhalb/);
  });
});
