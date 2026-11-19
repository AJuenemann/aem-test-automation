import { test, expect } from '@playwright/test';
import { derivePublishUrl, resolvePublishConfig } from '../../config/env.js';

/**
 * Unit-nahe Tests für die Publish-URL-Auflösung (Task 1). Kein AEM/Login nötig.
 * Sichert ab: explizite AEM_PUBLISH_URL hat Vorrang, Fallback leitet
 * author->publish1 ab, fehlende/ungültige Werte liefern ein Skip-Signal.
 */
test.describe('Publish-URL-Auflösung (resolvePublishConfig)', { tag: '@unit' }, () => {
  test('Ableitung (derivePublishUrl) ersetzt author durch publish1 und entfernt End-Slash', () => {
    expect(derivePublishUrl('https://aem-author-dev.ws.fraunhofer.de/')).toBe(
      'https://aem-publish1-dev.ws.fraunhofer.de',
    );
    expect(derivePublishUrl('https://aem-author-test.ws.fraunhofer.de')).toBe(
      'https://aem-publish1-test.ws.fraunhofer.de',
    );
  });

  test('Ableitung (derivePublishUrl) liefert leer bei nicht passendem Schema', () => {
    expect(derivePublishUrl('https://example.com')).toBe('');
    expect(derivePublishUrl('')).toBe('');
  });

  test('Explizite Publish-URL hat Vorrang vor Ableitung', () => {
    const cfg = resolvePublishConfig({
      publishUrlRaw: 'https://publish.example.com/',
      authorUrlRaw: 'https://aem-author-dev.ws.fraunhofer.de',
    });
    expect(cfg.url).toBe('https://publish.example.com');
    expect(cfg.reason).toBe('');
  });

  test('Ohne explizite URL wird aus der Author-URL abgeleitet', () => {
    const cfg = resolvePublishConfig({
      authorUrlRaw: 'https://aem-author-dev.ws.fraunhofer.de',
    });
    expect(cfg.url).toBe('https://aem-publish1-dev.ws.fraunhofer.de');
    expect(cfg.reason).toBe('');
  });

  test('Ohne ableitbare URL trägt reason den Skip-Grund', () => {
    const cfg = resolvePublishConfig({
      publishUrlRaw: '   ',
      authorUrlRaw: 'https://example.com',
    });
    expect(cfg.url).toBe('');
    expect(cfg.reason).toMatch(/Keine Publish-URL/);
  });
});
