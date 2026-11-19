import path from 'node:path';
import { stripAnsi } from './report.js';
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestError,
  TestResult,
} from '@playwright/test/reporter';

/**
 * Live-Log-Reporter des Cockpits. Wie `line`, aber mit Ergebnis und Dauer HINTER
 * jedem Test:
 *   [2/38] [chromium] › tests/x.spec.ts:19:3 › Suite › Test @tag  ✓ 12.3s
 * Schreibt der Test zwischendurch selbst etwas (console.log/warn), folgt das
 * Ergebnis in einer eigenen Zeile mit "↳", damit sich nichts vermischt.
 */

/** 850 -> "0.9s", 12_345 -> "12.3s", 65_000 -> "1m 05s". */
export function formatTestDuration(ms: number): string {
  // In Zehntelsekunden (Ganzzahl) runden: toFixed(1) rundet 0.85 wegen Float zu "0.8".
  const tenths = Math.round(Math.max(0, ms) / 100);
  if (tenths < 600) return `${Math.floor(tenths / 10)}.${tenths % 10}s`;
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`;
}

/** Ergebnis-Kürzel für das Live-Log. */
export function statusLabel(status: TestResult['status']): string {
  switch (status) {
    case 'passed':
      return '✓';
    case 'skipped':
      return '– übersprungen';
    case 'timedOut':
      return '✘ Timeout';
    case 'interrupted':
      return '⊘ abgebrochen';
    default:
      return '✘';
  }
}

/** Login-Schritt (Projekt `setup`): Vorbedingung, kein Testfall. */
function isLogin(test: TestCase): boolean {
  return test.parent.project()?.name === 'setup';
}

export default class LiveReporter implements Reporter {
  private total = 0;
  private started = 0;
  /** Startzeile des laufenden Tests steht ohne Zeilenumbruch im Log. */
  private openLine = false;

  printsToStdio(): boolean {
    return true;
  }

  onBegin(_config: FullConfig, suite: Suite): void {
    this.total = suite.allTests().filter((t) => !isLogin(t)).length;
    process.stdout.write(`Running ${this.total} tests using 1 worker\n\n`);
  }

  onTestBegin(test: TestCase, result: TestResult): void {
    if (isLogin(test)) return; // Login ist kein Testfall, siehe onTestEnd.
    this.closeLine();
    this.started++;
    const project = test.parent.project()?.name;
    const file = path.relative(process.cwd(), test.location.file);
    const titles = test.titlePath().slice(3).join(' › ');
    const tags = test.tags.length ? ` ${test.tags.join(' ')}` : '';
    const retry = result.retry > 0 ? ` (Wiederholung ${result.retry})` : '';
    process.stdout.write(
      `[${this.started}/${this.total}] ${project ? `[${project}] › ` : ''}${file}:${test.location.line}:${test.location.column} › ${titles}${tags}${retry}`,
    );
    this.openLine = true;
  }

  onStdOut(chunk: string | Buffer): void {
    this.passThrough(chunk);
  }

  onStdErr(chunk: string | Buffer): void {
    this.passThrough(chunk);
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (isLogin(test)) {
      // Nur ein gescheiterter Login erscheint im Log, mit Fehlermeldung.
      if (result.status === 'passed') return;
      this.closeLine();
      process.stdout.write(`Login fehlgeschlagen  ${statusLabel(result.status)} ${formatTestDuration(result.duration)}\n`);
      for (const err of result.errors) this.printError(err);
      return;
    }
    const outcome = `${statusLabel(result.status)} ${formatTestDuration(result.duration)}`;
    if (this.openLine) {
      process.stdout.write(`  ${outcome}\n`);
      this.openLine = false;
    } else {
      process.stdout.write(`  ↳ ${outcome} · ${test.title}\n`);
    }
    if (result.status === 'skipped') {
      const reason = test.annotations.find((a) => a.type === 'skip')?.description;
      if (reason) process.stdout.write(`    Grund: ${reason}\n`);
    }
    if (result.status === 'failed' || result.status === 'timedOut') {
      for (const err of result.errors) this.printError(err);
    }
  }

  onError(error: TestError): void {
    this.closeLine();
    this.printError(error);
  }

  onEnd(result: FullResult): void {
    this.closeLine();
    process.stdout.write(`\n${result.status === 'passed' ? '✓' : '✘'} Lauf ${result.status} nach ${formatTestDuration(result.duration)}\n`);
  }

  private passThrough(chunk: string | Buffer): void {
    this.closeLine();
    process.stdout.write(chunk.toString());
  }

  private closeLine(): void {
    if (this.openLine) {
      process.stdout.write('\n');
      this.openLine = false;
    }
  }

  private printError(err: TestError): void {
    // Erste Zeilen reichen fürs Live-Log; Details stehen in Tabelle und Report.
    const msg = stripAnsi(err.message ?? err.value ?? '').split('\n').slice(0, 8);
    process.stdout.write(msg.map((l) => `    ${l}`).join('\n') + '\n');
  }
}
