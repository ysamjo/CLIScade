'use strict';
// ACP v1 stdio client for CLIScade. No shell, no arbitrary executable arguments.
const { spawn, execFileSync } = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');
const { canonicalEvent } = require('./events');
const { acquireSession } = require('./session-store');
const { prepareHeadlessPrompt } = require('./headless-prompt');

const ACP_PROGRAMS = Object.freeze({
  claude: { command: 'claude-agent-acp', args: [] },
  codex: { command: 'codex-acp', args: [] },
  opencode: { command: 'opencode', args: ['acp'] },
  kiro: { command: 'kiro-cli', args: ['acp'] }
});
const MAX_LINE = 2 * 1024 * 1024;

function acpProgram(harnessId) {
  return ACP_PROGRAMS[harnessId] || null;
}

function locate(program, env) {
  try {
    return execFileSync('which', [program.command], { env, encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
  } catch { return null; }
}

function acpError(message, kind = 'harness_failure', retryability = 'next_harness') {
  return { kind, retryability, message: String(message).slice(0, 700) };
}

function acpUpdate(update) {
  const text = update.content?.type === 'text' ? update.content.text : '';
  switch (update.sessionUpdate) {
    case 'agent_message_chunk': return text ? { type: 'text', text } : null;
    case 'agent_thought_chunk': return text ? { type: 'thinking', text } : null;
    case 'tool_call':
      return { type: 'tool_start', name: update.title || update.kind || 'Tool',
        toolCallId: update.toolCallId };
    case 'tool_call_update':
      if (update.status === 'completed' || update.status === 'failed') {
        const output = (update.content || []).map(item => item.content?.text || '').filter(Boolean).join('\n');
        // ACP tool results do not guarantee a shell exit code. Never fabricate one.
        return { type: 'tool_result', name: update.title || 'Tool', toolCallId: update.toolCallId,
          text: output || update.status, exitCode: null };
      }
      return null;
    default: return null;
  }
}

function runAcp({ harnessId, model = 'Standard', prompt, cwd, previousSessionId,
  previousSessionTransport, signal, env = process.env, idleTimeoutMs = 180000,
  timeoutMs = 30 * 60 * 1000, onEvent, onIdle, program: injectedProgram } = {}) {
  const program = injectedProgram || acpProgram(harnessId);
  const executable = program && locate(program, env);
  const events = [];
  let finalText = '';
  let sessionId = null;
  const emit = raw => {
    const event = canonicalEvent(raw, harnessId);
    if (!event) return;
    if (events.length < 5000) events.push(event);
    if (event.type === 'text') finalText += event.text;
    try { onEvent?.(event); } catch {}
  };
  const result = (status, error, exitCode = null) => ({
    status, error, exitCode, transport: 'acp', sessionId, finalText, events,
    model, rawTail: error?.message || ''
  });
  if (signal?.aborted) return Promise.resolve(result('cancelled', acpError('Abgebrochen', 'cancelled', 'never')));
  if (!executable) return Promise.resolve(result('failed',
    acpError('ACP-Executable nicht installiert: ' + (program?.command || harnessId), 'acp_unavailable')));
  // ACP session IDs are opaque and are not the same as the CLI's headless session IDs.
  const resumable = previousSessionTransport === 'acp' && typeof previousSessionId === 'string'
    && previousSessionId.length > 0 && previousSessionId.length <= 512;
  const release = acquireSession(harnessId, resumable ? previousSessionId : null);
  if (!release) return Promise.resolve(result('failed',
    acpError('ACP-Session wird bereits verwendet', 'session_busy', 'never')));

  return new Promise(resolve => {
    let child, nextId = 0, closed = false, done = false, stopped = false;
    let cancelled = false, prompted = false, permissionDenied = false;
    const decoder = new StringDecoder('utf8');
    let idleTimer, wallTimer, killTimer, input = '', reason = null;
    const pending = new Map();
    const cleanup = () => {
      clearTimeout(idleTimer); clearTimeout(wallTimer); clearTimeout(killTimer);
      signal?.removeEventListener('abort', onAbort);
      release();
    };
    const terminate = () => {
      if (!child || child.exitCode !== null || child.killed) return;
      try { if (process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM'); else child.kill('SIGTERM'); }
      catch { try { child.kill('SIGTERM'); } catch {} }
      killTimer = setTimeout(() => {
        try { if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); }
        catch { try { child.kill('SIGKILL'); } catch {} }
      }, 5000);
      killTimer.unref?.();
    };
    const finish = (status, error, exitCode = null) => {
      if (done) return;
      done = true;
      for (const { reject } of pending.values()) reject(new Error('ACP-Verbindung geschlossen'));
      pending.clear();
      cleanup();
      terminate();
      resolve(result(status, error, exitCode));
    };
    const send = object => {
      if (done || !child?.stdin?.writable) throw new Error('ACP-Verbindung geschlossen');
      child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...object }) + '\n');
    };
    const request = (method, params) => new Promise((resolveRequest, reject) => {
      const id = nextId++;
      pending.set(id, { resolve: resolveRequest, reject });
      try { send({ id, method, params }); }
      catch (err) { pending.delete(id); reject(err); }
    });
    const notify = (method, params) => { try { send({ method, params }); } catch {} };
    const onAbort = () => {
      cancelled = true;
      if (sessionId) notify('session/cancel', { sessionId });
      // Cancellation needs a bounded wait even when the agent ignores it.
      setTimeout(() => { if (!done) finish('cancelled', acpError('Abgebrochen', 'cancelled', 'never')); }, 1500).unref?.();
    };
    const armIdle = () => {
      if (!idleTimeoutMs || done) return;
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        try { onIdle?.(idleTimeoutMs); } catch {}
        if (sessionId) notify('session/cancel', { sessionId });
        finish('failed', acpError('ACP: keine Ausgabe innerhalb der Frist', 'timeout'));
      }, idleTimeoutMs);
      idleTimer.unref?.();
    };
    const handle = message => {
      if (!message || message.jsonrpc !== '2.0') throw new Error('Ungültige ACP JSON-RPC Nachricht');
      if ('id' in message && !('method' in message)) {
        const item = pending.get(message.id);
        if (!item) return;
        pending.delete(message.id);
        if (message.error) item.reject(new Error(message.error.message || 'ACP-Fehler'));
        else item.resolve(message.result);
        return;
      }
      if (message.method === 'session/update') {
        if (!sessionId || message.params?.sessionId !== sessionId || !prompted) return;
        const event = acpUpdate(message.params.update || {});
        if (event) emit(event);
        return;
      }
      if ('id' in message && typeof message.method === 'string') {
        if (message.method === 'session/request_permission') {
          // No automatic trust. The current task UI cannot answer a live ACP request.
          // Explicitly cancel instead of blocking the queue indefinitely.
          permissionDenied = true;
          emit({ type: 'warning', text: 'ACP: Tool-Freigabe erforderlich; im unbeaufsichtigten Lauf abgelehnt.\n' });
          send({ id: message.id, result: { outcome: { outcome: 'cancelled' } } });
        } else {
          send({ id: message.id, error: { code: -32601, message: 'Methode nicht unterstützt' } });
        }
      }
    };
    const onData = bytes => {
      armIdle();
      input += decoder.write(bytes);
      if (input.length > MAX_LINE) {
        finish('failed', acpError('ACP-Protokollzeile überschreitet Limit', 'protocol'));
        return;
      }
      let index;
      while (!done && (index = input.indexOf('\n')) >= 0) {
        const line = input.slice(0, index).trim();
        input = input.slice(index + 1);
        if (!line) continue;
        try { handle(JSON.parse(line)); }
        catch (err) { finish('failed', acpError('ACP-Protokollfehler: ' + err.message, 'protocol')); }
      }
    };

    try {
      child = spawn(executable, program.args || [], { cwd, env, detached: process.platform !== 'win32',
        stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      finish('failed', acpError(err.message, 'spawn_failure'));
      return;
    }
    child.stdout.on('data', onData);
    child.stderr.on('data', chunk => { armIdle(); emit({ type: 'warning', text: chunk.toString() }); });
    child.once('error', error => finish('failed', acpError(error.message, 'spawn_failure')));
    child.once('close', code => {
      closed = true;
      if (!done) finish(cancelled ? 'cancelled' : 'failed',
        acpError(cancelled ? 'Abgebrochen' : 'ACP-Prozess vorzeitig beendet (' + code + ')',
          cancelled ? 'cancelled' : 'harness_failure'), code);
    });
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) { onAbort(); return; }
    armIdle();
    if (timeoutMs > 0) {
      wallTimer = setTimeout(() => {
        if (sessionId) notify('session/cancel', { sessionId });
        finish('failed', acpError('ACP-Gesamtzeitlimit überschritten', 'timeout'));
      }, timeoutMs);
      wallTimer.unref?.();
    }

    (async () => {
      try {
        const hello = await request('initialize', {
          protocolVersion: 1, clientCapabilities: {},
          clientInfo: { name: 'cliscade', title: 'CLIscade', version: '1.0.0' }
        });
        if (done) return;
        if (hello?.protocolVersion !== 1) throw new Error('ACP-Version nicht unterstützt: ' + hello?.protocolVersion);
        const capabilities = hello.agentCapabilities || {};
        if (model && model !== 'Standard') {
          // Never silently run a different model than the configured route.
          throw new Error('ACP-Modellauswahl noch nicht implementiert. Route auf Standard stellen.');
        }
        const options = { cwd, mcpServers: [] };
        let setup;
        if (resumable && capabilities.sessionCapabilities?.resume) {
          try { setup = await request('session/resume', { ...options, sessionId: previousSessionId }); sessionId = previousSessionId; }
          catch { emit({ type: 'session_lost', message: 'ACP-Resume fehlgeschlagen; neuer Thread' }); }
        } else if (resumable && capabilities.loadSession) {
          try { setup = await request('session/load', { ...options, sessionId: previousSessionId }); sessionId = previousSessionId; }
          catch { emit({ type: 'session_lost', message: 'ACP-Load fehlgeschlagen; neuer Thread' }); }
        } else if (resumable) emit({ type: 'session_lost', message: 'ACP-Agent unterstützt keine Wiederaufnahme; neuer Thread' });
        if (!sessionId) {
          setup = await request('session/new', options);
          sessionId = setup?.sessionId;
        }
        if (typeof sessionId !== 'string' || !sessionId) throw new Error('ACP-Session-ID fehlt');
        prompted = true;
        const answer = await request('session/prompt', {
          sessionId, prompt: [{ type: 'text', text: prepareHeadlessPrompt(prompt) }]
        });
        if (done) return;
        const stopReason = answer?.stopReason;
        if (cancelled || stopReason === 'cancelled') {
          finish('cancelled', acpError('Abgebrochen', 'cancelled', 'never'));
        } else if (permissionDenied) {
          finish('failed', acpError('ACP-Werkzeugfreigabe wurde verweigert; interaktive Genehmigung noch nicht verfügbar', 'permission', 'never'));
        } else if (stopReason === 'end_turn' && finalText.trim()) {
          finish('completed', null, 0);
        } else {
          finish('failed', acpError('ACP-Turn beendet: ' + (stopReason || 'keine Antwort') +
            (finalText.trim() ? '' : ' (kein Antworttext)'), 'harness_failure'));
        }
      } catch (err) {
        if (!done) finish(cancelled ? 'cancelled' : 'failed',
          acpError(err.message, cancelled ? 'cancelled' : 'harness_failure',
            cancelled ? 'never' : 'next_harness'));
      }
    })();
  });
}
module.exports = { ACP_PROGRAMS, acpProgram, acpUpdate, runAcp };
