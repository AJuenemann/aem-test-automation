import { test, expect } from '@playwright/test';
import { formatTestDuration, statusLabel } from '../../cockpit/live-reporter.js';

test.describe('Cockpit: Live-Reporter', { tag: '@unit' }, () => {
  test('Dauerformat: Sekunden mit einer Nachkommastelle, ab 60 s Minuten', () => {
    expect(formatTestDuration(850)).toBe('0.9s');
    expect(formatTestDuration(12_345)).toBe('12.3s');
    expect(formatTestDuration(59_940)).toBe('59.9s');
    expect(formatTestDuration(59_960)).toBe('1m 00s'); // kein "60.0s"
    expect(formatTestDuration(65_000)).toBe('1m 05s');
    expect(formatTestDuration(-5)).toBe('0.0s');
  });

  test('Ergebnis-Kürzel je Status', () => {
    expect(statusLabel('passed')).toBe('✓');
    expect(statusLabel('failed')).toBe('✘');
    expect(statusLabel('timedOut')).toBe('✘ Timeout');
    expect(statusLabel('skipped')).toBe('– übersprungen');
  });
});
