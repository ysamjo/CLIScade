'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { runAcp, acpUpdate } = require('../../runtime/acp-runner');
const { normalizeRoutes } = require('../../runtime/registry');

const fixture = path.join(__dirname, '..', 'fixtures', 'mock-acp.js');
const run = (mode, options = {}) => runAcp({
  harnessId: 'opencode', cwd: process.cwd(), model: 'Standard', prompt: 'Test',
  env: { ...process.env, MOCK_ACP_MODE: mode },
  program: { command: process.execPath, args: [fixture] },
  timeoutMs: 3000, idleTimeoutMs: 2000, ...options
});

test('ACP v1 session/new, prompt and tool updates are converted to task events', async () => {
  const events = [];
  const result = await run('ok', { onEvent: event => events.push(event) });
  assert.equal(result.status, 'completed');
  assert.equal(result.transport, 'acp');
  assert.equal(result.sessionId, 'session-one');
  assert.equal(result.finalText, 'Fertig');
  assert.ok(events.some(event => event.type === 'tool_start'));
  assert.ok(events.some(event => event.type === 'tool_result' && event.exitCode === null));
});

test('ACP session/resume uses the separate ACP session namespace', async () => {
  const result = await run('ok', { previousSessionId: 'session-old',
    previousSessionTransport: 'acp' });
  assert.equal(result.status, 'completed');
  assert.equal(result.sessionId, 'session-old');
});

test('Different transport does not reuse a headless session ID', async () => {
  const result = await run('ok', { previousSessionId: 'session-old',
    previousSessionTransport: 'headless' });
  assert.equal(result.sessionId, 'session-one');
});

test('ACP unknown protocol version fails without sending a prompt', async () => {
  const result = await run('badversion');
  assert.equal(result.status, 'failed');
  assert.match(result.error.message, /Version/);
});

test('ACP corrupt JSON-RPC fails visibly', async () => {
  const result = await run('broken');
  assert.equal(result.status, 'failed');
  assert.equal(result.error.kind, 'protocol');
});

test('ACP permissions are cancelled, not automatically granted', async () => {
  const events = [];
  const result = await run('permission', { onEvent: event => events.push(event) });
  assert.equal(result.status, 'failed');
  assert.equal(result.error.kind, 'permission');
  assert.ok(events.some(event => event.type === 'warning' && /Freigabe/.test(event.text)));
});

test('ACP cancellation cancels the running process and task', async () => {
  const controller = new AbortController();
  const started = run('hang', { signal: controller.signal, idleTimeoutMs: 5000 });
  setTimeout(() => controller.abort(), 100);
  const result = await started;
  assert.equal(result.status, 'cancelled');
});

test('ACP route configuration retains only known ACP transports', () => {
  assert.equal(normalizeRoutes([{ name: 'OpenCode', harnessId: 'opencode', transport: 'acp' }])[0].transport, 'acp');
  assert.equal(normalizeRoutes([{ name: 'Cline', harnessId: 'cline', transport: 'acp' }])[0].transport, undefined);
});

test('ACP events never invent shell exit codes', () => {
  assert.equal(acpUpdate({ sessionUpdate: 'tool_call_update', status: 'completed' }).exitCode, null);
});
