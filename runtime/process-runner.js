const { spawn } = require('node:child_process');

const MAX_TAIL = 64 * 1024;

function runProcess({ command, args = [], cwd, env, signal, idleTimeoutMs = 0, timeoutMs = 0, onChunk, onIdle, onSpawn } = {}) {
  if (signal?.aborted) return Promise.resolve({ reason: 'cancelled', exitCode: null, stdoutTail: '', stderrTail: '' });

  return new Promise((resolve) => {
    let child;
    let reason = null;
    let settled = false;
    let idleTimer;
    let wallTimer;
    let killTimer;
    let stdoutTail = '';
    let stderrTail = '';

    const terminate = (why) => {
      if (settled || reason) return;
      reason = why;
      const kill = (sig) => {
        if (!child?.pid) return;
        try {
          if (process.platform !== 'win32') process.kill(-child.pid, sig);
          else child.kill(sig);
        } catch {
          try { child.kill(sig); } catch {}
        }
      };
      kill('SIGTERM');
      killTimer = setTimeout(() => kill('SIGKILL'), 5000);
      killTimer.unref?.();
    };
    const abort = () => terminate('cancelled');
    const armIdle = () => {
      if (!idleTimeoutMs || reason) return;
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        try { onIdle?.(idleTimeoutMs); } catch {}
        terminate('idle_timeout');
      }, idleTimeoutMs);
      idleTimer.unref?.();
    };
    const finish = (exitCode, error) => {
      if (settled) return;
      settled = true;
      clearTimeout(idleTimer);
      clearTimeout(wallTimer);
      clearTimeout(killTimer);
      signal?.removeEventListener('abort', abort);
      resolve({ reason: reason || (error ? 'spawn_failure' : null), exitCode, stdoutTail, stderrTail, ...(error ? { error } : {}) });
    };

    try {
      child = spawn(command, args, { cwd, env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      finish(null, error);
      return;
    }
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    try { onSpawn?.(child); } catch {}
    armIdle();
    if (timeoutMs > 0) {
      wallTimer = setTimeout(() => terminate('timeout'), timeoutMs);
      wallTimer.unref?.();
    }
    for (const stream of ['stdout', 'stderr']) {
      child[stream].on('data', (data) => {
        const chunk = data.toString();
        if (stream === 'stdout') stdoutTail = (stdoutTail + chunk).slice(-MAX_TAIL);
        else stderrTail = (stderrTail + chunk).slice(-MAX_TAIL);
        armIdle();
        try { onChunk?.({ stream, text: chunk }); } catch {}
      });
    }
    child.once('error', (error) => finish(null, error));
    child.once('close', (code) => finish(code, null));
  });
}

module.exports = { runProcess };
