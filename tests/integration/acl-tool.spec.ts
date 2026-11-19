import { test, expect } from '../../fixtures/test-fixtures.js';
import { titleEn, describeEn } from '../../fixtures/titles.js';
import { getAemConfig } from '../../config/env.js';

/**
 * ACL-Tool-Integrationstest (JET-Antwort zu 4.): es wird NUR geprueft, ob
 *  1. das AC-Tool technisch aufrufbar ist (/system/console/actool), und
 *  2. die AC-Tool-Bundles AKTIV sind (/system/console/bundles).
 * Keine vollstaendigen Berechtigungs-/Rollentests.
 *
 * Laeuft als eingeloggter Admin (storageState). Die Felix-Web-Konsole liefert
 * den Bundle-Status auch als JSON (/system/console/bundles.json), was stabiler
 * ist als DOM-Parsing. Der actool-Aufruf wird ueber den HTTP-Status geprueft.
 */
const ACTOOL_PATH = '/system/console/actool';

// Symbolische Namen der AC-Tool-Bundles (biz.netcentric.cq.tools.actool.*).
// Breit gematcht, da die exakte Artefakt-Aufteilung versionsabhaengig ist.
const ACTOOL_BUNDLE_PATTERN = /actool|accesscontroltool/i;

test.describe('Integration: ACL-Tool', { tag: '@integration', annotation: describeEn('Integration: ACL tool') }, () => {
  test('AC-Tool-Konsole ist erreichbar', titleEn('AC tool console is reachable'), async ({ page }) => {
    const base = getAemConfig().baseUrl;
    const response = await page.goto(`${base}${ACTOOL_PATH}`, { waitUntil: 'domcontentloaded' });
    expect(response, 'Keine HTTP-Antwort von der actool-Konsole.').not.toBeNull();
    const status = response!.status();
    expect(
      status,
      `actool-Konsole lieferte HTTP ${status} (erwartet 200). URL: ${base}${ACTOOL_PATH}`,
    ).toBe(200);
    // Nicht auf die Login-Maske umgeleitet (Granite-Login enthaelt ein Passwortfeld).
    await expect(page.locator('#username, input[name="j_username"]')).toHaveCount(0);
  });

  test('AC-Tool-Bundles sind aktiv', titleEn('AC tool bundles are active'), async ({ page }) => {
    const base = getAemConfig().baseUrl;
    const res = await page.request.get(`${base}/system/console/bundles.json`);
    expect(res.ok(), `bundles.json nicht erreichbar (HTTP ${res.status()}).`).toBe(true);

    const data = (await res.json()) as { data?: Array<{ symbolicName?: string; name?: string; state?: string }> };
    const bundles = data.data ?? [];
    const aclBundles = bundles.filter(
      (b) => ACTOOL_BUNDLE_PATTERN.test(b.symbolicName ?? '') || ACTOOL_BUNDLE_PATTERN.test(b.name ?? ''),
    );

    expect(
      aclBundles.length,
      'Keine AC-Tool-Bundles gefunden (Pattern: actool/accesscontroltool). ' +
        'Pattern ggf. an die installierte Version anpassen.',
    ).toBeGreaterThan(0);

    const inactive = aclBundles.filter((b) => (b.state ?? '').toLowerCase() !== 'active');
    expect(
      inactive,
      'Inaktive AC-Tool-Bundles:\n' +
        inactive.map((b) => `  - ${b.symbolicName ?? b.name}: ${b.state}`).join('\n'),
    ).toEqual([]);
  });
});
