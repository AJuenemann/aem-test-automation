/**
 * Port-Prüfung beim Start des Cockpits: wer belegt den Port, ist es eine eigene (hängende) Instanz
 * und lässt sie sich beenden? Nur Node-Bordmittel plus `lsof`/`ps` (macOS, Linux). Fehlen sie,
 * liefern die Funktionen leere Ergebnisse und der Start meldet den Port als belegt, ohne etwas zu beenden.
 */
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';

/** Prozess, der einen Port belegt. */
export interface ProcessInfo {
  pid: number;
  /** Vollständige Kommandozeile (`ps -o command=`), leer wenn nicht lesbar. */
  command: string;
  /** Arbeitsverzeichnis, leer wenn nicht lesbar. */
  cwd: string;
}

/** Führt ein Programm aus und liefert stdout. Fehler (auch „nichts gefunden“, Exit 1) ergeben ''. */
function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 4000, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      resolve(err ? '' : String(stdout));
    });
  });
}

/** PIDs aus der Ausgabe von `lsof -t` (eine Zahl je Zeile). */
export function parsePids(output: string): number[] {
  const pids = output
    .split('\n')
    .map((l) => Number(l.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  return [...new Set(pids)];
}

/** PIDs der Prozesse, die auf `port` lauschen (TCP, alle Adressen). */
export async function listeningPids(port: number): Promise<number[]> {
  return parsePids(await run('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t']));
}

/** Kommandozeile und Arbeitsverzeichnis eines Prozesses. */
export async function processInfo(pid: number): Promise<ProcessInfo> {
  const command = (await run('ps', ['-ww', '-o', 'command=', '-p', String(pid)])).trim();
  const cwdLine = (await run('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn']))
    .split('\n')
    .find((l) => l.startsWith('n'));
  return { pid, command, cwd: cwdLine ? cwdLine.slice(1).trim() : '' };
}

/** Gleicher Pfad, auch über Symlinks hinweg (z. B. iCloud-/Home-Pfade). */
async function samePath(a: string, b: string): Promise<boolean> {
  if (!a || !b) return false;
  if (path.resolve(a) === path.resolve(b)) return true;
  try {
    return (await fs.realpath(a)) === (await fs.realpath(b));
  } catch {
    return false;
  }
}

/**
 * Ist das ein Cockpit dieses Projekts? Ja, wenn die Kommandozeile den absoluten Pfad von
 * `cockpit/server.ts` nennt, oder `cockpit/server.ts` relativ und das Arbeitsverzeichnis der Suite-Root ist.
 * Fremde Prozesse und Cockpits anderer Kopien des Projekts zählen nicht.
 */
export async function isOwnCockpit(info: ProcessInfo, suiteRoot: string): Promise<boolean> {
  const server = path.join(suiteRoot, 'cockpit', 'server.ts');
  if (info.command.includes(server)) return true;
  if (!/(^|[\s/\\])cockpit[\\/]server\.ts(\s|$)/.test(info.command)) return false;
  return samePath(info.cwd, suiteRoot);
}

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: der Prozess lebt, gehört aber jemand anderem.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Beendet einen Prozess: erst SIGTERM (das Cockpit stoppt dabei einen laufenden Test sauber),
 * danach SIGCONT (ein angehaltener Prozess nimmt SIGTERM sonst nicht an) und nach `graceMs` SIGKILL.
 * true = Prozess ist weg.
 */
export async function terminate(pid: number, graceMs = 3000): Promise<boolean> {
  if (!alive(pid)) return true;
  try {
    process.kill(pid, 'SIGTERM');
    process.kill(pid, 'SIGCONT');
  } catch {
    return !alive(pid);
  }
  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline) {
    if (!alive(pid)) return true;
    await sleep(100);
  }
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    /* schon weg */
  }
  const killDeadline = Date.now() + 2000;
  while (Date.now() < killDeadline) {
    if (!alive(pid)) return true;
    await sleep(50);
  }
  return !alive(pid);
}

/** Kommandozeile für die Anzeige kürzen (Pfade im Home-Verzeichnis sind lang). */
export function shortCommand(command: string, max = 110): string {
  const one = command.replace(/\s+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one || '(unbekannt)';
}

/** Reste der pf-Weiterleitung 80 → 4321 vom 19.11.2026. Sie legt direkte Verbindungen zu 4321 lahm. */
export const PF_ANCHOR_FILE = '/etc/pf.anchors/cockpit';

/**
 * Warntext, wenn das Cockpit lauscht, aber nicht antwortet. Ist die alte pf-Weiterleitung noch eingerichtet,
 * nennt er sie als Ursache samt Befehlen zum Entfernen (nur Anzeige, ausgeführt wird nichts).
 */
export function unreachableMessage(port: number, pfAnchorExists: boolean): string {
  const head =
    `\nAchtung: Das Test-Cockpit lauscht auf Port ${port}, antwortet aber nicht auf Verbindungen von diesem Rechner.\n` +
    `Der Browser meldet dann „Website nicht erreichbar“.\n`;
  const other = `Anderen Port wählen, z.B.:  COCKPIT_PORT=${port + 1} npm run cockpit\n`;
  if (!pfAnchorExists) {
    return `${head}Mögliche Ursache: ein Netzwerkfilter oder eine Sicherheitssoftware blockiert den Port.\n${other}`;
  }
  return (
    `${head}Ursache: Die pf-Weiterleitung Port 80 → 4321 (${PF_ANCHOR_FILE}) ist noch eingerichtet und blockiert den Port.\n` +
    `Entfernen (Administratorrechte nötig):\n` +
    `  sudo pfctl -a com.apple/cockpit -F all\n` +
    `  sudo launchctl bootout system /Library/LaunchDaemons/local.cockpit.pf.plist\n` +
    `  sudo rm /Library/LaunchDaemons/local.cockpit.pf.plist ${PF_ANCHOR_FILE}\n` +
    `Oder ohne Eingriff einen anderen Port wählen, z.B.:  COCKPIT_PORT=${port + 1} npm run cockpit\n`
  );
}
