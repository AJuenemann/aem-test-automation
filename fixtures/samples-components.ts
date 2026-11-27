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
  // MAN-02, 27.11.2026: weitere Beispielseiten (Overlay-Titel per Diag gegen TEST gelesen; DEV war im Upgrade).
  // Mehrere Komponenten einer Seite: Bildvergleich nur einmal pro Seite (`visual: false` bei den übrigen).
  { key: 'textinline', label: 'Text mit Inline-Bildern', pagePath: '/section/text-with-inline-images', component: 'Text mit Inline-Bildern' },
  // Linkliste: Ihre Kind-Overlays „Link" füllen die ganze Fläche, der Dialog der Liste ist per Klick nicht erreichbar. Geprüft wird der erste Link.
  { key: 'link', label: 'Link (Linkliste)', pagePath: '/section/linklist', component: 'Link' },
  { key: 'wideimage', label: 'Breites Bild', pagePath: '/section/wide-image', component: 'Breites Bild' },
  { key: 'teaseroverview', label: 'Teaser-Übersicht', pagePath: '/teasers/teaser-overview-reference', component: 'Teaser-Übersicht' },
  { key: 'teasermixed', label: 'Teaser gemischt', pagePath: '/teasers/teaser-mixed', component: 'Teaser-Übersicht' },
  { key: 'sliderbigslide', label: 'Slider groß, Bild-Slide', pagePath: '/sliders/slider-big-multiple', component: 'Slider groß - Bild-Slide' },
  { key: 'filmstrip', label: 'Filmstrecke', pagePath: '/gallery/videos', component: 'Bilder-/Filmstrecke' },
  { key: 'stage', label: 'Bühne', pagePath: '/stage', component: 'Bühne [Stamm]' },
  { key: 'stageimage', label: 'Bühne Bild', pagePath: '/stage', component: 'Bühne Bild', visual: false },
  { key: 'stagevideo', label: 'Bühne Video', pagePath: '/stage', component: 'Bühne Video', visual: false },
  { key: 'contentnav', label: 'Contentnavigation', pagePath: '/navigations/content-navigation', component: 'Contentnavigation' },
  { key: 'forminput', label: 'Formular: Texteingabe', pagePath: '/form/all-components', component: 'Texteingabe' },
  { key: 'formdropdown', label: 'Formular: Dropdown-Feld', pagePath: '/form/all-components', component: 'Dropdown-Feld', visual: false },
  { key: 'formdate', label: 'Formular: Datumsfeld', pagePath: '/form/all-components', component: 'Datumsfeld', visual: false },
  { key: 'formcheckbox', label: 'Formular: Kontrollkästchen-Gruppe', pagePath: '/form/all-components', component: 'Kontrollkästchen-Gruppe', visual: false },
  { key: 'formupload', label: 'Formular: Datei-Upload', pagePath: '/form/all-components', component: 'Datei-Upload', visual: false },
];

/** Alle Komponenten der Dialog- und Darstellungstests. */
export const ALL_COMPONENTS: SampleComponent[] = [...SAMPLE_COMPONENTS, ...EXTRA_COMPONENTS];

/** Absoluter Inhaltspfad einer Beispielseite (samplesRoot + pagePath). */
export function samplePagePath(c: SampleComponent): string {
  return `${getAemConfig().samplesRoot}${c.pagePath}`;
}
