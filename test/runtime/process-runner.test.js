const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { runProcess } = require('../../runtime/process-runner');

test('Runner liefert Ausgabe und Exit-Code', async () => {
  const chunks = [];
  const result = await runProcess({ command: process.execPath, args: ['-e', 'console.log("hallo"); console.error("hinweis")'], onChunk: (chunk) => chunks.push(chunk) });
  assert.equal(result.exitCode, 0);
  assert.match(result.stdoutTail, /hallo/);
  assert.match(result.stderrTail, /hinweis/);
  assert.equal(chunks.length, 2);
});

test('Runner unterscheidet Abbruch und Zeitüberschreitung', async () => {
  const controller = new AbortController();
  const cancelled = runProcess({ command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'], signal: controller.signal });
  setTimeout(() => controller.abort(), 50);
  assert.equal((await cancelled).reason, 'cancelled');
  const timed = await runProcess({ command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'], timeoutMs: 50 });
  assert.equal(timed.reason, 'timeout');
});

test('Runner meldet Spawn-Fehler', async () => {
  const result = await runProcess({ command: 'fehlender-harness-befehl-123456', args: [] });
  assert.equal(result.reason, 'spawn_failure');
});

test('Headless-STDIN liefert EOF statt Auswahlantwort oder Terminal', async () => {
  const result = await runProcess({ command: process.execPath, args: ['-e',
    'console.log(JSON.stringify({ tty: Boolean(process.stdin.isTTY), input: require("node:fs").readFileSync(0, "utf8") }))'], timeoutMs: 2000 });
  assert.equal(result.reason, null);
  assert.deepEqual(JSON.parse(result.stdoutTail), { tty: false, input: '' });
});

test('Auch wiederholt ausgegebene Auswahlmenüs bleiben durch das Gesamtzeitlimit begrenzt', async () => {
  const result = await runProcess({ command: process.execPath, args: ['-e',
    'setInterval(() => console.log("Please select [1/2]"), 20)'], idleTimeoutMs: 500, timeoutMs: 1000 });
  assert.match(result.stdoutTail, /Please select/);
  assert.equal(result.reason, 'timeout');
});

test('Runner beendet stille Läufe und bereits abgebrochene Anfragen', async () => {
  const idle = await runProcess({ command: process.execPath, args: ['-e', 'setInterval(() => {}, 1000)'], idleTimeoutMs: 50 });
  assert.equal(idle.reason, 'idle_timeout');
  const controller = new AbortController();
  controller.abort();
  const cancelled = await runProcess({ command: process.execPath, args: ['-e', 'console.log("darf nicht laufen")'], signal: controller.signal });
  assert.equal(cancelled.reason, 'cancelled');
  assert.equal(cancelled.stdoutTail, '');
});

test('Abbruch beendet auch Kindprozesse der Prozessgruppe', async () => {
  if (process.platform === 'win32') return;
  const controller = new AbortController();
  let childPid;
  const code = `const { spawn } = require('node:child_process');
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    console.log(child.pid); setInterval(() => {}, 1000);`;
  const running = runProcess({ command: process.execPath, args: ['-e', code], signal: controller.signal,
    onChunk: ({ stream, text }) => {
      if (stream === 'stdout' && !childPid) {
        childPid = Number(text.trim());
        controller.abort();
      }
    }
  });
  const result = await running;
  assert.equal(result.reason, 'cancelled');
  assert.ok(childPid > 0);
  await new Promise((resolve) => setTimeout(resolve, 100));
  let state = '';
  try { state = execFileSync('ps', ['-o', 'stat=', '-p', String(childPid)], { encoding: 'utf8' }).trim(); } catch {}
  assert.ok(!state || state.startsWith('Z'), `Kindprozess läuft noch: ${state}`);
});
