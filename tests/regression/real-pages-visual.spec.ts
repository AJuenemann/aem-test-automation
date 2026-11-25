import path from 'node:path';
import { test, expect } from '../../fixtures/test-fixtures.js';
import { titleEn, describeEn } from '../../fixtures/titles.js';

/**
 * Optik echter Seiten auf Publish gegen den Vorher-Stand (Bildvergleich). Rein lesend, ohne Login.
 *
 * Die Seiten sind ein Vorschlag aus dem Produktionsinhalt von DEV und TEST (Startseite, Institutsseite, Newsseite,
 * Seite mit Bildern, Seite mit Formular, Inhaltsseite, Event und Messe). Fraunhofer kann die Liste ändern
 * (Testplan Kapitel 12, Nr. 9 und 10): einfach einen Eintrag ergänzen oder entfernen und die Baseline für
 * ihn erzeugen (`--update-snapshots`, nur vor dem Upgrade).
 *
 * Die Baselines entstehen im Vorher-Stand (`tests/__snapshots__/<AEM_ENV>/…`) und werden nach dem Upgrade nicht
 * neu erzeugt. Listen mit Terminen (Veranstaltungen) sind bewusst nicht dabei: Vergangene Termine fallen aus der
 * Liste und würden den Vergleich ohne Fehler der Website brechen (die Daten prüft EVT-1).
 */
const stylePath = path.join(import.meta.dirname, '..', 'basics', 'screenshot.css');

interface RealPage {
  key: string;
  label: string;
  labelEn: string;
  path: string;
}

export const REAL_PAGES: RealPage[] = [
  { key: 'startseite', label: 'Startseite', labelEn: 'Home page', path: '/content/zv/de' },
  { key: 'institute', label: 'Institute und Einrichtungen', labelEn: 'Institutes and facilities', path: '/content/zv/de/institute' },
  { key: 'presse', label: 'Presse / Newsroom', labelEn: 'Press / newsroom', path: '/content/zv/de/presse' },
  { key: 'artikel-mit-bildern', label: 'Artikel mit Bildern (Humanoide Robotik)', labelEn: 'Article with images (humanoid robotics)', path: '/content/zv/de/forschung/artikel-2026/humanoide-robotik' },
  { key: 'zahlen-und-fakten', label: 'Inhaltsseite (Zahlen und Fakten)', labelEn: 'Content page (facts and figures)', path: '/content/zv/de/ueber-fraunhofer/profil-struktur/zahlen-und-fakten' },
  { key: 'formular', label: 'Seite mit Formular (Ausschreibungen)', labelEn: 'Page with a form (tenders)', path: '/content/zv/de/kontakt-zentrale/kontakt-formular-ausschreibungen' },
  { key: 'messen-liste', label: 'Messen (Liste)', labelEn: 'Trade fairs (list)', path: '/content/zv/de/veranstaltungen-messen/messen' },
  { key: 'messe-detail', label: 'Messe (Detailseite BAU 2027)', labelEn: 'Trade fair (detail page BAU 2027)', path: '/content/zv/de/veranstaltungen-messen/messen/2027/bau-2027' },
  { key: 'veranstaltung-detail', label: 'Veranstaltung (Detailseite)', labelEn: 'Event (detail page)', path: '/content/zv/de/veranstaltungen-messen/veranstaltungen/ai4surfaces-2027' },
];

test.describe('Regression: Optik echter Seiten (Publish)', { tag: ['@regression', '@visual'], annotation: describeEn('Regression: look of real pages (publish)') }, () => {
  for (const p of REAL_PAGES) {
    test(`Seite "${p.label}" sieht aus wie vorher`, titleEn(`Page "${p.labelEn}" looks as before`), async ({ publishPage }) => {
      test.setTimeout(90_000);
      const skipReason = publishPage.unavailableReason();
      test.skip(skipReason !== null, skipReason ?? '');
      await publishPage.openRendered(p.path);
      // Lazy-Bilder nachladen lassen: Playwright scrollt bei fullPage nicht selbst.
      await publishPage.page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 120));
        }
        window.scrollTo(0, 0);
      });
      await publishPage.page.waitForLoadState('networkidle');
      await publishPage.page.waitForTimeout(500);
      await expect(publishPage.page).toHaveScreenshot(`${p.key}.png`, { fullPage: true, stylePath });
    });
  }
});
