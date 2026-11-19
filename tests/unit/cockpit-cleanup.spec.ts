import { test, expect } from '@playwright/test';
import { isAllowedCleanupPath, isTestPageName, selectTestPages } from '../../cockpit/cleanup.js';

test.describe('Cockpit: Cleanup-Namenserkennung', { tag: '@unit' }, () => {
  test('Erkennt Namen nach neuem Schema', () => {
    expect(isTestPageName('level1-seiten-crud-20261110-153045-a1b2')).toBe(true);
    expect(isTestPageName('smoke-konsole-erreichbar-20261110-000000-ffff')).toBe(true);
    expect(isTestPageName('unit-pfad-guard-20260101-120000-0a')).toBe(true);
  });

  test('Ignoriert Fremd- und Altnamen', () => {
    expect(isTestPageName('mvp-a1b2c3')).toBe(false); // alte Rückstände bewusst nicht
    expect(isTestPageName('zv')).toBe(false); // echte Inhaltsseite
    expect(isTestPageName('level1-seiten-crud')).toBe(false); // ohne Timestamp
    expect(isTestPageName('other-slug-20261110-153045-a1b2')).toBe(false); // unbekanntes Level
    expect(isTestPageName('level1-seiten-crud-2026-15-30-a1b2')).toBe(false); // falsches Zeitformat
  });

  test('Erkennt alle Test-Level (inkl. integration/regression/level2-components)', () => {
    expect(isTestPageName('integration-ldap-import-20261116-102111-b6ad4f7c')).toBe(true);
    expect(isTestPageName('regression-x-20261116-102111-ab')).toBe(true);
    expect(isTestPageName('level2-components-x-20261116-102111-ab')).toBe(true);
  });

  test('Erkennt DAM-Testassets mit Dateiendung', () => {
    expect(isTestPageName('level1-asset-upload-20261118-120000-a1b2c3d4.png')).toBe(true);
    expect(isTestPageName('level1-asset-upload-20261118-120000-a1b2c3d4.png.bak.zip')).toBe(false);
    expect(isTestPageName('Koala.jpg')).toBe(false); // fremdes Asset in /content/dam/fhgtest
    const roots = ['/content/dam/fhgtest'];
    expect(isAllowedCleanupPath('/content/dam/fhgtest/level1-asset-upload-20261118-120000-a1b2c3d4.png', roots)).toBe(true);
    expect(isAllowedCleanupPath('/content/dam/fhgtest/Koala.jpg', roots)).toBe(false);
  });

  test('Pfadprüfung (isAllowedCleanupPath): nur Testseiten direkt unter einer Spielwiese', () => {
    const roots = ['/content/fhgtest', '/content/businesscards/fhgtest'];
    const name = 'integration-ldap-import-20261116-102111-b6ad4f7c';
    expect(isAllowedCleanupPath(`/content/businesscards/fhgtest/${name}`, roots)).toBe(true);
    expect(isAllowedCleanupPath(`/content/fhgtest/${name}`, roots)).toBe(true);
    expect(isAllowedCleanupPath(`/content/businesscards/IOF/${name}`, roots)).toBe(false); // echter Institutsordner
    expect(isAllowedCleanupPath(`/content/fhgtest/de/${name}`, roots)).toBe(false); // zu tief
    expect(isAllowedCleanupPath('/content/businesscards/fhgtest/manuelle_vks', roots)).toBe(false); // fremd
    expect(isAllowedCleanupPath(`/content/fhgtest/../zv/${name}`, roots)).toBe(false);
  });

  test('Auswahl (selectTestPages) filtert und sortiert', () => {
    const input = [
      'zv',
      'mvp-alt',
      'smoke-b-20261110-153045-02',
      'level1-a-20261110-153045-01',
    ];
    expect(selectTestPages(input)).toEqual([
      'level1-a-20261110-153045-01',
      'smoke-b-20261110-153045-02',
    ]);
  });
});
