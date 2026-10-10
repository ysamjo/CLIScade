const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawn, execFileSync } = require('child_process');

const {
  armIdleWatchdog,
  knownBrokenBlocker,
  startupRefusal,
  dispatchSlotDecision,
  gatewayEnvFromShell,
  isJobDue
} = require('../routing');

// Waet until a process is gone, so no test leaves orphans behind.
function closed(child) {
  return new Promise((resolve) => child.on('close', (code, signal) => resolve({ code, signal })));
}

function collectOutput(child) {
  const out = [];
  child.stdout.on('data', (d) => out.push(d.toString()));
  child.stderr.on('data', (d) => out.push(d.toString()));
  return out;
}

test('killt eine Route, die ueber die Frist nichts schreibt', async () => {
  const child = spawn('/bin/sh', ['-c', 'echo los; sleep 20']);
  collectOutput(child);
  const done = closed(child);

  let fire = null;
  const watchdog = armIdleWatchdog(child, {
    idleMs: 400,
    graceMs: 100,
    onFire: (info) => { fire = info; }
  });

  const exit = await done;
  watchdog.stop();

  assert.ok(fire, 'onFire muss melden, dass die Route haengt');
  assert.strictEqual(fire.idleMs, 400);
  assert.ok(exit.signal || exit.code !== 0, 'Prozess muss beendet worden sein');
});

test('laesst eine Route in Ruhe, die regelmaessig schreibt', async () => {
  const child = spawn('/bin/sh', ['-c', 'for i in 1 2 3 4 5; do echo tick; sleep 0.2; done']);
  collectOutput(child);
  const done = closed(child);

  let fired = false;
  const watchdog = armIdleWatchdog(child, {
    idleMs: 600,
    graceMs: 100,
    onFire: () => { fired = true; }
  });

  const exit = await done;
  watchdog.stop();

  assert.strictEqual(fired, false, 'Laeufe mit regelmaessiger Ausgabe duerfen nicht abgebrochen werden');
  assert.strictEqual(exit.code, 0);
});

test('stoppt nach stop() und feuert nie spaeter', async () => {
  const child = spawn('/bin/sh', ['-c', 'echo da; sleep 3']);
  collectOutput(child);

  let fired = false;
  const watchdog = armIdleWatchdog(child, {
    idleMs: 300,
    graceMs: 50,
    onFire: () => { fired = true; }
  });
  watchdog.stop();

  await new Promise((r) => setTimeout(r, 700));
  assert.strictEqual(fired, false, 'ein stoppeder Watchdog darf den Nachfolger nicht killen');

  child.kill('SIGKILL');
  await closed(child);
});

test('Frist liesst HARNESS_IDLE_TIMEOUT_MS, damit ein End-to-End-Test nicht drei Minuten wartet', () => {
  const out = execFileSync(process.execPath, ['-p', 'require("./routing").RUN_IDLE_TIMEOUT_MS'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, HARNESS_IDLE_TIMEOUT_MS: '2500' },
    encoding: 'utf8'
  });
  // FORCE_COLOR faerbt Node's -p-Ausgabe gelb; der Wert selbst bleibt derselbe.
  const wert = out.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '').trim();
  assert.strictEqual(wert, '2500');
});

test('ueberspringt eine Route mit frischem Login-Fehler', () => {
  const broken = { opencode: { errorKind: 'auth', at: Date.now() - 3 * 60 * 60 * 1000 } };
  const blocker = knownBrokenBlocker({ command: 'opencode', name: 'OpenCode' }, broken, {});
  assert.ok(blocker, 'ein bekannter Login-Fehler muss die Route vorab bremsen');
  assert.match(blocker, /Login/);
  assert.match(blocker, /vor 3 h/);
});

test('bremst nicht, wenn der Nutzer die Route selbst gewaehlt hat', () => {
  const broken = { opencode: { errorKind: 'auth', at: Date.now() - 60 * 1000 } };
  const blocker = knownBrokenBlocker({ command: 'opencode', name: 'OpenCode' }, broken, { explicitChoice: true });
  assert.strictEqual(blocker, null, 'eine explizite Wahl darf nie still uebersprungen werden');
});

test('bremst nur Login-Fehler, nicht Quota-Voll', () => {
  const broken = { cline: { errorKind: 'rate_limit', at: Date.now() } };
  assert.strictEqual(knownBrokenBlocker({ command: 'cline', name: 'Cline' }, broken, {}), null);
});

test('meldet eine Route, die ihre Konfiguration ablehnt, obwohl sie mit 0 endet', () => {
  const ausgabe = 'Configuration is invalid at /Users/family/.config/opencode/opencode.jsonc\n'
    + '\u21B3 Expected { readonly "type": "local", ... }, got {"harness-dispatch":{...}} mcp.servers\n';
  const grund = startupRefusal(ausgabe);
  assert.ok(grund, 'ein Start, den die CLI selbst ablehnt, darf kein Erfolg sein');
  assert.match(grund, /Configuration is invalid/);
});

test('erkennt einen Start mit unbekanntem Flag', () => {
  assert.match(startupRefusal('error: unknown option "--permission-mode"'), /unknown option/);
});

test('laesst eine Route durch, die wirklich gearbeitet hat', () => {
  assert.strictEqual(startupRefusal('Ich habe die Konfiguration pruefen lassen und zwei Dateien geaendert.\nFertig.'), null);
  assert.strictEqual(startupRefusal(''), null);
});

// runningForGate() liefert pro Lauf eine Kommandoliste: ein Konsens laeuft mit zwei
// Engines, ein Auto-Lauf mit der einen, die die Kette gerade gewaehlt hat.
test('laesst einen Task warten, wenn die Kappe voll ist', () => {
  const running = [
    { taskId: 't1', projectPath: '/a', commands: ['opencode'] },
    { taskId: 't2', projectPath: '/b', commands: ['cline'] }
  ];
  const block = dispatchSlotDecision({
    maxConcurrent: 2,
    running,
    incoming: { projectPath: '/c', candidates: ['claude'] }
  });
  assert.strictEqual(block.reason, 'capacity');
});

test('laesst denselben Harness in einem anderen Ordner arbeiten', () => {
  const running = [{ taskId: 't1', projectPath: '/a', commands: ['cline'] }];
  const block = dispatchSlotDecision({
    running,
    incoming: { projectPath: '/b', requires: ['cline'] }
  });
  assert.strictEqual(block, null, 'zwei Cline-Laeufe in zwei Ordner sind zwei Kontingente nicht kaputtmachen');
});

test('startet ohne Kappe beliebig viele Aufträge', () => {
  const running = ['t1', 't2', 't3', 't4', 't5'].map((taskId, i) => ({ taskId, projectPath: `/o${i}`, commands: [`c${i}`] }));
  const block = dispatchSlotDecision({
    running,
    incoming: { projectPath: '/z', candidates: ['claude'] }
  });
  assert.strictEqual(block, null, 'maxConcurrent 0 oder fehlend heisst: keine Kappe');
});

test('laesst zwei Tasks im selben Ordner nicht gleichzeitig arbeiten', () => {
  const running = [{ taskId: 't1', projectPath: '/a', commands: ['opencode'] }];
  const block = dispatchSlotDecision({
    maxConcurrent: 3,
    running,
    incoming: { projectPath: '/a', candidates: ['cline'] }
  });
  assert.strictEqual(block.reason, 'project');
  assert.strictEqual(block.blocker.taskId, 't1', 'der wartende Task muss nennen, wer den Ordner haelt');
});

test('startet auto, solange wenigstens eine Kette frei ist', () => {
  const running = [{ taskId: 't1', projectPath: '/a', commands: ['cline'] }];
  const block = dispatchSlotDecision({
    maxConcurrent: 3,
    running,
    incoming: { projectPath: '/b', candidates: ['cline', 'claude'] }
  });
  assert.strictEqual(block, null, 'auto darf starten und weicht in der Kette auf claude aus');
});

test('startet auto auch dann, wenn die ganze Kette belegt ist', () => {
  const running = [
    { taskId: 't1', projectPath: '/a', commands: ['cline'] },
    { taskId: 't2', projectPath: '/b', commands: ['claude'] }
  ];
  const block = dispatchSlotDecision({
    running,
    incoming: { projectPath: '/c', candidates: ['cline', 'claude'] }
  });
  assert.strictEqual(block, null, 'zwei Cline-Laeufe stoeren sich nicht — die Kappe regelt die Zahl');
});

test('laesst nichts starten, wenn ueberhaupt nichts laeuft', () => {
  const block = dispatchSlotDecision({
    running: [],
    incoming: { projectPath: '/c', candidates: ['cline', 'claude'] }
  });
  assert.strictEqual(block, null, 'eine leere Liste ist keine belegte Kette');
});

test('laesst Konsens starten, wenn nur ein gewoehnlicher Harness belegt ist', () => {
  const running = [{ taskId: 't1', projectPath: '/a', commands: ['claude'] }];
  const block = dispatchSlotDecision({
    running,
    incoming: { projectPath: '/b', requires: ['cline', 'claude'] }
  });
  assert.strictEqual(block, null, 'beide Engines teilen zu koennen ist kein Grund zu warten');
});

test('startet Konsens, wenn beide Engines frei sind', () => {
  const running = [{ taskId: 't1', projectPath: '/a', commands: ['opencode'] }];
  const block = dispatchSlotDecision({
    running,
    incoming: { projectPath: '/b', requires: ['cline', 'claude'] }
  });
  assert.strictEqual(block, null);
});

// --- Was das Terminal auf den eigenen Gateway biegt -----------------------

const GATEWAY = ['ANTHROPIC_BASE_URL', 'ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL'];

test('holt die Gateway-Variablen aus der Shell-Umgebung des Terminals', () => {
  const picked = gatewayEnvFromShell({
    shellEnv: { ANTHROPIC_BASE_URL: 'http://localhost:20128/v1', ANTHROPIC_MODEL: 'c1', TERM_PROGRAM: 'iTerm.app' },
    currentEnv: {},
    names: GATEWAY
  });
  assert.deepStrictEqual(picked, {
    ANTHROPIC_BASE_URL: 'http://localhost:20128/v1',
    ANTHROPIC_MODEL: 'c1'
  }, 'nur die genannten Variablen, keine Shell-Kosmetik');
});

test('laesst eine bereits gesetzte Gateway-Variable in Ruhe', () => {
  const picked = gatewayEnvFromShell({
    shellEnv: { ANTHROPIC_BASE_URL: 'http://localhost:20128/v1' },
    currentEnv: { ANTHROPIC_BASE_URL: 'http://router.internal:8080/v1' },
    names: GATEWAY
  });
  assert.deepStrictEqual(picked, {}, 'der Startprozess weiss mehr als die Shell');
});

test('ueberspringt Gateway-Variablen, die auch die Shell nicht kennt', () => {
  const picked = gatewayEnvFromShell({ shellEnv: { ANTHROPIC_API_KEY: '' }, currentEnv: {}, names: GATEWAY });
  assert.deepStrictEqual(picked, {});
});

test('neue Tages- und Wochenjobs laufen erst zum nächsten Termin', () => {
  const createdAt = '2026-10-05T08:05:00';
  assert.equal(isJobDue({ interval: 'daily_08_00', createdAt }, new Date('2026-10-05T08:06:00')), false);
  assert.equal(isJobDue({ interval: 'daily_08_00', createdAt }, new Date('2026-10-06T08:00:00')), true);
  assert.equal(isJobDue({ interval: 'weekly_monday', createdAt }, new Date('2026-10-05T08:06:00')), false);
  assert.equal(isJobDue({ interval: 'weekly_monday', createdAt }, new Date('2026-10-12T08:00:00')), true);
});
