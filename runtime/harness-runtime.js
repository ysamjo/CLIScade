const { execFileSync } = require('node:child_process');
const { HARNESS_REGISTRY } = require('./registry');
const { runProcess } = require('./process-runner');
const { canonicalEvent } = require('./events');
const { classifyError } = require('./errors');
const { hasSession, acquireSession } = require('./session-store');

const ADAPTERS = Object.freeze({
  claude: require('./adapters/claude'), codex: require('./adapters/codex'),
  cline: require('./adapters/cline'), opencode: require('./adapters/opencode'),
  qoder: require('./adapters/qoder'), antigravity: require('./adapters/antigravity'),
  codebuddy: require('./adapters/codebuddy'), cursor: require('./adapters/cursor'),
  junie: require('./adapters/junie'), kilo: require('./adapters/kilo'),
  copilot: require('./adapters/copilot'), kiro: require('./adapters/kiro'), vibe: require('./adapters/vibe')
});

// Gerüst der aufrufenden App, das in keinen Lauf gehört: SERVER__PORT/SERVER__HOST
// benennen den Web-UI-Server der WorkBuddy-App. Erbt sie ein Harness, bindet er
// denselben Port und stirbt vor dem ersten Token mit
// "listen EADDRINUSE: address already in use 127.0.0.1:54968".
const APP_FRAMEWORK_ENV = Object.freeze(['SERVER__PORT', 'SERVER__HOST']);

function childEnv(env = {}) {
  const clean = { ...env };
  for (const name of APP_FRAMEWORK_ENV) delete clean[name];
  return clean;
}

function availableCommand(entry, env) {
  for (const command of entry.commands) {
    try { return execFileSync('which', [command], { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || command; }
    catch {}
  }
  return null;
}

async function runHarness({ harnessId, model = 'Standard', prompt, cwd, previousSessionId, signal, env = process.env,
  execution = {}, idleTimeoutMs = 180000, timeoutMs = 30 * 60 * 1000, onEvent, onSpawn, onIdle } = {}) {
  const entry = HARNESS_REGISTRY[harnessId];
  if (!entry || !entry.dispatchable) return {
    status: 'failed', finalText: '', sessionId: null, model,
    error: { kind: 'harness_failure', retryability: 'never', message: 'Harness ist nicht für Headless-Läufe freigegeben' }, events: [], exitCode: null
  };
  const adapter = ADAPTERS[harnessId];
  const runEnv = childEnv(env);
  const events = [];
  let sessionId = null;
  let finalText = '';
  let explicitError = null;
  let stdoutBuffer = '';
  const emit = (rawEvent) => {
    const event = canonicalEvent(rawEvent, harnessId);
    if (!event) return;
    if (events.length < 5000) events.push(event);
    if (event.sessionId) sessionId = event.sessionId;
    if (event.type === 'text') finalText += event.text || '';
    if (event.type === 'result' && event.text) finalText = event.text;
    if (event.type === 'error') explicitError = event.message || 'Harness-Lauf fehlgeschlagen';
    try { onEvent?.(event); } catch {}
  };

  const resume = entry.resumable && previousSessionId && hasSession(harnessId, previousSessionId, runEnv);
  if (previousSessionId && !resume) emit({ type: 'session_lost', message: 'Gespeicherte Session fehlt; neuer CLI-Thread im selben Projekt' });
  const release = acquireSession(harnessId, resume ? previousSessionId : null);
  if (!release) return {
    status: 'failed', finalText, sessionId: previousSessionId, model,
    error: { kind: 'session_busy', retryability: 'never', message: 'Diese Session arbeitet bereits' }, events, exitCode: null
  };
  try {
    const command = availableCommand(entry, runEnv);
    if (!command) return {
      status: 'failed', finalText, sessionId, model,
      error: { kind: 'not_installed', retryability: 'next_harness', message: `${entry.name} ist nicht installiert` }, events, exitCode: null
    };
    if (entry.limitations) emit({ type: 'warning', text: `${entry.limitations}\n` });
    const args = adapter.build({ prompt, model, sessionId: resume ? previousSessionId : null, cwd, env: runEnv, execution });
    const structured = entry.structuredOutput;
    const consume = (line) => {
      if (!line) return;
      let parsed;
      try { parsed = JSON.parse(line); } catch {
        emit(entry.strictOutput ? { type: 'warning', text: `${line}\n` } : { type: 'text', text: `${line}\n` });
        return;
      }
      try {
        for (const event of adapter.normalize(parsed)) emit(event);
      } catch {
        emit({ type: 'error', message: 'CLI-Ereignis konnte nicht verarbeitet werden' });
      }
    };
    const processResult = await runProcess({
      command, args, cwd, env: { ...runEnv, ...adapter.environment?.({ model }), PWD: cwd }, signal, idleTimeoutMs, timeoutMs, onIdle, onSpawn,
      onChunk: ({ stream, text }) => {
        if (stream === 'stderr') { emit({ type: 'warning', text }); return; }
        if (!structured) { emit({ type: 'text', text }); return; }
        stdoutBuffer += text;
        let newline;
        while ((newline = stdoutBuffer.indexOf('\n')) !== -1) {
          consume(stdoutBuffer.slice(0, newline).trim());
          stdoutBuffer = stdoutBuffer.slice(newline + 1);
        }
        if (stdoutBuffer.length > 1024 * 1024) {
          emit({ type: 'warning', text: 'Zu lange Ausgabezeile abgeschnitten' });
          stdoutBuffer = '';
        }
      }
    });
    if (structured && stdoutBuffer.trim()) consume(stdoutBuffer.trim());
    const raw = `${processResult.stdoutTail}\n${processResult.stderrTail}`;
    const error = classifyError({ explicit: explicitError || processResult.error?.message || adapter.detectFailure?.(raw), raw,
      stderr: events.some((event) => event.type === 'result') ? '' : processResult.stderrTail,
      exitCode: processResult.exitCode, reason: processResult.reason })
      || (entry.requiresText && !finalText.trim()
        ? { kind: 'harness_failure', retryability: 'next_harness', message: 'CLI endete ohne lesbare Antwort; Ausgabeformat oder Freigaben prüfen' } : null)
      || (!events.some((event) => ['text', 'result', 'tool_start', 'tool_result'].includes(event.type))
        ? { kind: 'harness_failure', retryability: 'next_harness', message: 'Harness endete ohne Ergebnis' } : null);
    return {
      status: error?.kind === 'cancelled' ? 'cancelled' : error ? 'failed' : 'completed',
      finalText, sessionId, model, error, events, exitCode: processResult.exitCode,
      rawTail: raw.slice(-64 * 1024)
    };
  } finally {
    release();
  }
}

module.exports = { runHarness, childEnv };
