import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseCatalog, type CategoryDef } from '../../cockpit/catalog.js';
import { TITLE_EN, DESCRIBE_EN } from '../../fixtures/titles.js';

/**
 * Jeder Test und jede Suite hat einen englischen Anzeigenamen für das Cockpit (Sprache EN),
 * siehe fixtures/titles.ts. Dieser Test liest die echte Testliste (`playwright test --list`),
 * damit ein neuer Test ohne englischen Namen sofort auffällt.
 */
interface ListSpec {
  title: string; file: string; line: number; tags?: string[];
  tests?: { projectName?: string; annotations?: { type?: string; description?: string }[] }[];
}
interface ListSuite { title?: string; file?: string; specs?: ListSpec[]; suites?: ListSuite[] }

function listTests(): { suites: ListSuite[] } {
  // PW_*/PLAYWRIGHT_*: sonst hält der Kindprozess sich für einen Worker des laufenden Tests.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(PW_|PLAYWRIGHT_)/.test(k)));
  const out = execFileSync('npx', ['playwright', 'test', '--list', '--reporter=json'], {
    cwd: process.cwd(), env, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(out);
}

function specsOf(suite: ListSuite, out: ListSpec[] = []): ListSpec[] {
  out.push(...(suite.specs ?? []));
  for (const child of suite.suites ?? []) specsOf(child, out);
  return out;
}

test.describe('Englische Testnamen (fixtures/titles.ts)', { tag: '@unit' }, () => {
  test('Jeder AEM-Test trägt _title-en, jede Suite _describe-en, keiner ist leer oder gleicht dem Deutschen', () => {
    const list = listTests();
    const specs = list.suites.flatMap((s) => specsOf(s)).filter((s) => !s.file.startsWith('unit/'));
    expect(specs.length).toBeGreaterThan(60);
    const problems: string[] = [];
    for (const spec of specs) {
      const ann = (type: string) => (spec.tests ?? []).flatMap((t) => t.annotations ?? []).find((a) => a.type === type)?.description;
      const en = ann(TITLE_EN);
      if (!en?.trim()) problems.push(`${spec.file}: "${spec.title}" ohne ${TITLE_EN}`);
      else if (en === spec.title && /[äöüß]/i.test(spec.title)) problems.push(`${spec.file}: "${spec.title}" nicht übersetzt`);
      if (!spec.file.endsWith('.setup.ts') && !ann(DESCRIBE_EN)?.trim()) problems.push(`${spec.file}: "${spec.title}" ohne ${DESCRIBE_EN}`);
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('Der Katalog liefert zu jedem sichtbaren Test und jeder Datei einen englischen Namen', () => {
    const categories = JSON.parse(readFileSync(path.join(process.cwd(), 'cockpit/categories.json'), 'utf8')).categories as CategoryDef[];
    const catalog = parseCatalog(listTests(), categories);
    const missing: string[] = [];
    for (const group of catalog.groups) {
      for (const file of group.files) {
        if (!file.labelEn) missing.push(`${file.file}: ohne englischen Dateinamen`);
        for (const t of file.tests) if (!t.titleEn) missing.push(`${t.file}:${t.line} "${t.title}" ohne englischen Namen`);
      }
    }
    expect(catalog.groups.length).toBeGreaterThanOrEqual(5);
    expect(missing, missing.join('\n')).toEqual([]);
  });
});
