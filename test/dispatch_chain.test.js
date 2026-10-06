// End-to-end check of the dispatch chain against stub harnesses, in a throwaway
// HOME and on its own port. Nothing here can touch the real config or spawn a
// real agent.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const WebSocket = require('ws');

const REPO = path.join(__dirname, '..');
const PORT = 3911;
const IDLE_MS = 1200;

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-chain-'));
const binDir = path.join(sandbox, 'bin');
const stateDir = path.join(sandbox, '.harness-dispatch');
const projectDir = path.join(sandbox, 'project');
const projectDirB = path.join(sandbox, 'project-b');
const markDir = path.join(sandbox, 'marks');
fs.mkdirSync(binDir, { recursive: true });
fs.mkdirSync(stateDir, { recursive: true });
fs.mkdirSync(projectDir, { recursive: true });
fs.mkdirSync(projectDirB, { recursive: true });
fs.mkdirSync(markDir, { recursive: true });

function makeStub(name, body) {
  fs.writeFileSync(path.join(binDir, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
}

// One line, then nothing: the shape of a harness waiting for an approval click.
makeStub('stub-hang', 'echo "hange jetzt"; exec sleep 120');
makeStub('stub-run', 'echo "aufgabe erledigt"');
makeStub('stub-login', 'echo "angemeldet"');
// Der echte Fall: opencode lehnt seine Konfiguration ab und endet mit Code 0.
makeStub('stub-configfehler', 'echo "Configuration is invalid at /Users/family/.config/opencode/opencode.jsonc"');
// Der echte Fall: qodercli bricht mit sdk_invalid_args ab, wenn der Host-Marker im Kind steht.
makeStub('stub-env', 'echo "ENTRYPOINT=[${QODER_AGENT_SDK_ENTRYPOINT:-keiner}]"');
// Cursor lehnt ein untrusted Verzeichnis still ab (Exit 0) — die Flags sind der Auftrag.
makeStub('agent', 'echo "ARGS=$*"; echo "ENTRYPOINT=[${QODER_AGENT_SDK_ENTRYPOINT:-keiner}]"');
// Taktende Laeufe: bleiben unter der Idle-Frist und liefern ein Zeitfenster zum Eingreifen.
const tickStub = (name) => makeStub(name,
  'echo "START"; i=0; while [ $i -lt 50 ]; do echo "t$i"; i=$((i+1)); sleep 0.1; done; echo "FERTIG"');
tickStub('stub-tick-a');
tickStub('stub-tick-b');
// Barriere: jeder Lauf wartet die Marke des anderen ab. Serielle Ausfuehrung kann
// das nie aufloesen, ein tickender Lauf umgeht den Idle-Watchdog.
const barrierStub = (self, other) => makeStub(self,
  `touch "$HARNESS_MARK_DIR/${self}"; i=0; ` +
  `while [ ! -f "$HARNESS_MARK_DIR/${other}" ] && [ $i -lt 60 ]; do echo "w$i"; i=$((i+1)); sleep 0.1; done; ` +
  `if [ -f "$HARNESS_MARK_DIR/${other}" ]; then echo "UEBERLAPPUNG"; else echo "SERIELL"; fi`);
barrierStub('stub-bar-a', 'stub-bar-b');
barrierStub('stub-bar-b', 'stub-bar-a');

function writeConfig(clis, extra = {}) {
  // JSON is valid YAML, so the stub config needs no formatter.
  fs.writeFileSync(path.join(stateDir, 'config.yaml'), JSON.stringify({
    clis,
    remote: { telegram: { enabled: false } },
    ...extra
  }));
}

const server = spawn(process.execPath, ['server.js'], {
  cwd: REPO,
  env: {
    HOME: sandbox,
    PATH: `${binDir}:/usr/bin:/bin`,
    PORT: String(PORT),
    HARNESS_IDLE_TIMEOUT_MS: String(IDLE_MS),
    QODER_AGENT_SDK_ENTRYPOINT: 'sdk-node'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
const serverLog = [];
server.stdout.on('data', (d) => serverLog.push(d.toString()));
server.stderr.on('data', (d) => serverLog.push(d.toString()));

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    const ok = await new Promise((resolve) => {
      const req = require('node:http').get({ port: PORT, host: '127.0.0.1', path: '/api/config' }, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Server nicht hochgekommen:\n' + serverLog.join(''));
}

// Collect every message of one dispatch, so a test can assert on the whole trail.
function runDispatch(payload, onMessage) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    const messages = [];
    const finish = () => { try { ws.close(); } catch {} resolve(messages); };

    const guard = setTimeout(() => reject(new Error(`Kein Abschluss:\n${describe(messages)}\nserver:\n${serverLog.join('')}`)), 30000);
    const clear = () => clearTimeout(guard);

    ws.on('error', (err) => { clear(); reject(err); });
    ws.on('open', () => ws.send(JSON.stringify({ type: 'dispatch', projectPath: projectDir, ...payload })));
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      messages.push(msg);
      if (onMessage) onMessage(msg, ws);
      if (msg.type === 'done') { clear(); finish(); }
      if (msg.type === 'error') { clear(); reject(new Error(msg.message + '\n' + describe(messages))); }
    });
  });
}

function describe(messages) {
  return messages
    .map((m) => {
      if (m.type === 'output') return (m.html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return JSON.stringify(m);
    })
    .join('\n');
}

function routes(messages) {
  return messages.filter((m) => m.type === 'route_selected').map((m) => m.harness);
}

function httpJson(pfad) {
  return new Promise((resolve, reject) => {
    require('node:http').get({ port: PAR_PORT, host: '127.0.0.1', path: pfad }, (res) => {
      let body = '';
      res.on('data', (d) => { body += d; });
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`${pfad} -> ${res.statusCode}: ${body}`));
        try { resolve(JSON.parse(body)); } catch (err) { reject(err); }
      });
    }).on('error', reject);
  });
}

function httpPost(pfad, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = require('node:http').request(
      { port: PAR_PORT, host: '127.0.0.1', path: pfad, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let out = '';
        res.on('data', (d) => { out += d; });
        res.on('end', () => {
          if (res.statusCode !== 200) return reject(new Error(`${pfad} -> ${res.statusCode}: ${out}`));
          try { resolve(JSON.parse(out)); } catch (err) { reject(err); }
        });
      }
    );
    req.on('error', reject);
    req.end(body);
  });
}

// Parallel dispatch needs its own instance and its own state directory: the chain
// tests above share studio-tasks.json, and two concurrent runs there could not be
// told apart. Same stubs, throwaway HOME, own port.
const PAR_PORT = 3912;
const parDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-par-'));
const parState = path.join(parDir, '.harness-dispatch');
const parBin = path.join(parDir, 'bin');
const parMarks = path.join(parDir, 'marks');
const parProjectA = path.join(parDir, 'proj-a');
const parProjectB = path.join(parDir, 'proj-b');
[parState, parBin, parMarks, parProjectA, parProjectB].forEach((d) => fs.mkdirSync(d, { recursive: true }));
for (const name of fs.readdirSync(binDir)) {
  fs.copyFileSync(path.join(binDir, name), path.join(parBin, name));
}

const parServer = spawn(process.execPath, ['server.js'], {
  cwd: REPO,
  env: {
    HOME: parDir,
    PATH: `${parBin}:/usr/bin:/bin`,
    PORT: String(PAR_PORT),
    HARNESS_IDLE_TIMEOUT_MS: String(IDLE_MS),
    HARNESS_MARK_DIR: parMarks
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
const parLog = [];
parServer.stdout.on('data', (d) => parLog.push(d.toString()));
parServer.stderr.on('data', (d) => parLog.push(d.toString()));

function parConfig(clis, extra = {}) {
  fs.writeFileSync(path.join(parState, 'config.yaml'), JSON.stringify({
    clis,
    remote: { telegram: { enabled: false } },
    ...extra
  }));
}

async function waitForParServer() {
  for (let i = 0; i < 60; i++) {
    const ok = await new Promise((resolve) => {
      const req = require('node:http').get({ port: PAR_PORT, host: '127.0.0.1', path: '/api/config' }, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
    });
    if (ok) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Parallel-Server nicht hochgekommen:\n' + parLog.join(''));
}

// One socket, several prompts sent back to back — the shape the composer delivers.
// Resolves once every run reports done.
function runMany(payloads, onMessage) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PAR_PORT}`);
    const messages = [];
    let finished = 0;

    const stop = () => { clearTimeout(guard); try { ws.close(); } catch {} };
    const guard = setTimeout(() => reject(new Error(`Kein Abschluss:\n${describe(messages)}\nserver:\n${parLog.join('')}`)), 45000);

    ws.on('error', (err) => { stop(); reject(err); });
    ws.on('open', () => {
      for (const p of payloads) ws.send(JSON.stringify({ type: 'dispatch', ...p }));
    });
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      messages.push(msg);
      if (onMessage) onMessage(msg, ws);
      if (msg.type === 'done') {
        finished += 1;
        if (finished >= payloads.length) { stop(); resolve(messages); }
      }
      if (msg.type === 'error') { stop(); reject(new Error(msg.message + '\n' + describe(messages))); }
    });
  });
}

const createdIds = (messages) => messages.filter((m) => m.type === 'task_created').map((m) => m.task.id);
const startStopSeq = (messages) => messages
  .filter((m) => m.type === 'route_selected' || m.type === 'done')
  .map((m) => `${m.type}:${m.taskId}`);

test('parallel: zwei Projekte ueberlappen, statt aufeinander zu warten', async () => {
  await waitForParServer();
  parConfig([
    { name: 'Bar A', command: 'stub-bar-a', enabled: true, model: 'plan-free' },
    { name: 'Bar B', command: 'stub-bar-b', enabled: true, model: 'plan-free' }
  ]);

  const messages = await runMany([
    { prompt: 'erster Auftrag', projectPath: parProjectA, harnessOverride: 'Bar A' },
    { prompt: 'zweiter Auftrag', projectPath: parProjectB, harnessOverride: 'Bar B' }
  ]);
  const trail = describe(messages);

  assert.doesNotMatch(trail, /SERIELL/, 'keiner darf die Barriere des anderen abwarten muessen:\n' + trail);
  assert.match(trail, /UEBERLAPPUNG/, 'beide Laeufe muessen sich gegenseitig sehen:\n' + trail);
  assert.strictEqual(new Set(createdIds(messages)).size, 2, 'pro Auftrag eine eigene Task-ID:\n' + trail);

  const stamped = messages.filter((m) => ['output', 'route_selected', 'done'].includes(m.type));
  const missing = stamped.filter((m) => !m.taskId);
  assert.strictEqual(missing.length, 0, `jede Meldung muss zuordenbar sein, ${missing.length} fehlen:\n` + trail);
});

test('parallel: derselbe Ordner laeuft nie doppelt', async () => {
  parConfig([
    { name: 'Takt A', command: 'stub-tick-a', enabled: true, model: 'plan-free' },
    { name: 'Takt B', command: 'stub-tick-b', enabled: true, model: 'plan-free' }
  ]);

  let poolWhileQueued = null;
  const messages = await runMany([
    { prompt: 'erster Auftrag', projectPath: parProjectA, harnessOverride: 'Takt A' },
    { prompt: 'zweiter Auftrag', projectPath: parProjectA, harnessOverride: 'Takt B' }
  ], (msg) => {
    // Der Blick in den Pool muss während des Wartens passieren, sonst ist die
    // Schlange längst abgearbeitet.
    if (msg.type === 'queued' && !poolWhileQueued) poolWhileQueued = httpJson('/api/runs');
  });
  const [first, second] = createdIds(messages);
  const seq = startStopSeq(messages);

  const queued = messages.find((m) => m.type === 'queued');
  assert.ok(queued, 'der zweite Auftrag muss als Warteschlange gemeldet werden:\n' + describe(messages));
  assert.strictEqual(queued.taskId, second);
  assert.strictEqual(queued.reason, 'project');
  assert.ok(seq.indexOf(`route_selected:${second}`) > seq.indexOf(`done:${first}`),
    `im selben Ordner darf erst nach dem Abschluss gestartet werden:\n${seq.join(' ')}`);

  // Die Oberfläche braucht den Pool-Zustand zum Neuladen und für den Zähler.
  const pool = await poolWhileQueued;
  assert.ok(pool.running.some((r) => r.taskId === first), 'der laufende Auftrag muss im Pool stehen:\n' + JSON.stringify(pool));
  assert.ok(pool.queued.some((r) => r.taskId === second), 'der wartende Auftrag muss im Pool stehen:\n' + JSON.stringify(pool));
  assert.strictEqual(typeof pool.maxConcurrent, 'number');
});

test('parallel: derselbe Harness arbeitet nie in zwei Ordnern', async () => {
  await waitForParServer();
  parConfig([
    { name: 'Takt A', command: 'stub-tick-a', enabled: true, model: 'plan-free' },
    { name: 'Takt B', command: 'stub-tick-b', enabled: true, model: 'plan-free' }
  ]);

  const messages = await runMany([
    { prompt: 'erster Auftrag', projectPath: parProjectA, harnessOverride: 'Takt A' },
    { prompt: 'zweiter Auftrag', projectPath: parProjectB, harnessOverride: 'Takt A' }
  ]);
  const [first, second] = createdIds(messages);
  const seq = startStopSeq(messages);

  const queued = messages.find((m) => m.type === 'queued');
  assert.ok(queued, 'zwei Aufträge auf ein Konto dürfen nicht gleichzeitig laufen:\n' + describe(messages));
  assert.strictEqual(queued.reason, 'harness');
  assert.match(queued.message, /stub-tick-a/, 'die Meldung muss nennen, welcher Harness belegt ist:\n' + describe(messages));
  assert.match(queued.message, /proj-a/, 'und in welchem Ordner er arbeitet:\n' + describe(messages));
  assert.ok(seq.indexOf(`route_selected:${second}`) > seq.indexOf(`done:${first}`),
    `der zweite Lauf darf erst nach dem Abschluss starten:\n${seq.join(' ')}`);
});

test('parallel: die Kappe haelt weitere Laeufe zurueck', async () => {
  parConfig([
    { name: 'Takt A', command: 'stub-tick-a', enabled: true, model: 'plan-free' },
    { name: 'Takt B', command: 'stub-tick-b', enabled: true, model: 'plan-free' }
  ], { dispatch: { max_concurrent: 1 } });

  const messages = await runMany([
    { prompt: 'erster Auftrag', projectPath: parProjectA, harnessOverride: 'Takt A' },
    { prompt: 'zweiter Auftrag', projectPath: parProjectB, harnessOverride: 'Takt B' }
  ]);
  const [first, second] = createdIds(messages);
  const seq = startStopSeq(messages);

  const queued = messages.find((m) => m.type === 'queued');
  assert.ok(queued, 'bei voller Kappe muss der zweite Auftrag warten:\n' + describe(messages));
  assert.strictEqual(queued.reason, 'capacity');
  assert.ok(seq.indexOf(`route_selected:${second}`) > seq.indexOf(`done:${first}`),
    `die Kappe darf nicht uebergangen werden:\n${seq.join(' ')}`);
});

test('parallel: die Kappe ist ein Schalter in den Einstellungen', async () => {
  const clis = [
    { name: 'Takt A', command: 'stub-tick-a', enabled: true, model: 'plan-free' },
    { name: 'Takt B', command: 'stub-tick-b', enabled: true, model: 'plan-free' }
  ];
  parConfig(clis, { dispatch: { max_concurrent: 2 } });
  assert.strictEqual((await httpJson('/api/runs')).maxConcurrent, 2, 'die Datei ist die Voraussetzung');

  await httpPost('/api/config', { clis, dispatch: { max_concurrent: 4 } });
  assert.strictEqual((await httpJson('/api/runs')).maxConcurrent, 4, 'der Speichern-Knopf muss die Kappe übernehmen');

  await httpPost('/api/config', { clis, dispatch: { max_concurrent: 0 } });
  assert.strictEqual((await httpJson('/api/runs')).maxConcurrent, 1, 'null würde jeden Auftrag festsetzen');

  await httpPost('/api/config', { clis, dispatch: { max_concurrent: 3 } });
});

test('parallel: Abbrechen trifft nur den eigenen Task', async () => {
  parConfig([
    { name: 'Takt A', command: 'stub-tick-a', enabled: true, model: 'plan-free' },
    { name: 'Takt B', command: 'stub-tick-b', enabled: true, model: 'plan-free' }
  ]);

  let sent = false;
  const messages = await runMany([
    { prompt: 'erster Auftrag', projectPath: parProjectA, harnessOverride: 'Takt A' },
    { prompt: 'zweiter Auftrag', projectPath: parProjectB, harnessOverride: 'Takt B' }
  ], (msg, ws) => {
    if (sent || msg.type !== 'route_selected' || msg.command !== 'stub-tick-b') return;
    sent = true;
    ws.send(JSON.stringify({ type: 'cancel', taskId: msg.taskId }));
  });

  const dones = messages.filter((m) => m.type === 'done');
  const cancelled = dones.find((d) => /Abgebrochen/.test(d.message || ''));
  const other = dones.find((d) => d.taskId !== (cancelled && cancelled.taskId));
  const trail = describe(messages);

  assert.ok(cancelled, 'der Abbruch muss als Abbruch enden:\n' + trail);
  assert.ok(other, 'der andere Lauf muss zu Ende laufen:\n' + trail);
  assert.strictEqual(other.exitCode, 0, 'der andere Lauf darf der Abbruch nicht etwas angehen:\n' + trail);
  assert.ok(messages.some((m) => m.type === 'output' && m.taskId === other.taskId && /FERTIG/.test(m.html || '')),
    'die Ausgabe des anderen Laufs muss bei seinem Task landen:\n' + trail);
});

test('chain: eine Route die nichts mehr schreibt, wird getoetet und die Kette laeuft weiter', async () => {
  await waitForServer();
  writeConfig([
    { name: 'Haenger', command: 'stub-hang', enabled: true, model: 'langsam-free' },
    { name: 'Uebernehmer', command: 'stub-run', enabled: true, model: 'schnell-free' }
  ]);

  const messages = await runDispatch({ prompt: 'mach was' });
  const trail = describe(messages);

  assert.deepStrictEqual(routes(messages), ['Haenger', 'Uebernehmer'], 'nach dem Abbruch muss die naechste Route dran sein:\n' + trail);
  assert.match(trail, /seit 1 s/, 'der Abbruch muss als Stille gemeldet werden:\n' + trail);
  assert.match(trail, /Kontext-Relay/, 'der Uebergabe-Kontext muss die Route treffen:\n' + trail);
  assert.strictEqual(messages.at(-1).exitCode, 0, 'die Kette gilt als erfolgreich, wenn der Uebernehmer durchlaeuft:\n' + trail);
});

test('chain: eine Route mit Bezahl-Sperre wird vor dem Start uebersprungen', async () => {
  writeConfig([
    { name: 'Teuer', command: 'stub-run', enabled: true, model: 'anthropic/claude-sonnet-5-5', allow_paid_usage: false },
    { name: 'Gratis', command: 'stub-login', enabled: true, model: 'stealth/space-bunny-alpha' }
  ]);

  const messages = await runDispatch({ prompt: 'mach was' });
  const trail = describe(messages);

  assert.deepStrictEqual(routes(messages), ['Gratis'], 'die teure Route darf nie gewaehlt werden:\n' + trail);
  assert.match(trail, /Kostenrichtlinie/);
  assert.match(trail, /claude-sonnet-5-5/, 'der Banner muss nennen, welches Modell kostet:\n' + trail);
});

test('chain: ein gemessener Login-Fehler ueberspringt die Route, die explizite Wahl nicht', async () => {
  fs.writeFileSync(path.join(stateDir, 'harness-health.json'), JSON.stringify({
    'stub-login': { errorKind: 'auth', at: Date.now() - 60 * 60 * 1000 }
  }));
  writeConfig([
    { name: 'Kaputter Login', command: 'stub-login', enabled: true, model: 'plan-free' },
    { name: 'Gesund', command: 'stub-run', enabled: true, model: 'plan-free' }
  ]);

  const automatic = await runDispatch({ prompt: 'mach was' });
  const autoTrail = describe(automatic);
  assert.deepStrictEqual(routes(automatic), ['Gesund'], 'der bekannte Login-Fehler muss vorab übersprungen werden:\n' + autoTrail);
  assert.match(autoTrail, /Login fehlgeschlagen/);
  assert.match(autoTrail, /vor 1 h/);

  const chosen = await runDispatch({ prompt: 'mach was', harnessOverride: 'Kaputter Login' });
  assert.deepStrictEqual(routes(chosen), ['Kaputter Login'], 'eine explizite Wahl darf nie still uebersprungen werden:\n' + describe(chosen));

  fs.rmSync(path.join(stateDir, 'harness-health.json'));
});

test('chain: ein Nutzerabbruch beendet die Kette, statt an die naechste Route weiterzureichen', async () => {
  writeConfig([
    { name: 'Haenger', command: 'stub-hang', enabled: true, model: 'plan-free' },
    { name: 'Uebernehmer', command: 'stub-run', enabled: true, model: 'plan-free' }
  ]);

  let cancelled = false;
  const messages = await runDispatch({ prompt: 'mach was' }, (msg, ws) => {
    if (!cancelled && msg.type === 'route_selected') {
      cancelled = true;
      ws.send(JSON.stringify({ type: 'cancel', taskId: msg.taskId }));
    }
  });
  const trail = describe(messages);

  assert.deepStrictEqual(routes(messages), ['Haenger'], 'ein Abbruch gilt als Wunsch des Nutzers, nicht als Routen-Ausfall:\n' + trail);
  assert.match(trail, /Abgebrochen durch Benutzer/);
});

test('chain: eine Route, die mit 0 ihre Konfiguration ablehnt, gilt nicht als Erfolg', async () => {
  writeConfig([
    { name: 'Kaputte Konfig', command: 'stub-configfehler', enabled: true, model: 'plan-free' },
    { name: 'Uebernehmer', command: 'stub-run', enabled: true, model: 'plan-free' }
  ]);

  const messages = await runDispatch({ prompt: 'mach was' });
  const trail = describe(messages);

  assert.deepStrictEqual(routes(messages), ['Kaputte Konfig', 'Uebernehmer'], 'Exit 0 mit Ablehnung muss die Kette weiterreichen:\n' + trail);
  assert.match(trail, /Start verweigert/);
  assert.match(trail, /Configuration is invalid/);
  assert.strictEqual(messages.at(-1).exitCode, 0, 'der Uebernehmer schliesst die Kette ab:\n' + trail);
});

test('chain: die letzte Route darf eine Start-Ablehnung nicht als Erfolg melden', async () => {
  writeConfig([
    { name: 'Kaputte Konfig', command: 'stub-configfehler', enabled: true, model: 'plan-free' }
  ]);

  const messages = await runDispatch({ prompt: 'mach was' });
  const done = messages.at(-1);

  assert.match(done.message, /Start verweigert/, 'ohne naechste Route muss der Fehler sichtbar bleiben:\n' + describe(messages));
  assert.ok(!/Erfolgreich abgeschlossen/.test(describe(messages)), 'kein Erfolgsbanner bei verweigerter Start:\n' + describe(messages));
});

test('chain: der SDK-Entrypoint-Marker des Hosts darf nicht im Agent-CLI landen', async () => {
  writeConfig([
    { name: 'Umgebung', command: 'stub-env', enabled: true, model: 'plan-free' }
  ]);

  const messages = await runDispatch({ prompt: 'mach was' });
  const trail = describe(messages);

  assert.match(trail, /ENTRYPOINT=\[keiner\]/, 'der Server laeuft oft aus einer Agent-Sitzung; das Kind darf den Marker nicht erben:\n' + trail);
  assert.strictEqual(messages.at(-1).exitCode, 0, 'die Route muss durchlaufen:\n' + trail);
});

test('chain: cursor startet mit Verzeichnis-Freigabe und Modell-Schalter', async () => {
  writeConfig([
    { name: 'Cursor', harness: 'cursor', command: 'agent', model: 'auto', enabled: true }
  ]);

  const messages = await runDispatch({ prompt: 'mach was' });
  const trail = describe(messages);

  assert.match(trail, /ARGS=-p --force --trust --model auto/, 'ohne --force/--trust bricht Cursor die Arbeit mit Exit 0 ab:\n' + trail);
  assert.match(trail, /ENTRYPOINT=\[keiner\]/, 'auch hier darf der SDK-Marker nicht weitergegeben werden:\n' + trail);
  assert.strictEqual(messages.at(-1).exitCode, 0, 'der Lauf muss durchlaufen:\n' + trail);
});

test.after(async () => {
  server.kill('SIGTERM');
  parServer.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 200));
  server.kill('SIGKILL');
  parServer.kill('SIGKILL');
  fs.rmSync(sandbox, { recursive: true, force: true });
  fs.rmSync(parDir, { recursive: true, force: true });
});
