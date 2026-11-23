import { test, expect } from '@playwright/test';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { parsePids, listeningPids, processInfo, isOwnCockpit, terminate, shortCommand, unreachableMessage, PF_ANCHOR_FILE } from '../../cockpit/portguard.js';

/**
 * Port-Prüfung beim Start des Cockpits (cockpit/portguard.ts und `start()` in cockpit/server.ts).
 * Kein AEM. Die Start-Fälle starten das echte Cockpit auf einem freien Port und halten es mit SIGSTOP an:
 * Der Port bleibt belegt, der Dienst antwortet nicht (wie bei der Störung am 23.11.2026).
 */
const ROOT = process.cwd();
const TSX = path.join(ROOT, 'node_modules', '.bin', 'tsx');
const hasLsof = (() => { try { execFileSync('lsof', ['-v'], { stdio: 'ignore' }); return true; } catch { return false; } })();

const children: ChildProcess[] = [];
const extraPids: number[] = [];
test.afterEach(() => {
  for (const c of children.splice(0)) {
    try { process.kill(-c.pid!, 'SIGKILL'); } catch { /* keine Gruppe */ }
    try { c.kill('SIGKILL'); } catch { /* weg */ }
  }
  for (const pid of extraPids.splice(0)) { try { process.kill(pid, 'SIGCONT'); process.kill(pid, 'SIGKILL'); } catch { /* weg */ } }
});

const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => { const { port } = s.address() as { port: number }; s.close(() => resolve(port)); });
  });
}

async function until<T>(fn: () => Promise<T | null | false | undefined>, ms = 20000): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = await fn(); if (v) return v; await sleep(150); }
  throw new Error('Zeit abgelaufen');
}

async function ping(port: number, timeout = 1500): Promise<{ app?: string; pid?: number } | null> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/ping`, { signal: AbortSignal.timeout(timeout) });
    return (await res.json()) as { app?: string; pid?: number };
  } catch { return null; }
}

/** Startet das Cockpit; wartet nicht. Ausgabe sammelt `out`. */
function startCockpit(port: number, extraEnv: Record<string, string> = {}) {
  const out = { text: '' };
  // detached: eigene Prozessgruppe, damit das Aufräumen auch den von tsx gestarteten Node-Prozess trifft.
  const child = spawn(TSX, ['cockpit/server.ts'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
    env: { ...process.env, COCKPIT_PORT: String(port), COCKPIT_NO_OPEN: '1', ...extraEnv },
  });
  child.stdout.on('data', (d) => (out.text += d));
  child.stderr.on('data', (d) => (out.text += d));
  children.push(child);
  const exited = new Promise<number | null>((resolve) => child.on('exit', (code) => resolve(code)));
  return { child, out, exited };
}

/** Cockpit starten, bis es antwortet; gibt die PID des lauschenden Prozesses zurück. */
async function runningCockpit(port: number) {
  const run = startCockpit(port);
  await until(async () => (await ping(port))?.app === 'aem-test-cockpit');
  const [pid] = await listeningPids(port);
  extraPids.push(pid);
  return { ...run, pid };
}

test.describe('Port-Prüfung: Bausteine', { tag: '@unit' }, () => {
  test('PIDs aus lsof-Ausgabe: Zahlen, ohne Doppelte und Müll', () => {
    expect(parsePids('123\n456\n123\n')).toEqual([123, 456]);
    expect(parsePids('')).toEqual([]);
    expect(parsePids('abc\n-4\n0\n7\n')).toEqual([7]);
  });

  test('Erkennung: nur das Cockpit dieses Projekts zählt als eigener Prozess', async () => {
    const cmd = (c: string, cwd = '') => ({ pid: 1, command: c, cwd });
    const own = (c: string, cwd?: string) => isOwnCockpit(cmd(c, cwd), ROOT);
    // Absoluter Pfad: unabhängig vom Arbeitsverzeichnis.
    expect(await own(`node --require x ${path.join(ROOT, 'cockpit', 'server.ts')}`, '/tmp')).toBe(true);
    // Relativ: nur mit Suite-Root als Arbeitsverzeichnis.
    expect(await own('node --require x cockpit/server.ts', ROOT)).toBe(true);
    expect(await own('node --require x cockpit/server.ts', '/tmp')).toBe(false);
    expect(await own('node --require x cockpit/server.ts', '')).toBe(false);
    // Fremde Prozesse und ähnliche Namen.
    expect(await own('node other/server.ts', ROOT)).toBe(false);
    expect(await own('node mycockpit/server.ts', ROOT)).toBe(false);
    expect(await own('/usr/sbin/ControlCenter', ROOT)).toBe(false);
    expect(await own('', ROOT)).toBe(false);
    // Anderes Projekt mit gleichem Aufbau: absoluter Pfad ist ein anderer.
    expect(await own('node /anderes/projekt/cockpit/server.ts', '/anderes/projekt')).toBe(false);
  });

  test('Anzeige: Kommandozeile wird gekürzt und leere Eingabe benannt', () => {
    expect(shortCommand('a   b\n c')).toBe('a b c');
    expect(shortCommand('x'.repeat(300), 20)).toHaveLength(20);
    expect(shortCommand('')).toBe('(unbekannt)');
  });

  test('Warnung bei nicht antwortendem Port: nennt Ausweich-Port, bei alter pf-Weiterleitung auch Ursache und Befehle', () => {
    const plain = unreachableMessage(4321, false);
    expect(plain).toContain('lauscht auf Port 4321, antwortet aber nicht');
    expect(plain).toContain('COCKPIT_PORT=4322');
    expect(plain).not.toContain('sudo');
    const pf = unreachableMessage(4321, true);
    expect(pf).toContain(PF_ANCHOR_FILE);
    expect(pf).toContain('sudo pfctl -a com.apple/cockpit -F all');
    expect(pf).toContain('sudo launchctl bootout system /Library/LaunchDaemons/local.cockpit.pf.plist');
    expect(pf).toContain('COCKPIT_PORT=4322');
  });

  test('Beenden: SIGTERM reicht, ein Prozess ohne SIGTERM-Behandlung fällt auf SIGKILL zurück', async () => {
    const polite = spawn('node', ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
    const stubborn = spawn('node', ['-e', "process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"], { stdio: 'ignore' });
    children.push(polite, stubborn);
    await sleep(600);
    expect(await terminate(polite.pid!, 3000)).toBe(true);
    expect(alive(polite.pid!)).toBe(false);
    const t0 = Date.now();
    expect(await terminate(stubborn.pid!, 700)).toBe(true);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(600);
    expect(alive(stubborn.pid!)).toBe(false);
    // Schon beendeter Prozess: kein Fehler.
    expect(await terminate(stubborn.pid!)).toBe(true);
  });

  test('Beenden: auch ein angehaltener Prozess (SIGSTOP) wird entfernt', async () => {
    const stopped = spawn('node', ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
    children.push(stopped);
    await sleep(600);
    process.kill(stopped.pid!, 'SIGSTOP');
    expect(await terminate(stopped.pid!, 2000)).toBe(true);
    expect(alive(stopped.pid!)).toBe(false);
  });

  test('Lauschender Prozess: Port, PID, Kommandozeile und Arbeitsverzeichnis werden gefunden', async () => {
    test.skip(!hasLsof, 'lsof nicht verfügbar.');
    const port = await freePort();
    const child = spawn('node', ['-e', `require('net').createServer().listen(${port},'127.0.0.1');setInterval(()=>{},1000)`], { cwd: '/tmp', stdio: 'ignore' });
    children.push(child);
    const pids = await until(async () => { const p = await listeningPids(port); return p.length ? p : null; });
    expect(pids).toEqual([child.pid]);
    const info = await processInfo(child.pid!);
    expect(info.command).toContain('node -e');
    expect(await isOwnCockpit(info, ROOT)).toBe(false);
    expect(info.cwd.replace(/^\/private/, '')).toBe('/tmp');
    expect(await listeningPids(await freePort())).toEqual([]);
  });
});

test.describe('Port-Prüfung: Start des Cockpits', { tag: '@unit' }, () => {
  test.skip(!hasLsof, 'lsof nicht verfügbar.');
  test.setTimeout(120_000);

  test('Freier Port: normaler Start, kein Eingriff', async () => {
    const port = await freePort();
    const run = startCockpit(port);
    await until(async () => (await ping(port))?.app === 'aem-test-cockpit');
    expect(run.out.text).toContain(`läuft:  http://cockpit.localhost:${port}/`);
    expect(run.out.text).not.toContain('Beende ');
    expect(run.out.text).not.toContain('Achtung');
  });

  test('Eigene Instanz hängt (SIGSTOP), COCKPIT_FORCE=1: wird beendet, neue Instanz übernimmt den Port', async () => {
    const port = await freePort();
    const first = await runningCockpit(port);
    process.kill(first.pid, 'SIGSTOP');
    expect(await ping(port, 800)).toBeNull();
    const second = startCockpit(port, { COCKPIT_FORCE: '1' });
    const answer = await until(async () => { const p = await ping(port); return p?.pid && p.pid !== first.pid ? p : null; }, 30000);
    expect(answer.app).toBe('aem-test-cockpit');
    expect(second.out.text).toContain(`nicht antwortende Test-Cockpit (PID ${first.pid}) auf Port ${port}`);
    expect(alive(first.pid)).toBe(false);
    expect(second.out.text).not.toContain('Achtung');
  });

  test('Eigene Instanz hängt, kein Terminal und kein COCKPIT_FORCE: nichts wird beendet, klare Meldung', async () => {
    const port = await freePort();
    const first = await runningCockpit(port);
    process.kill(first.pid, 'SIGSTOP');
    const second = startCockpit(port);
    expect(await second.exited).toBe(1);
    expect(second.out.text).toContain('antwortet aber nicht');
    expect(second.out.text).toContain('COCKPIT_FORCE=1');
    expect(second.out.text).toContain(`PID ${first.pid}`);
    expect(alive(first.pid)).toBe(true);
  });

  test('Fremder Prozess belegt den Port: wird nie beendet, Meldung nennt PID und Befehl', async () => {
    const port = await freePort();
    const foreign = spawn('node', ['-e', `require('net').createServer().listen(${port},'127.0.0.1');setInterval(()=>{},1000)`], { stdio: 'ignore' });
    children.push(foreign);
    await until(async () => (await listeningPids(port)).length > 0);
    // Auch mit COCKPIT_FORCE=1 bleibt ein fremder Prozess unangetastet.
    const run = startCockpit(port, { COCKPIT_FORCE: '1' });
    expect(await run.exited).toBe(1);
    expect(run.out.text).toContain('fremden Prozess');
    expect(run.out.text).toContain(`PID ${foreign.pid}`);
    expect(run.out.text).toContain(`COCKPIT_PORT=${port + 1}`);
    expect(alive(foreign.pid!)).toBe(true);
  });

  test('Antwortende eigene Instanz: der bisherige Neustart-Ablauf bleibt (COCKPIT_FORCE=1 ersetzt sie)', async () => {
    const port = await freePort();
    const first = await runningCockpit(port);
    const second = startCockpit(port, { COCKPIT_FORCE: '1' });
    const answer = await until(async () => { const p = await ping(port); return p?.pid && p.pid !== first.pid ? p : null; }, 30000);
    expect(answer.app).toBe('aem-test-cockpit');
    expect(second.out.text).toContain(`Beende die laufende Instanz auf Port ${port}`);
    expect(alive(first.pid)).toBe(false);
  });
});
