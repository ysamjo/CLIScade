const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runHarness } = require('../../runtime/harness-runtime');
const { acquireSession } = require('../../runtime/session-store');

test('Codex-Ausgabe wird als Text und Session normalisiert', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-runtime-'));
  const bin = path.join(root, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'codex'), '#!/bin/sh\necho \'{"type":"thread.started","thread_id":"abc"}\'\necho \'{"type":"item.completed","item":{"type":"agent_message","text":"Antwort"}}\'\necho \'{"type":"turn.completed"}\'\n', { mode: 0o755 });
  const events = [];
  const result = await runHarness({ harnessId: 'codex', prompt: 'Aufgabe', cwd: root, env: { ...process.env, HOME: root, PATH: `${bin}:${process.env.PATH}` }, onEvent: (event) => events.push(event) });
  assert.equal(result.status, 'completed');
  assert.equal(result.sessionId, 'abc');
  assert.equal(result.finalText, 'Antwort');
  assert.ok(events.some((event) => event.type === 'text' && event.text === 'Antwort'));
  fs.rmSync(root, { recursive: true, force: true });
});

test('Ein Harness ausserhalb der Registry erreicht den Runner nicht', async () => {
  const result = await runHarness({ harnessId: 'gibtsnicht', prompt: 'Aufgabe', cwd: os.tmpdir() });
  assert.equal(result.status, 'failed');
  assert.equal(result.error.kind, 'harness_failure');
});

test('Resume wird nur bei vorhandener Session verwendet und ist exklusiv', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-resume-'));
  const bin = path.join(root, 'bin');
  const sessions = path.join(root, '.codex', 'sessions', '2026', '10', '08');
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(sessions, { recursive: true });
  fs.writeFileSync(path.join(bin, 'codex'), '#!/bin/sh\necho "ARGS=$*"\n', { mode: 0o755 });
  const env = { ...process.env, HOME: root, PATH: `${bin}:${process.env.PATH}` };
  const lost = await runHarness({ harnessId: 'codex', prompt: 'Aufgabe', cwd: root, env, previousSessionId: 'abc' });
  assert.equal(lost.status, 'completed');
  assert.ok(lost.events.some((event) => event.type === 'session_lost'));
  assert.doesNotMatch(lost.finalText, /resume abc/);
  fs.writeFileSync(path.join(sessions, 'rollout-abc.jsonl'), '{}\n');
  const release = acquireSession('codex', 'abc');
  const busy = await runHarness({ harnessId: 'codex', prompt: 'Aufgabe', cwd: root, env, previousSessionId: 'abc' });
  assert.equal(busy.error.kind, 'session_busy');
  release();
  const resumed = await runHarness({ harnessId: 'codex', prompt: 'Aufgabe', cwd: root, env, previousSessionId: 'abc' });
  assert.match(resumed.finalText, /resume abc/);
  assert.match(resumed.finalText, /Headless-Auftrag mit fachlicher Autonomie/);
  assert.match(resumed.finalText, /AGENTS\.md haben Vorrang/);
  assert.equal(resumed.finalText.split('Headless-Auftrag mit fachlicher Autonomie').length - 1, 1);
  fs.rmSync(root, { recursive: true, force: true });
});
