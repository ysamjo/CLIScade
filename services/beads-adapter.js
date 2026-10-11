const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

class BeadsAdapter {
  constructor({ execute } = {}) {
    this.queues = new Map();
    this.execute = execute || ((cwd, args) => new Promise((resolve, reject) => {
      execFile('bd', args, { cwd, timeout: 15000, maxBuffer: 1024 * 1024, env: { ...process.env, BEADS_DIR: path.join(cwd, '.beads') } }, (err, stdout) => {
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
  run(cwd, args, { json = true } = {}) {
    const key = fs.realpathSync(cwd);
    const before = this.queues.get(key) || Promise.resolve();
    const current = before.catch(() => {}).then(async () => {
      const output = await this.execute(key, args);
      return json ? JSON.parse(output) : output;
    });
    this.queues.set(key, current);
    current.finally(() => { if (this.queues.get(key) === current) this.queues.delete(key); }).catch(() => {});
    return current;
  }
  async context(cwd) {
    if (!this.enabled(cwd)) return null;
    // Pro Auftrag frisch lesen; beim Harness-Wechsel denselben Stand weitergeben.
    const output = await this.run(cwd, ['prime', '--full', '--readonly'], { json: false });
    if (typeof output !== 'string' || !output.trim()) throw new Error('Beads-Kontext ist leer; CLI und Projektdaten prüfen');
    const tasks = await this.ready(cwd);
    const prime = output.length > 48000
      ? `${output.slice(0, 48000)}\n[Beads-Kontext gekürzt; weitere Inhalte bei Bedarf mit bd prime lesen]` : output;
    return {
      prime, availableTasks: tasks.length,
      ready: tasks.slice(0, 20).map(({ id, title, status, priority }) => ({ id, title: String(title || '').slice(0, 1000), status, priority }))
    };
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
