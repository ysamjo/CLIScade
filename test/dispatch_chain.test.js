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
makeStub('stub-codex-auth', 'echo \'{"type":"error","message":"Authentication failed"}\'; exit 1');
makeStub('stub-codex-rate', 'echo \'{"type":"error","message":"429 Too Many Requests"}\'; exit 1');
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
// So biegt das Terminal claude auf den eigenen Gateway: Exporte der Login-Shell. Der
// Server-Prozess sieht sie nie — er soll sie sich aber bei der Shell holen koennen.
makeStub('stub-shell', 'echo "ANTHROPIC_BASE_URL=http://gateway.stub/v1"; echo "TERM_PROGRAM=iTerm.app"');
makeStub('claude', 'echo "BASE=[${ANTHROPIC_BASE_URL:-keiner}]"');
makeStub('freebuff', 'echo DARF_NICHT_LAUFEN');

// Die Konfiguration darf nur feste Harness-IDs enthalten. Jeder Test tauscht
// deshalb die Implementierung bekannter Executables im Wegwerf-PATH aus.
const stubHarnesses = {
  'stub-bar-a': ['qoder', 'qodercli'], 'stub-bar-b': ['codebuddy', 'codebuddy'],
  'stub-tick-a': ['qoder', 'qodercli'], 'stub-tick-b': ['codebuddy', 'codebuddy'],
  'stub-hang': ['qoder', 'qodercli'], 'stub-run': ['codebuddy', 'codebuddy'],
  'stub-login': ['qoder', 'qodercli'], 'stub-configfehler': ['qoder', 'qodercli'],
  'stub-env': ['qoder', 'qodercli'], claude: ['claude', 'claude'], agent: ['cursor', 'agent'],
  'stub-codex-auth': ['codex', 'codex'], 'stub-codex-rate': ['codex', 'codex'],
  freebuff: ['freebuff', 'freebuff']
};

function knownRoutes(routes, targetBin) {
  return routes.map((route) => {
    const mapping = stubHarnesses[route.command];
    assert.ok(mapping, `Test-Harness nicht zugeordnet: ${route.command}`);
    fs.copyFileSync(path.join(binDir, route.command), path.join(targetBin, mapping[1]));
    fs.chmodSync(path.join(targetBin, mapping[1]), 0o755);
    const { command, harness, ...rest } = route;
    return { ...rest, harnessId: mapping[0] };
  });
}

function writeConfig(clis, extra = {}) {
  // JSON is valid YAML, so the stub config needs no formatter.
  fs.writeFileSync(path.join(stateDir, 'config.yaml'), JSON.stringify({
    clis: knownRoutes(clis, binDir),
    remote: { telegram: { enabled: false } },
    ...extra
  }));
}

const server = spawn(process.execPath, ['server.js'], {
  cwd: REPO,
  env: {
    HOME: sandbox,
    PATH: `${binDir}:/usr/bin:/bin`,
    SHELL: path.join(binDir, 'stub-shell'),
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
    if (pfad === '/api/config') data = { ...data, clis: knownRoutes(data.clis, parBin) };
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
    clis: knownRoutes(clis, parBin),
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
  await waitForParServer();
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

test('parallel: derselbe Harness läuft in zwei Ordnern gleichzeitig', async () => {
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
  assert.strictEqual(queued, undefined, 'zwei gewöhnliche Harnesses in zwei Ordnern dürfen parallel laufen:\n' + describe(messages));
  assert.ok(seq.indexOf(`route_selected:${second}`) < seq.indexOf(`done:${first}`),
    `der zweite Lauf muss starten, bevor der erste endet:\n${seq.join(' ')}`);
});

test('parallel: die Kappe haelt weitere Laeufe zurueck', async () => {
  await waitForParServer();
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
  await waitForParServer();
  const clis = [
    { name: 'Takt A', command: 'stub-tick-a', enabled: true, model: 'plan-free' },
    { name: 'Takt B', command: 'stub-tick-b', enabled: true, model: 'plan-free' }
  ];
  parConfig(clis, { dispatch: { max_concurrent: 2 } });
  assert.strictEqual((await httpJson('/api/runs')).maxConcurrent, 2, 'die Datei ist die Voraussetzung');

  await httpPost('/api/config', { clis, dispatch: { max_concurrent: 4 } });
  assert.strictEqual((await httpJson('/api/runs')).maxConcurrent, 4, 'der Speichern-Knopf muss die Kappe übernehmen');
  assert.strictEqual((await httpJson('/api/status')).dispatch.max_concurrent, 4,
    'die Einstellungen lesen die Kappe aus dem Status — sonst zeigt das Feld beim nächsten Öffnen einen alten Wert');

  await httpPost('/api/config', { clis, dispatch: { max_concurrent: 0 } });
  assert.strictEqual((await httpJson('/api/runs')).maxConcurrent, 0, 'null heisst ab jetzt: keine Kappe');

  await httpPost('/api/config', { clis, dispatch: { max_concurrent: 3 } });
});

test('parallel: Abbrechen trifft nur den eigenen Task', async () => {
  await waitForParServer();
  parConfig([
    { name: 'Takt A', command: 'stub-tick-a', enabled: true, model: 'plan-free' },
    { name: 'Takt B', command: 'stub-tick-b', enabled: true, model: 'plan-free' }
  ]);

  let sent = false;
  const messages = await runMany([
    { prompt: 'erster Auftrag', projectPath: parProjectA, harnessOverride: 'Takt A' },
    { prompt: 'zweiter Auftrag', projectPath: parProjectB, harnessOverride: 'Takt B' }
  ], (msg, ws) => {
    if (sent || msg.type !== 'route_selected' || msg.command !== 'codebuddy') return;
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

test('Wartenden Auftrag abbrechen speichert den Abbruch-Code', async () => {
  await waitForParServer();
  parConfig([{ name: 'Takt', command: 'stub-tick-a', enabled: true }]);
  let cancelledId;
  const messages = await runMany([
    { prompt: 'laufend', projectPath: parProjectA },
    { prompt: 'wartend', projectPath: parProjectA }
  ], (message, ws) => {
    if (message.type === 'queued' && !cancelledId) {
      cancelledId = message.taskId;
      ws.send(JSON.stringify({ type: 'cancel', taskId: cancelledId }));
    }
  });
  assert.ok(cancelledId);
  const saved = (await httpJson('/api/tasks')).tasks.find((task) => task.id === cancelledId);
  assert.equal(saved.status, 'cancelled');
  assert.equal(saved.exitCode, 130);
  assert.equal(messages.filter((message) => message.type === 'done').length, 2);
});

test('parallel: die Ausgabe eines tickenden Laufs bleibt Zeile fuer Zeile', async () => {
  await waitForParServer();
  parConfig([
    { name: 'Takt A', command: 'stub-tick-a', enabled: true, model: 'plan-free' },
    { name: 'Takt B', command: 'stub-tick-b', enabled: true, model: 'plan-free' }
  ]);

  const messages = await runMany([
    { prompt: 'erster Auftrag', projectPath: parProjectA, harnessOverride: 'Takt A' }
  ]);

  // ansi-to-html 0.7.2 haelt in stream:true den Zeilenzaehler: der dritte Umbruch bringt
  // drei <br/>-Marken. Ein tickender Lauf fuellt die Konsole mit Leerraum.
  const frames = messages.filter((m) => m.type === 'output' && (m.raw || '').length);
  const roh = frames.map((f) => f.raw).join('');
  const html = frames.map((f) => f.html).join('');
  const zeilen = (roh.match(/\n/g) || []).length;
  const umbrueche = (html.match(/<br\s*\/?>/g) || []).length;

  assert.ok(zeilen > 20, 'der Takt muss genug Zeilen liefern:\n' + roh.slice(0, 200));
  assert.strictEqual(umbrueche, zeilen,
    `jede Zeile bekommt genau einen Umbruch: ${umbrueche} <br/> fuer ${zeilen} Zeilenvorschuebe`);
  assert.doesNotMatch(html, /(<br\s*\/?>\s*){3,}/, 'die Zeilen stapeln nicht zu Leerraum:\n' + html.slice(0, 400));
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

test('chain: ein gemessener Login-Fehler ueberspringt die Route, die explizite Wahl nicht', async () => {
  fs.writeFileSync(path.join(stateDir, 'harness-health.json'), JSON.stringify({
    qodercli: { errorKind: 'auth', at: Date.now() - 60 * 60 * 1000 }
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

test('chain: strukturierter Auth- und Rate-Limit-Fehler reichen an die nächste Route weiter', async () => {
  await waitForServer();
  for (const [stub, expected] of [['stub-codex-auth', 'Authentication failed'], ['stub-codex-rate', '429 Too Many Requests']]) {
    writeConfig([
      { name: 'Codex kaputt', command: stub, enabled: true },
      { name: 'Übernehmer', command: 'stub-run', enabled: true }
    ]);
    const messages = await runDispatch({ prompt: 'Aufgabe' });
    assert.deepEqual(routes(messages), ['Codex kaputt', 'Übernehmer']);
    assert.match(describe(messages), new RegExp(expected));
    assert.equal(messages.at(-1).exitCode, 0);
  }
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

test('chain: claude läuft über denselben Gateway wie im Terminal', async () => {
  await waitForServer();
  writeConfig([
    { name: 'Claude Code', harness: 'claude_code', command: 'claude', model: 'Standard', enabled: true }
  ]);

  const messages = await runDispatch({ prompt: 'mach was' });
  const trail = describe(messages);

  // Ohne den Export aus der Login-Shell redet claude mit dem Hersteller und nicht mit OmniRoute.
  assert.match(trail, /BASE=\[http:\/\/gateway\.stub\/v1\]/,
    'die Gateway-Adresse der Shell muss im Lauf stehen:\n' + trail);
  assert.strictEqual(messages.at(-1).exitCode, 0, 'der Lauf muss durchlaufen:\n' + trail);
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

// Wie httpPost, aber ohne Wurf bei Fehlerstatus: das Archiv lehnt ab, und die
// Ablehnung ist der Fall, den der Test sehen will.
function httpPostStatus(pfad, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const req = require('node:http').request(
      { port: PAR_PORT, host: '127.0.0.1', path: pfad, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => {
        let out = '';
        res.on('data', (d) => { out += d; });
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(out); } catch {}
          resolve({ status: res.statusCode, json, text: out });
        });
      }
    );
    req.on('error', reject);
    req.end(body);
  });
}

test('Skill-Installation führt Repository-URLs nicht als Shell-Befehl aus', async () => {
  await waitForParServer();
  const marker = path.join(sandbox, 'skill-injection-marker');
  const payload = `ungueltig\"; touch ${marker}; #`;
  await httpPostStatus('/api/skills/install', { mode: 'git', name: 'injection-test', repoUrl: payload });
  assert.equal(fs.existsSync(marker), false);
});

function legeTasks(taskList) {
  fs.writeFileSync(path.join(parState, 'studio-tasks.json'), JSON.stringify({
    rootDirectory: parDir,
    activeProject: parProjectA,
    tasks: taskList
  }));
}

const fertig = (id) => ({
  id, projectPath: parProjectA, projectName: 'proj-a', prompt: 'erledigt',
  status: 'completed', timestamp: new Date().toISOString()
});

test('archiv: ein beendeter Auftrag verlässt die Liste und kommt zurück', async () => {
  await waitForParServer();
  legeTasks([fertig('task_alt')]);

  const ein = await httpPostStatus('/api/tasks/archive', { taskId: 'task_alt', archived: true });
  assert.strictEqual(ein.status, 200, `einpacken muss gelingen: ${ein.text}`);
  assert.strictEqual(ein.json.task.archived, true, 'die Antwort muss den neuen Zustand nennen');

  const store = await httpJson('/api/tasks');
  assert.strictEqual(store.tasks.find((t) => t.id === 'task_alt').archived, true,
    'der Archiv-Flag muss im Store stehen, nicht nur in der Antwort');

  const raus = await httpPostStatus('/api/tasks/archive', { taskId: 'task_alt', archived: false });
  assert.strictEqual(raus.json.task.archived, false, 'zurückholen muss den Flag wieder nehmen');
});

test('archiv: ein unbekannter Auftrag wird nicht erfunden', async () => {
  const blind = await httpPostStatus('/api/tasks/archive', { taskId: 'task_geist', archived: true });
  assert.strictEqual(blind.status, 404, `fehlende Task muss abgewiesen werden: ${blind.text}`);
  assert.match(blind.text, /task_geist/, 'die Antwort muss sagen, welche Aufgabe fehlt');
});

test('archiv: ein laufender Auftrag bleibt ungepackt', async () => {
  await waitForParServer();
  parConfig([{ name: 'Ticker', command: 'stub-tick-a', enabled: true, model: 'plan-free' }]);

  let versucht = null;
  const messages = await runMany(
    [{ prompt: 'lauf', projectPath: parProjectA }],
    async (msg) => {
      if (msg.type !== 'task_created' || versucht) return;
      await new Promise((r) => setTimeout(r, 300));
      versucht = await httpPostStatus('/api/tasks/archive', { taskId: msg.task.id, archived: true });
    }
  );

  assert.strictEqual(versucht.status, 409,
    `ein Lauf im Pool darf nicht verschwinden: ${JSON.stringify(versucht)}`);
  const store = await httpJson('/api/tasks');
  const lauf = store.tasks.find((t) => t.id === createdIds(messages)[0]);
  assert.notStrictEqual(lauf?.archived, true, 'die abgelehnte Aufgabe darf nicht im Archiv liegen');
});

test('archiv: ein zweites Fenster erfährt das Einpacken', async () => {
  await waitForParServer();
  legeTasks([fertig('task_bei')]);

  const beobachter = new WebSocket(`ws://127.0.0.1:${PAR_PORT}`);
  const gemeldet = new Promise((resolve, reject) => {
    const guard = setTimeout(() => reject(new Error('keine task_archived-Meldung gekommen')), 5000);
    beobachter.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.type !== 'task_archived') return;
      clearTimeout(guard);
      resolve(m);
    });
    beobachter.on('error', (err) => { clearTimeout(guard); reject(err); });
  });
  await new Promise((resolve) => beobachter.on('open', resolve));

  const ein = await httpPostStatus('/api/tasks/archive', { taskId: 'task_bei', archived: true });
  assert.strictEqual(ein.status, 200, ein.text);
  const m = await gemeldet;
  assert.strictEqual(m.taskId, 'task_bei', 'die Meldung muss die Aufgabe nennen');
  assert.strictEqual(m.archived, true, 'die Meldung muss sagen, dass sie jetzt im Archiv liegt');
  beobachter.close();
});

test('Sicherheit: unbekannter Befehl kann nicht gespeichert oder gestartet werden', async () => {
  await waitForParServer();
  const response = await httpPostStatus('/api/config', { clis: [{ name: 'Fremd', command: 'evil; touch /tmp/harness-injection' }] });
  assert.equal(response.status, 400);
  assert.match(response.text, /Unbekanntes Harness/);
});

test('Sicherheit: Konfiguration enthält keine Executables und API keinen Bot-Token', async () => {
  parConfig([{ name: 'Takt A', command: 'stub-tick-a', enabled: true }], {
    remote: { telegram: { enabled: false, botToken: 'geheimer-test-token' } }
  });
  const config = await httpJson('/api/config');
  assert.equal(config.remote.telegram.hasToken, true);
  assert.doesNotMatch(JSON.stringify(config), /geheimer-test-token/);
  const stored = fs.readFileSync(path.join(parState, 'config.yaml'), 'utf8');
  assert.doesNotMatch(stored, /command:/);
  assert.match(stored, /harnessId/);
});

test('Sicherheit: ungültiger Projektpfad wird vor dem Dispatch abgelehnt', async () => {
  parConfig([{ name: 'Takt A', command: 'stub-tick-a', enabled: true }]);
  await assert.rejects(runMany([{ prompt: 'nicht starten', projectPath: path.join(parDir, 'fehlend') }]), /Projektpfad/);
});

test('Wiederholte Request-ID startet nur einen Auftrag', async () => {
  await waitForParServer();
  parConfig([{ name: 'Gesund', command: 'stub-run', enabled: true }]);
  const messages = await new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PAR_PORT}`);
    const received = [];
    const guard = setTimeout(() => { ws.close(); reject(new Error('Kein Abschluss')); }, 10000);
    ws.on('error', reject);
    ws.on('open', () => {
      const payload = JSON.stringify({ type: 'dispatch', requestId: 'request-duplicate-123', prompt: 'Aufgabe', projectPath: parProjectA });
      ws.send(payload);
      ws.send(payload);
    });
    ws.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      received.push(message);
      if (message.type === 'done') { clearTimeout(guard); ws.close(); resolve(received); }
    });
  });
  const ids = createdIds(messages);
  assert.equal(ids.length, 2);
  assert.equal(ids[0], ids[1]);
  assert.equal(messages.filter((message) => message.type === 'route_selected').length, 1);
});

test('Freebuff bleibt außerhalb von Auto-Route und Konsens', async () => {
  parConfig([
    { name: 'Freebuff', command: 'freebuff', enabled: true },
    { name: 'Gesund', command: 'stub-run', enabled: true }
  ]);
  const automatic = await runMany([{ prompt: 'Aufgabe', projectPath: parProjectA }]);
  assert.deepEqual(routes(automatic), ['Gesund']);
  const consensus = await runMany([{ prompt: 'Aufgabe', projectPath: parProjectA, harnessOverride: 'consensus' }]);
  assert.equal(consensus.at(-1).exitCode, 1);
  assert.doesNotMatch(describe(consensus), /DARF_NICHT_LAUFEN/);
});

test('Konsens speichert einen Phasenausfall als unvollständig', async () => {
  parConfig([
    { name: 'Kaputte Konfig', command: 'stub-configfehler', enabled: true },
    { name: 'Gesund', command: 'stub-run', enabled: true }
  ]);
  const messages = await runMany([{ prompt: 'Aufgabe', projectPath: parProjectA, harnessOverride: 'consensus' }]);
  const taskId = createdIds(messages)[0];
  const persisted = (await httpJson('/api/tasks')).tasks.find((task) => task.id === taskId);
  assert.equal(messages.at(-1).exitCode, 1);
  assert.equal(persisted.status, 'incomplete');
});

test('Konsens wählt zwei verschiedene Harnesses trotz doppelter Route', async () => {
  await waitForParServer();
  parConfig([
    { name: 'Erster', command: 'stub-login', enabled: true },
    { name: 'Zweiter', command: 'stub-login', enabled: true },
    { name: 'Dritter', command: 'stub-run', enabled: true }
  ]);
  const messages = await runMany([{ prompt: 'Aufgabe', projectPath: parProjectA, harnessOverride: 'consensus' }]);
  assert.match(messages.find((message) => message.type === 'route_selected').harness, /Erster ↔ Dritter/);
});

test('AGENTS-Editor schreibt nur in den gewählten Projektordner', async () => {
  const outside = path.join(parDir, 'nicht-beschreiben.md');
  fs.writeFileSync(outside, 'alt');
  const response = await httpPostStatus('/api/agents-md', {
    target: 'project', projectPath: parProjectA, customPath: outside, content: 'neuer Text'
  });
  assert.equal(response.status, 200, response.text);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'alt');
  assert.equal(fs.readFileSync(path.join(parProjectA, 'AGENTS.md'), 'utf8'), 'neuer Text');
});

test('Scheduler lehnt ungültige Pfade ab und beschriftet das effektive Intervall', async () => {
  const invalid = await httpPostStatus('/api/schedules', { projectPath: path.join(parDir, 'fehlend'), interval: 'daily_08_00' });
  assert.equal(invalid.status, 400);
  const valid = await httpPostStatus('/api/schedules', { projectPath: parProjectA, interval: 'weekly_monday', enabled: false });
  assert.equal(valid.status, 200, valid.text);
  const job = valid.json.schedules[0];
  assert.equal(job.intervalLabel, 'Wöchentlich (Montag 08:00)');
  assert.ok(job.createdAt);
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
