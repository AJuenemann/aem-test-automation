import { test as setup, expect } from '@playwright/test';
import { titleEn } from '../fixtures/titles.js';
import path from 'node:path';
import fs from 'node:fs';
import { getAemConfig } from '../config/env.js';

const authFile = path.join('playwright', '.auth', 'user.json');

/**
 * Setup-"Test": loggt sich einmalig in die AEM-Author-Instanz ein und speichert
 * den Session-State (Cookies) nach playwright/.auth/user.json. Alle übrigen
 * Tests nutzen diesen State und starten bereits authentifiziert.
 *
 * Annahme: Formularbasierter AEM-Login (Granite Login-Maske). Falls die
 * Umgebung stattdessen SSO erzwingt, muss dieser Schritt an den IdP-Flow
 * angepasst werden (siehe README, offener Punkt "Login-Methode").
 */
setup('Authentifizieren', titleEn('Authenticate'), async ({ page }) => {
  const cfg = getAemConfig();

  // Verzeichnis für den Auth-State sicherstellen.
  fs.mkdirSync(path.dirname(authFile), { recursive: true });

  // Direkt die Login-Maske mit Rücksprungziel auf die Sites-Konsole ansteuern.
  const resource = encodeURIComponent(`/sites.html${cfg.playgroundPath}`);
  await page.goto(
    `${cfg.baseUrl}/libs/granite/core/content/login.html?resource=${resource}`,
    { waitUntil: 'domcontentloaded' },
  );

  // Granite-Login-Felder. IDs sind in AEM 6.5 stabil; Fallbacks über name.
  const usernameField = page.locator('#username, input[name="j_username"]').first();
  const passwordField = page.locator('#password, input[name="j_password"]').first();
  const submitButton = page
    .locator('#submit-button, button[type="submit"], .coral-Button--primary')
    .first();

  await expect(
    usernameField,
    'Login-Maske (Benutzerfeld) nicht gefunden. Erzwingt die Umgebung SSO statt ' +
      'des Formular-Logins? Dann muss auth.setup.ts an den IdP-Flow angepasst werden.',
  ).toBeVisible({ timeout: 20_000 });

  await usernameField.fill(cfg.user);
  await passwordField.fill(cfg.password);
  await submitButton.click();

  // Fehlgeschlagener Login (z.B. falsches Passwort) zeigt eine Fehlermeldung
  // und bleibt auf der Login-Seite. Positiv ausschließen, damit ein Fehllogin
  // mit klarer Meldung scheitert statt erst am Shell-Timeout.
  const loginError = page.locator('.coral-Form-errorlist, #errormsg, coral-alert[variant="error"]');
  await expect(
    loginError,
    'Login abgelehnt (Fehlermeldung auf der Login-Seite). Credentials prüfen.',
  ).toHaveCount(0);

  // Nach erfolgreichem Login landen wir in der Author-Shell (kein Login-Pfad mehr).
  await page.waitForURL((url) => !url.pathname.includes('/core/content/login'), {
    timeout: 30_000,
  });

  // Doppelte Absicherung: Granite-Shell ist sichtbar.
  await expect(
    page.locator('coral-shell, .granite-shell, #granite-shell'),
    'Granite-Shell nach Login nicht sichtbar - Login vermutlich fehlgeschlagen.',
  ).toBeVisible({ timeout: 20_000 });

  // Session-State persistieren.
  await page.context().storageState({ path: authFile });
});
