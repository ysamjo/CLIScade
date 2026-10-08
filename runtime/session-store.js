const fs = require('node:fs');
const path = require('node:path');

const activeSessions = new Set();

function findNamedFile(root, needle, depth = 4) {
  if (depth < 0 || !fs.existsSync(root)) return false;
  for (const item of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, item.name);
    if (item.isFile() && item.name.endsWith('.jsonl') && item.name.includes(needle)) return true;
    if (item.isDirectory() && findNamedFile(target, needle, depth - 1)) return true;
  }
  return false;
}

function hasSession(harnessId, sessionId, env = process.env) {
  if (typeof sessionId !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(sessionId)) return false;
  try {
    const home = env.HOME || process.env.HOME;
    if (harnessId === 'claude') return findNamedFile(path.join(env.CLAUDE_CONFIG_DIR || path.join(home, '.claude'), 'projects'), sessionId);
    if (harnessId === 'codex') return findNamedFile(path.join(env.CODEX_HOME || path.join(home, '.codex'), 'sessions'), sessionId);
    if (harnessId === 'opencode') {
      const base = path.join(home, '.local', 'share', 'opencode');
      return ['opencode.db', 'opencode.db-wal'].some((name) => {
        const file = path.join(base, name);
        return fs.existsSync(file) && fs.statSync(file).size < 64 * 1024 * 1024 && fs.readFileSync(file).includes(Buffer.from(sessionId));
      });
    }
  } catch {}
  return false;
}

function acquireSession(harnessId, sessionId) {
  if (!sessionId) return () => {};
  const key = `${harnessId}:${sessionId}`;
  if (activeSessions.has(key)) return null;
  activeSessions.add(key);
  return () => activeSessions.delete(key);
}

module.exports = { hasSession, acquireSession };
