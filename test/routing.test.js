const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { spawn, execFileSync } = require('child_process');

const {
  armIdleWatchdog,
  routePolicyBlocker,
  knownBrokenBlocker
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
  }).trim();
  assert.strictEqual(out, '2500');
});

test('blockiert eine Route, die Bezahl-Nutzung ablehnt', () => {
  const blocker = routePolicyBlocker({ command: 'claude', name: 'Claude Code', billing_kind: 'metered_api', allow_paid_usage: false });
  assert.ok(blocker, 'allow_paid_usage:false muss die Route bremsen');
  assert.match(blocker, /Bezahl/);
});

test('laesst eine Route mit erlaubter Bezahl-Nutzung durch', () => {
  assert.strictEqual(routePolicyBlocker({ command: 'agy', billing_kind: 'metered_api', allow_paid_usage: true }), null);
});

test('laesst reine Plan-Nutzung immer durch', () => {
  assert.strictEqual(routePolicyBlocker({ command: 'opencode', billing_kind: 'included_plan_usage' }), null);
});

test('blockiert ein Bezahltmodell, obwohl die Route Gratis verlangt', () => {
  const blocker = routePolicyBlocker({
    command: 'opencode',
    name: 'OpenCode',
    model: 'anthropic/claude-sonnet-5-5',
    billing_kind: 'included_plan_usage',
    allow_paid_usage: false
  });
  assert.ok(blocker, 'ein Modell ausserhalb des Plans kostet extra und darf nicht heimlich gemailt werden');
  assert.match(blocker, /claude-sonnet-5-5/);
});

test('laesst ein Gratismodell unter der Bezahl-Sperre durch', () => {
  assert.strictEqual(routePolicyBlocker({
    command: 'opencode',
    model: 'opencode/ling-3.1-flash-free',
    allow_paid_usage: false
  }), null);
});

test('ueberspringt eine Route mit frischem Login-Fehler', () => {
  const broken = { freebuff: { errorKind: 'auth', at: Date.now() - 3 * 60 * 60 * 1000 } };
  const blocker = knownBrokenBlocker({ command: 'freebuff', name: 'Freebuff' }, broken, {});
  assert.ok(blocker, 'ein bekannter Login-Fehler muss die Route vorab bremsen');
  assert.match(blocker, /Login/);
  assert.match(blocker, /vor 3 h/);
});

test('bremst nicht, wenn der Nutzer die Route selbst gewaehlt hat', () => {
  const broken = { freebuff: { errorKind: 'auth', at: Date.now() - 60 * 1000 } };
  const blocker = knownBrokenBlocker({ command: 'freebuff', name: 'Freebuff' }, broken, { explicitChoice: true });
  assert.strictEqual(blocker, null, 'eine explizite Wahl darf nie still uebersprungen werden');
});

test('bremst nur Login-Fehler, nicht Quota-Voll', () => {
  const broken = { cline: { errorKind: 'rate_limit', at: Date.now() } };
  assert.strictEqual(knownBrokenBlocker({ command: 'cline', name: 'Cline' }, broken, {}), null);
});
