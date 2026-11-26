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
  /** Titel des Konfig-Dialogs, wenn er vom Overlay-Titel `component` abweicht. */
  dialogTitle?: string;
  /** Bildvergleich auf Publish (Default: ja). `false` für Seiten mit wechselndem Inhalt. */
  visual?: boolean;
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

/**
 * Weitere Komponenten (nicht von JET priorisiert), Vorschlag aus den Beispielseiten unter /content/samples
 * (Overlay-Titel per Diag gegen DEV am 26.11.2026 gelesen).
 * Nicht dabei: "Text mit Asset". Sein Dialog blendet je nach Auswahl (Bild oder Video) andere Reiter ein, die Reiterliste
 * ist daher nicht stabil lesbar. Fraunhofer kann die Auswahl ändern
 * (Testplan Kapitel 12, Nr. 4): Eintrag ergänzen und Referenz erfassen (nur vor dem Upgrade).
 */
export const EXTRA_COMPONENTS: SampleComponent[] = [
  { key: 'faq', label: 'FAQ Eintrag', pagePath: '/faq', component: 'FAQ Eintrag' },
  { key: 'tabs', label: 'Reiternavigation', pagePath: '/tab', component: 'Reiternavigation' },
  { key: 'textblock', label: 'Textblock extern', pagePath: '/textblock', component: 'Textblock extern', visual: false }, // Seitenhöhe wechselt (2381 bis 2447 px)
  { key: 'socialwall', label: 'Social Media Wall', pagePath: '/social-media-wall', component: 'Social Media Wall' },
  { key: 'carousel', label: 'Karussell', pagePath: '/carouselverbose', component: 'Karussell', visual: false }, // wechselnder Inhalt
  { key: 'bcoverview', label: 'Visitenkarten-Übersicht', pagePath: '/businesscards-overview', component: 'Visitenkarten-Übersicht' },
  { key: 'projectproducts', label: 'Projekte - Produkte', pagePath: '/project-products', component: 'Projekte - Produkte' },
  { key: 'reference', label: 'Verweis', pagePath: '/reference', component: 'Verweis', dialogTitle: 'Referenzkomponente' },
  { key: 'lightbox', label: 'Lightbox', pagePath: '/section/lightbox', component: 'Lightbox' },
  { key: 'slidersmall', label: 'Slider klein', pagePath: '/sliders/slider-small', component: 'Slider klein' },
  { key: 'contactbox', label: 'Kontaktbox', pagePath: '/teasers/teaser-contactbox', component: 'Kontaktbox' },
  { key: 'newsbox', label: 'Newsticker', pagePath: '/teasers/teaser-newsbox', component: 'Newsticker' },
  { key: 'teaserexternal', label: 'Externer Teaser', pagePath: '/teasers/teaser-external', component: 'Externer Teaser' },
  { key: 'download', label: 'Herunterladen', pagePath: '/section/download-component', component: 'Herunterladen' },
  { key: 'imagerow', label: 'Bild-Leiste', pagePath: '/section/image-row', component: 'Bild-Leiste' },
  { key: 'parallelnav', label: 'Parallelnavigation', pagePath: '/navigations/parallel-navigation', component: 'Parallelnavigation' },
];

/** Alle Komponenten der Dialog- und Darstellungstests. */
export const ALL_COMPONENTS: SampleComponent[] = [...SAMPLE_COMPONENTS, ...EXTRA_COMPONENTS];

/** Absoluter Inhaltspfad einer Beispielseite (samplesRoot + pagePath). */
export function samplePagePath(c: SampleComponent): string {
  return `${getAemConfig().samplesRoot}${c.pagePath}`;
}
