const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { selectMemories, memoryEntries } = require('./project-memory');

class BeadsAdapter {
  constructor({ execute } = {}) {
    this.queues = new Map();
    this.execute = execute || ((cwd, args, options = {}) => new Promise((resolve, reject) => {
      execFile('bd', args, { cwd, timeout: options.timeout || 15000, signal: options.signal, maxBuffer: options.maxBuffer || 1024 * 1024, env: { ...process.env, BEADS_DIR: path.join(cwd, '.beads') } }, (err, stdout) => {
        if (err) reject(new Error(err.code === 'ENOENT' ? 'Beads-CLI ist nicht installiert' : 'Beads-Zugriff fehlgeschlagen'));
        else resolve(stdout);
      });
    }));
  }
  enabled(cwd) {
    const directory = path.join(cwd, '.beads');
    try { return fs.statSync(directory).isDirectory() && fs.realpathSync(directory).startsWith(`${fs.realpathSync(cwd)}${path.sep}`); }
    catch { return false; }
  }
  exclusive(cwd, job, options = {}) {
    const key = fs.realpathSync(cwd);
    const before = this.queues.get(key) || Promise.resolve();
    const current = before.catch(() => {}).then(() => job(args => this.execute(key, args, options)));
    this.queues.set(key, current);
    current.finally(() => { if (this.queues.get(key) === current) this.queues.delete(key); }).catch(() => {});
    return current;
  }
  run(cwd, args, { json = true } = {}) {
    return this.exclusive(cwd, async (run) => {
      const output = await run(args);
      return json ? JSON.parse(output) : output;
    });
  }
  async context(cwd, { prompt = '' } = {}) {
    if (!this.enabled(cwd)) return null;
    const prime = await this.run(cwd, ['prime', '--full', '--no-memories', '--readonly'], { json: false });
    if (typeof prime !== 'string' || !prime.trim()) throw new Error('Beads-Kontext ist leer; CLI und Projektdaten prüfen');
    const memories = await this.memories(cwd);
    const selected = selectMemories(memories, prompt);
    const tasks = await this.ready(cwd);
    return { prime, memories: selected.items, memoryCount: memories.length, omittedMemories: selected.omitted,
      availableTasks: tasks.length,
      ready: tasks.slice(0, 20).map(({ id, title, status, priority }) => ({ id, title: String(title || ''), status, priority })) };
  }
  async memories(cwd) {
    if (!this.enabled(cwd)) return [];
    const result = await this.run(cwd, ['memories', '--json', '--readonly']);
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('Beads-Projektwissen ist ungültig');
    return Object.entries(result).filter(([key, value]) => key !== 'schema_version' && typeof value === 'string').map(([key, text]) => {
      if (key.startsWith('router-')) {
        try {
          const data = JSON.parse(text);
          if (data.version === 1 && typeof data.text === 'string') return { ...data, key };
        } catch {}
      }
      return { key, text, verified: false, source: { type: 'beads_memory' } };
    });
  }
  async remember(cwd, entry) {
    if (!this.enabled(cwd)) throw new Error('Beads ist in diesem Projekt nicht eingerichtet');
    await this.run(cwd, ['remember', JSON.stringify(entry), '--key', entry.key, '--sandbox'], { json: false });
  }
  async learn(cwd, record) {
    if (!this.enabled(cwd)) return { state: 'disabled', saved: 0 };
    const existing = new Map((await this.memories(cwd)).map(m => [m.key, m]));
    let saved = 0;
    for (const entry of memoryEntries(record)) {
      const previous = existing.get(entry.key);
      if (previous?.verified && !entry.verified) continue;
      if (previous?.text === entry.text && previous?.source?.revision === entry.source.revision && previous?.verified === entry.verified && JSON.stringify(previous.evidence || []) === JSON.stringify(entry.evidence || [])) continue;
      await this.remember(cwd, entry);
      saved++;
    }
    return { state: 'ready', saved, memoryCount: (await this.memories(cwd)).length };
  }
  async status(cwd) {
    if (!this.enabled(cwd)) return { enabled: false, state: 'disabled', tasks: [], memoryCount: 0 };
    try {
      const memories = await this.memories(cwd);
      return { enabled: true, state: 'ready', tasks: await this.ready(cwd), memoryCount: memories.length };
    } catch (error) { return { enabled: true, state: 'error', tasks: [], error: error.message }; }
  }
  async ready(cwd) {
    if (!this.enabled(cwd)) return [];
    const result = await this.run(cwd, ['ready', '--json', '--readonly']);
    if (!Array.isArray(result)) throw new Error('Beads-Antwort ist ungültig');
    return result;
  }
  async show(cwd, id) {
    if (typeof id !== 'string' || !/^[a-zA-Z][a-zA-Z0-9]*-[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/.test(id)) throw new Error('Beads-ID ist ungültig');
    if (!this.enabled(cwd)) throw new Error('Beads ist in diesem Projekt nicht eingerichtet');
    const result = await this.run(cwd, ['show', id, '--json', '--readonly']);
    const bead = Array.isArray(result) ? result[0] : result;
    if (!bead || bead.id !== id) throw new Error('Beads-Aufgabe nicht gefunden');
    return bead;
  }
}
module.exports = { BeadsAdapter };
