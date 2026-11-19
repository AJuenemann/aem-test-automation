import { getAemConfig } from '../config/env.js';

/**
 * Priorisierte Komponenten laut JET-Antwort vom 04.11. Reihenfolge = fachliche
 * Priorität. Jede Komponente hat eine Beispielseite unter /content/samples.
 *
 * `pagePath` ist relativ zu AEM_SAMPLES_ROOT (Default /content/samples/de/components).
 * Für die visuelle Regression (Publish) wird die gerenderte Seite geladen; für
 * die Dialog-Tests (Author) wird dieselbe Seite im Editor geöffnet und die
 * Ziel-Komponente anhand ihres Konfig-Dialog-Titels (`dialogTitle`) selektiert.
 *
 * Hinweis: Stage und Teaser werden laut Abstimmung als EIN Fall behandelt
 * (Teaser deckt beide ab); deshalb kein separater Stage-Eintrag.
 *
 * Die konkreten `pagePath`-Segmente stammen aus den JET-Links. Einzelne
 * Unterseiten (z.B. die visuell geprüfte Section-Seite) weichen ab und sind
 * dort vermerkt. Beim ersten echten Lauf gegen DEV/TEST verifizieren.
 */
export interface SampleComponent {
  /** Stabiler Schlüssel (Dateiname der Referenz-Fixture, Testtitel). */
  key: string;
  /** Lesbarer Name. */
  label: string;
  /** Seitenpfad relativ zu AEM_SAMPLES_ROOT, ohne .html. */
  pagePath: string;
  /**
   * Teil des Konfig-Dialog-Titels / Komponentennamens zum Selektieren im
   * Editor (Overlay-title). Beim Diag-Lauf verifizieren/nachschärfen.
   */
  component: string;
}

/** Relativ zu AEM_SAMPLES_ROOT. */
export const SAMPLE_COMPONENTS: SampleComponent[] = [
  // `component` = echter Overlay-Titel im Editor (per Diag gegen DEV verifiziert,
  // 13.11.2026). Die Titel sind deutsch; "[Stamm]" kennzeichnet Template-Komponenten.
  { key: 'section', label: 'Section', pagePath: '/section/table', component: 'Bereich' },
  // teasers/ ist eine Übersicht mit leerem Referenz-Teaser; die befüllten
  // Varianten (18 Stück) liegen auf teasers/teaser.
  { key: 'teaser', label: 'Teaser (inkl. Stage)', pagePath: '/teasers/teaser', component: 'Teaser' },
  { key: 'press', label: 'Presse', pagePath: '/pressArticle', component: 'Pressemitteilung [Stamm]' },
  { key: 'event', label: 'Event', pagePath: '/event', component: 'Veranstaltung [Stamm]' },
  { key: 'tradefair', label: 'Messe', pagePath: '/tradefair', component: 'Messe [Stamm]' },
  { key: 'form', label: 'Formular', pagePath: '/form', component: 'Formularcontainer' },
  // sliders/ und gallery/ sind Übersichtsseiten; die Komponente liegt auf Unterseiten.
  { key: 'slider', label: 'Slider', pagePath: '/sliders/slider-big', component: 'Slider groß' },
  { key: 'gallery', label: 'Gallery', pagePath: '/gallery/mixed', component: 'Bilder-/Filmstrecke' },
  { key: 'businesscard', label: 'Businesscard', pagePath: '/businesscard-include', component: 'Visitenkarten' },
  { key: 'filter', label: 'Filter', pagePath: '/filterpage/filterpage_v2', component: 'Filter 2.0' },
  { key: 'newsroom', label: 'Newsroom', pagePath: '/newsroom', component: 'Filter Newsroom' },
];

/** Absoluter Inhaltspfad einer Beispielseite (samplesRoot + pagePath). */
export function samplePagePath(c: SampleComponent): string {
  return `${getAemConfig().samplesRoot}${c.pagePath}`;
}
