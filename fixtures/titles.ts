/**
 * Englische Anzeigenamen für Tests und Suiten (Cockpit, Sprache EN).
 *
 * Der Test-/describe-Titel bleibt deutsch (Quelle für `--grep`, Baselines und Berichte). Den
 * englischen Namen trägt eine Annotation, die das Cockpit aus `--list` und dem JSON-Report liest.
 * Der Unterstrich im Typ blendet sie im Playwright-HTML-Report aus.
 *
 *   test.describe('AEM-Basis: Seiten-CRUD', { tag: '@level1', annotation: describeEn('AEM core: page CRUD') }, () => {
 *     test('Seite anlegen', titleEn('Create a page'), async ({ page }) => { ... });
 *   });
 */
export const TITLE_EN = '_title-en';
export const DESCRIBE_EN = '_describe-en';

/** Details für `test(...)`: englischer Testname. */
export const titleEn = (text: string) => ({ annotation: { type: TITLE_EN, description: text } });

/** Annotation für `test.describe(..., { annotation })`: englischer Suite-Name. */
export const describeEn = (text: string) => ({ type: DESCRIBE_EN, description: text });
