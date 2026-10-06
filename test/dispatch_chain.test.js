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
fs.mkdirSync(binDir, { recursive: true });
fs.mkdirSync(stateDir, { recursive: true });
fs.mkdirSync(projectDir, { recursive: true });

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

function writeConfig(clis) {
  // JSON is valid YAML, so the stub config needs no formatter.
  fs.writeFileSync(path.join(stateDir, 'config.yaml'), JSON.stringify({
    clis,
    remote: { telegram: { enabled: false } }
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
      ws.send(JSON.stringify({ type: 'cancel' }));
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

test.after(async () => {
  server.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 200));
  server.kill('SIGKILL');
  fs.rmSync(sandbox, { recursive: true, force: true });
});
