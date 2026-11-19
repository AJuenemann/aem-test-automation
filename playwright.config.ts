import { defineConfig, devices } from '@playwright/test';

// Die Konfiguration selbst validiert die Env NICHT hart: so laufen
// `--list`/`--help` und das credential-freie `unit`-Projekt ohne AEM-Zugang.
// Die eigentliche Validierung (mit klarer MissingEnvError) passiert in
// `tests/auth.setup.ts`, das als Dependency jedes AEM-Laufs ausgeführt wird.
function resolveBaseUrl(): string {
  const raw = process.env.AEM_BASE_URL?.trim();
  return raw ? raw.replace(/\/+$/, '') : 'http://localhost';
}

// Umgebungsname für die Snapshot-Trennung (test | dev | legacy).
const envName = process.env.AEM_ENV?.trim().toLowerCase() || 'test';

// Optionale Verlangsamung (ms pro Aktion) für den sichtbaren Lauf, damit man
// im Headed-Modus mitverfolgen kann, was passiert. 0 = aus. Wird von der
// Cockpit über PWA_SLOWMO gesetzt; hat ohne --headed kaum sichtbaren Effekt.
const slowMo = Math.max(0, Number(process.env.PWA_SLOWMO) || 0);

// Smoketest als Vorstufe (Gate) für `chromium`. Standard an (npm test, CI).
// SMOKE_GATE=0 schaltet ihn ab: Dann laufen nur die ausgewählten Tests plus
// Login. Abhängigkeiten laufen in Playwright sonst immer vollständig mit,
// auch bei Datei-/Grep-Filter. Das Cockpit setzt den Wert über ihren Schalter.
const smokeGate = process.env.SMOKE_GATE !== '0';

export default defineConfig({
  testDir: './tests',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  // Seriell: die UI-Tests teilen sich eine Author-Instanz; paralleler Zugriff
  // macht die ohnehin UI-abhängigen Flows flaky. Bewusst auch lokal workers=1.
  workers: 1,

  // Globaler Test-Timeout: 90s statt der Playwright-Standard-30s. Die AEM-UI-
  // Flows sind mehrstufig (Konsole/Editor, networkidle, zustandsbasierte
  // Waits) und unter Last träge -> 30s reichen nicht verlässlich (real bis
  // ~53s beobachtet). Einzelne lange Flows erhöhen zusätzlich per
  // test.setTimeout. Unit-Tests (schnell) stört der höhere Default nicht.
  timeout: 90_000,

  // Reporter: HTML-Report + knappe Liste im Terminal.
  reporter: [['html', { open: 'never' }], ['list']],

  // Baselines pro logischer Umgebung trennen, damit der Vorher-/Nachher-
  // Vergleich (alt vs. neu) nicht kollidiert. Beispiel-Ergebnis:
  //   tests/__snapshots__/test/tests/basics/visual-regression.spec.ts/rendered-page-chromium.png
  snapshotPathTemplate:
    '{testDir}/__snapshots__/' + envName + '/{testFilePath}/{arg}{ext}',

  use: {
    baseURL: resolveBaseUrl(),
    // Sichtbaren Lauf optional verlangsamen (PWA_SLOWMO ms pro Aktion).
    launchOptions: { slowMo },
    // Diagnose-Hilfen: Trace/Screenshot/Video bei Fehlern.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // AEM-TLS kann in TEST/DEV mit internen Zertifikaten laufen.
    ignoreHTTPSErrors: true,
    actionTimeout: 15_000,
    // AEM-Author kann unter Last träge antworten; großzügiger Navigations-
    // Timeout vermeidet Flakes beim Seitenaufbau.
    navigationTimeout: 60_000,
  },

  expect: {
    // Toleranz für die visuelle Regression. Font-/Icon-Anti-Aliasing erzeugt
    // auch ohne echte Änderung Sub-Pixel-Rauschen an Kanten (real beobachtet:
    // ~1100 Pixel = 0,01 der Fläche, rein an Textkanten). maxDiffPixels 100 war
    // dafür zu streng. maxDiffPixelRatio begrenzt relativ zur Bildgröße, sodass
    // echte Layout-/Inhaltsänderungen (viele zusammenhängende Pixel) weiterhin
    // auffallen.
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.02,
      threshold: 0.2,
    },
  },

  projects: [
    // 0) Unit-nahe Tests ohne AEM/Login (z.B. Pfad-Guard).
    {
      name: 'unit',
      testDir: './tests/unit',
    },
    // 1) Setup: einmaliger Login, speichert storageState.
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    // 2) Smoketest als Vorstufe (Gate): schlägt er fehl, überspringt Playwright
    //    das Projekt chromium komplett (Umgebung kaputt -> keine Folgefehler).
    //    Nur bei aktivem Gate (siehe SMOKE_GATE oben).
    {
      name: 'smoke',
      testMatch: /[\\/]tests[\\/]smoke\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: ['setup'],
    },
    // 3) Funktionale/visuelle Tests, nutzen den gespeicherten Login.
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.auth/user.json',
      },
      dependencies: smokeGate ? ['smoke'] : ['setup'],
      // Weder Setup, Smoke noch Unit-Tests hier erneut ausführen.
      testIgnore: [/.*\.setup\.ts/, /tests\/unit\//, /[\\/]tests[\\/]smoke\.spec\.ts$/],
    },
  ],
});
