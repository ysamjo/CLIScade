const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { TaskStore } = require('../services/task-store');
const { buildContext, checkpoint } = require('../services/context-service');
const { terminalMessage } = require('../public/task-state');
const { createAccessControl } = require('../services/access-control');
const { BeadsAdapter } = require('../services/beads-adapter');

function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hrg-architecture-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('Abschlussvertrag bewahrt Fehler, Abbruch und unvollständigen Konsens', () => {
  assert.equal(terminalMessage({ status: 'cancelled' }).type, 'cancelled');
  assert.equal(terminalMessage({ status: 'cancelled' }).exitCode, 130);
  assert.equal(terminalMessage({ status: 'failed', exitCode: 0 }).type, 'error');
  assert.equal(terminalMessage({ status: 'incomplete' }).status, 'incomplete');
  assert.equal(terminalMessage({ status: 'completed' }).type, 'done');
});

test('Aufträge, Request-IDs und Versuche überleben Neustart; Migration ist einmalig', (t) => {
  const dir = temporary(t);
  const legacy = path.join(dir, 'studio-tasks.json');
  fs.writeFileSync(legacy, JSON.stringify({ rootDirectory: dir, tasks: [{ id: 'alt', status: 'completed' }] }));
  let store = new TaskStore(dir, dir);
  store.put({ id: 'neu', status: 'running', requestId: 'request-123', payload: { prompt: 'Ziel' } });
  const attempt = store.beginAttempt('neu', { harnessId: 'codex' });
  store.addEvent(attempt, { type: 'text', text: 'Zwischenstand' });
  store.close();
  fs.writeFileSync(legacy, 'defekt');
  store = new TaskStore(dir, dir);
  t.after(() => store.close());
  assert.equal(store.findRequest('request-123').id, 'neu');
  assert.equal(store.read().tasks.length, 2);
  assert.equal(store.attempts('neu')[0].events[0].text, 'Zwischenstand');
  assert.ok(fs.existsSync(`${legacy}.before-sqlite`));
  store.reconcile();
  assert.equal(store.get('neu').status, 'incomplete');
  assert.equal(store.attempts('neu')[0].status, 'incomplete');
});

test('Kaputte alte Historie wird nicht als leere Historie importiert', (t) => {
  const dir = temporary(t);
  fs.writeFileSync(path.join(dir, 'studio-tasks.json'), '{');
  assert.throws(() => new TaskStore(dir, dir), /Historie/);
});

test('Gemeinsamer Kontext erhält Regeln, Bild und belegten Zwischenstand beim Fallback', () => {
  const previous = checkpoint({ id: 'alt', prompt: 'Ziel', status: 'failed', resultText: 'Datei geändert', projectPath: '/projekt' }, 'abc', 'M app.js');
  const text = buildContext({ rules: 'Keine Geheimnisse ausgeben', prompt: 'Fortsetzen', image: 'bild.png', previous, git: 'def', relay: { reason: 'Timeout', lastOutput: 'letzte Ausgabe' } });
  for (const needle of ['Keine Geheimnisse', 'bild.png', 'Datei geändert', 'Timeout', 'abc', 'def']) assert.match(text, new RegExp(needle));
  assert.match(text, /nicht.*verifiziert/i);
});

test('Zugang: lokaler Client bleibt nutzbar; LAN braucht Cookie; fremde Origin wird abgelehnt', (t) => {
  const access = createAccessControl(temporary(t), { hosts: ['localhost', '192.168.1.2'] });
  const local = { headers: { host: 'localhost:3000' }, socket: { remoteAddress: '127.0.0.1' } };
  assert.equal(access.authorized(local), true);
  assert.equal(access.authorized({ ...local, headers: { ...local.headers, origin: 'https://fremd.test' } }), false);
  const lan = { headers: { host: '192.168.1.2:3000', origin: 'http://192.168.1.2:3000' }, socket: { remoteAddress: '192.168.1.3' } };
  assert.equal(access.authorized(lan), false);
  assert.equal(access.login('falsch'), null);
  const code = fs.readFileSync(path.join(access.directory, 'lan-access-code'), 'utf8').trim();
  const cookie = access.login(code);
  assert.equal(access.authorized({ ...lan, headers: { ...lan.headers, cookie } }), true);
  assert.equal(access.authorized({ ...lan, headers: { ...lan.headers, cookie: `${cookie}defekt` } }), false);
  assert.equal(access.authorized({ ...local, headers: { host: 'fremd.test:3000' } }), false);
});

test('Beads läuft optional, serialisiert CLI-Zugriffe und schließt Aufgaben nie selbst', async (t) => {
  const dir = temporary(t);
  fs.mkdirSync(path.join(dir, '.beads'));
  let active = 0;
  let max = 0;
  const calls = [];
  const adapter = new BeadsAdapter({ execute: async (cwd, args) => {
    calls.push(args);
    active++; max = Math.max(max, active);
    await new Promise((resolve) => setTimeout(resolve, 15));
    active--;
    return JSON.stringify(args[0] === 'ready' ? [{ id: 'bd-123', title: 'Aufgabe' }] : [{ id: 'bd-123', title: 'Aufgabe', status: 'open' }]);
  } });
  const [ready, bead] = await Promise.all([adapter.ready(dir), adapter.show(dir, 'bd-123')]);
  assert.equal(ready[0].id, 'bd-123');
  assert.equal(bead.title, 'Aufgabe');
  assert.equal(max, 1);
  assert.ok(calls.every((args) => !args.includes('close')));
  await assert.rejects(adapter.show(dir, '--help'), /Beads-ID/);
  assert.deepEqual(await adapter.ready(path.dirname(dir)), []);
});

test('HTTP und WebSocket lehnen fremde Ursprünge vor dem Dispatch ab', async (t) => {
  const express = require('express');
  const http = require('node:http');
  const { WebSocket, WebSocketServer } = require('ws');
  const app = express();
  app.use(express.json());
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });
  createAccessControl(temporary(t)).install(app, server, wss);
  app.post('/api/test', (req, res) => res.json({ success: true }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { wss.close(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${url}/api/test`, { method: 'POST', headers: { Origin: 'https://fremd.test' } })).status, 403);
  assert.equal((await fetch(`${url}/api/test`, { method: 'POST' })).status, 200);
  const status = await new Promise((resolve, reject) => {
    const ws = new WebSocket(url.replace('http', 'ws'), { origin: 'https://fremd.test' });
    ws.on('unexpected-response', (request, response) => { response.resume(); request.destroy(); resolve(response.statusCode); });
    ws.on('error', () => {});
    ws.on('open', () => { ws.close(); reject(new Error('Fremde Origin wurde akzeptiert')); });
  });
  assert.equal(status, 401);
});
