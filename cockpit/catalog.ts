/**
 * Testkatalog aus `playwright test --list --reporter=json`.
 *
 * Reiner Parser (kein I/O): nimmt das geparste JSON und liefert eine flache,
 * UI-freundliche Struktur. So ist er ohne AEM/Login unit-testbar.
 */

/** Ein einzelner Test (eine `test(...)`-Zeile), ggf. je Projekt mehrfach. */
export interface CatalogTest {
  /** Titel des einzelnen Tests. */
  title: string;
  /** Spec-Datei relativ zum testDir (z.B. `basics/page-crud.spec.ts`). */
  file: string;
  /** Zeile der `test(...)`-Definition. */
  line: number;
  /** Projekte, in denen dieser Test läuft (z.B. `chromium`). */
  projects: string[];
  /** Playwright-Tags ohne führendes @ (z.B. `level1`, `visual`). */
  tags: string[];
}

/** Eine Spec-Datei mit ihren Einzeltests. */
export interface CatalogSpecFile {
  /** Spec-Datei relativ zum testDir. */
  file: string;
  /** Lesbarer Anzeigename (describe-Titel oder aus dem Dateinamen abgeleitet). */
  label: string;
  /** Zugeordnete Kategorie (Tag) oder undefined (Sonstige). */
  categoryTag?: string;
  tests: CatalogTest[];
}

/** Eine Kategorie-Definition (aus categories.json). */
export interface CategoryDef {
  tag: string;
  label: string;
  description?: string;
  /** Englischer Anzeigename und Beschreibung (Cockpit, Sprache EN). */
  labelEn?: string;
  descriptionEn?: string;
  order: number;
  /**
   * true -> im Cockpit nicht anzeigen (fachlich irrelevant für den Tester,
   * z.B. Unit-Tests). Die Tests laufen weiter über CLI/CI, tauchen nur in der
   * Auswahl-Oberfläche nicht auf.
   */
  hidden?: boolean;
}

/** Eine Gruppe von Dateien unter einer Kategorie, für die UI. */
export interface CatalogGroup {
  tag?: string;
  label: string;
  description?: string;
  labelEn?: string;
  descriptionEn?: string;
  files: CatalogSpecFile[];
}

/** Der komplette Katalog für die UI. */
export interface TestCatalog {
  /** Alle Projektnamen aus der Config (unit, setup, chromium). */
  projects: string[];
  /** Spec-Dateien mit ihren Tests, nach Anzeigename sortiert. */
  files: CatalogSpecFile[];
  /** Nach Kategorie gruppierte Dateien (Reihenfolge laut categories.json). */
  groups: CatalogGroup[];
}

// Minimal nötige Form des Playwright-`--list`-JSON (nur was wir lesen).
interface RawTest {
  projectName?: string;
}
interface RawSpec {
  title: string;
  file: string;
  line: number;
  tags?: string[];
  tests?: RawTest[];
}
interface RawSuite {
  title?: string;
  file?: string;
  specs?: RawSpec[];
  suites?: RawSuite[];
}
interface RawListJson {
  suites?: RawSuite[];
}

/**
 * Sammelt alle Specs rekursiv ein. Playwright schachtelt pro
 * `test.describe(...)` eine weitere Suite-Ebene; Specs können also direkt
 * an der Datei-Suite ODER tiefer hängen.
 */
function collectSpecs(suite: RawSuite, out: RawSpec[]): void {
  for (const spec of suite.specs ?? []) {
    out.push(spec);
  }
  for (const child of suite.suites ?? []) {
    collectSpecs(child, out);
  }
}

/**
 * Sammelt die describe-Titel einer Datei-Suite. Die oberste Suite trägt den
 * Dateipfad als Titel; die darunter sind die eigentlichen `describe(...)`.
 */
function collectDescribeTitles(suite: RawSuite, out: string[]): void {
  for (const child of suite.suites ?? []) {
    if (child.title && child.title.trim() !== '') {
      out.push(child.title.trim());
    }
    collectDescribeTitles(child, out);
  }
}

/**
 * Leitet aus einem Dateipfad einen lesbaren Namen ab, falls kein
 * describe-Titel vorliegt. `basics/component-edit.spec.ts` -> `Component edit`.
 */
export function labelFromFile(file: string): string {
  const base = file
    .split('/')
    .pop()!
    .replace(/\.(spec|test)\.[cm]?[jt]sx?$/i, '');
  const words = base.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Bestimmt den Anzeigenamen einer Datei: genau ein describe-Titel -> dieser;
 * mehrere -> aus Dateiname (sonst würde ein describe die anderen verdecken);
 * keiner -> aus Dateiname.
 */
function fileLabel(titles: string[], file: string): string {
  const unique = [...new Set(titles)];
  if (unique.length === 1) {
    return unique[0];
  }
  return labelFromFile(file);
}

/**
 * Das `setup`-Projekt ist kein Testfall, sondern Vorbedingung (Login ->
 * storageState). Es läuft bei Bedarf automatisch mit (siehe buildRun) und wird
 * daher nicht als wählbarer Katalog-Eintrag angeboten.
 */
const HIDDEN_PROJECTS = new Set(['setup']);

/**
 * Wandelt das rohe `--list`-JSON in den flachen UI-Katalog um.
 * Tests mit gleichem Titel/Zeile aber mehreren Projekten werden
 * zu einem Eintrag mit mehreren Projekten zusammengefasst.
 * Tests, die ausschließlich zu einem versteckten Projekt (setup) gehören,
 * werden ausgelassen.
 */
export function parseCatalog(
  raw: RawListJson,
  categories: CategoryDef[] = [],
): TestCatalog {
  const fileMap = new Map<string, Map<string, CatalogTest>>();
  const titleMap = new Map<string, string[]>();
  const projectSet = new Set<string>();

  for (const fileSuite of raw.suites ?? []) {
    const specs: RawSpec[] = [];
    collectSpecs(fileSuite, specs);

    const describeTitles: string[] = [];
    collectDescribeTitles(fileSuite, describeTitles);

    for (const spec of specs) {
      const file = spec.file;
      // Schlüssel pro Test: Titel + Zeile (eindeutig innerhalb einer Datei).
      const key = `${spec.line}:${spec.title}`;
      const projects = (spec.tests ?? [])
        .map((t) => t.projectName)
        .filter((p): p is string => typeof p === 'string' && p.length > 0)
        .filter((p) => !HIDDEN_PROJECTS.has(p));
      // Test gehört nur zu versteckten Projekten (z.B. auth.setup) -> auslassen.
      if (projects.length === 0) {
        continue;
      }
      projects.forEach((p) => projectSet.add(p));

      let testsOfFile = fileMap.get(file);
      if (!testsOfFile) {
        testsOfFile = new Map<string, CatalogTest>();
        fileMap.set(file, testsOfFile);
        titleMap.set(file, describeTitles);
      }

      // Tags ohne führendes @ (Playwright liefert sie bereits ohne @).
      const tags = (spec.tags ?? []).map((t) => t.replace(/^@/, ''));

      const existing = testsOfFile.get(key);
      if (existing) {
        for (const p of projects) {
          if (!existing.projects.includes(p)) {
            existing.projects.push(p);
          }
        }
        for (const t of tags) {
          if (!existing.tags.includes(t)) {
            existing.tags.push(t);
          }
        }
      } else {
        testsOfFile.set(key, {
          title: spec.title,
          file,
          line: spec.line,
          projects: [...new Set(projects)],
          tags: [...new Set(tags)],
        });
      }
    }
  }

  // Kategorie-Reihenfolge: niedrigstes `order` gewinnt, wenn eine Datei mehrere
  // Kategorie-Tags trägt (z.B. level1 + visual -> level1).
  const byOrder = [...categories].sort((a, b) => a.order - b.order);
  const categoryTags = new Set(byOrder.map((c) => c.tag));
  // Als hidden markierte Kategorien: weder als Gruppe noch unter "Sonstige"
  // anzeigen. Dateien, deren (einzige) Kategorie hidden ist, fallen ganz raus.
  const hiddenTags = new Set(byOrder.filter((c) => c.hidden).map((c) => c.tag));

  function fileCategory(tests: CatalogTest[]): string | undefined {
    const present = new Set<string>();
    for (const t of tests) {
      for (const tag of t.tags) {
        if (categoryTags.has(tag)) {
          present.add(tag);
        }
      }
    }
    for (const cat of byOrder) {
      if (present.has(cat.tag)) {
        return cat.tag;
      }
    }
    return undefined;
  }

  const files: CatalogSpecFile[] = [...fileMap.entries()]
    .map(([file, tests]) => {
      const testList = [...tests.values()].sort((a, b) => a.line - b.line);
      return {
        file,
        label: fileLabel(titleMap.get(file) ?? [], file),
        categoryTag: fileCategory(testList),
        tests: testList,
      };
    })
    // Dateien verborgener Kategorien (z.B. Unit) nicht in die UI aufnehmen.
    .filter((f) => !(f.categoryTag && hiddenTags.has(f.categoryTag)))
    .sort((a, b) => a.label.localeCompare(b.label));

  // Gruppen in Kategorie-Reihenfolge; Dateien ohne Kategorie als "Sonstige".
  const groups: CatalogGroup[] = [];
  for (const cat of byOrder) {
    if (cat.hidden) continue;
    const groupFiles = files.filter((f) => f.categoryTag === cat.tag);
    if (groupFiles.length) {
      groups.push({
        tag: cat.tag,
        label: cat.label,
        description: cat.description,
        ...(cat.labelEn ? { labelEn: cat.labelEn } : {}),
        ...(cat.descriptionEn ? { descriptionEn: cat.descriptionEn } : {}),
        files: groupFiles,
      });
    }
  }
  const uncategorized = files.filter((f) => !f.categoryTag);
  if (uncategorized.length) {
    groups.push({ label: 'Sonstige', labelEn: 'Other', files: uncategorized });
  }

  return {
    projects: [...projectSet].sort(),
    files,
    groups,
  };
}
