const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runHarness, childEnv } = require('../../runtime/harness-runtime');

// Der Web-UI-Server der aufrufenden App heisst intern SERVER__PORT. Erben ihn die
// Harnesse, bindet der erste Lauf den belegten Port und stirbt mit EADDRINUSE
// ("address already in use 127.0.0.1:54968"), bevor der Auftrag beginnt.
test('SERVER__PORT und SERVER__HOST erreichen den Harness nicht', () => {
  const sauber = childEnv({
    SERVER__PORT: '54968',
    SERVER__HOST: '127.0.0.1',
    PATH: '/usr/bin',
    HOME: '/tmp'
  });
  assert.equal(sauber.SERVER__PORT, undefined);
  assert.equal(sauber.SERVER__HOST, undefined);
  assert.equal(sauber.PATH, '/usr/bin');
  assert.equal(sauber.HOME, '/tmp');
});

test('Die Originalumgebung bleibt unangetastet', () => {
  const original = { SERVER__PORT: '54968', PATH: '/usr/bin' };
  childEnv(original);
  assert.equal(original.SERVER__PORT, '54968');
});

test('Ein Lauf erbt den App-Port nicht bis in den Kindprozess', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-child-env-'));
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'agy'), '#!/bin/sh\nprintenv SERVER__PORT || echo OHNE_SERVER_PORT\n', { mode: 0o755 });
  const result = await runHarness({
    harnessId: 'antigravity',
    prompt: 'Aufgabe',
    cwd: root,
    env: { ...process.env, HOME: root, PATH: `${bin}:${process.env.PATH}`, SERVER__PORT: '54968', SERVER__HOST: '127.0.0.1' }
  });
  assert.equal(result.status, 'completed');
  assert.match(result.finalText, /OHNE_SERVER_PORT/);
  assert.doesNotMatch(result.finalText, /54968/);
  fs.rmSync(root, { recursive: true, force: true });
});
