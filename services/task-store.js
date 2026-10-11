const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

// Eine fachliche Aufgabe hat mehrere Versuche und ein dauerhaftes Ereignisprotokoll.
class TaskStore {
  constructor(directory, rootDirectory) {
    fs.mkdirSync(directory, { recursive: true });
    this.db = new DatabaseSync(path.join(directory, 'studio.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, request_id TEXT UNIQUE, record TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, record TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY, attempt_id TEXT NOT NULL, record TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS events_attempt ON events(attempt_id, seq);
      CREATE INDEX IF NOT EXISTS attempts_task ON attempts(task_id);`);
    if (!this.db.prepare('SELECT value FROM metadata WHERE key=?').get('workspace')) {
      const legacy = path.join(directory, 'studio-tasks.json');
      let initial = { rootDirectory, activeProject: '', tasks: [] };
      try {
        if (fs.existsSync(legacy)) {
          initial = JSON.parse(fs.readFileSync(legacy, 'utf8'));
          if (!Array.isArray(initial.tasks)) throw new Error('Auftragsliste fehlt');
          if (!fs.existsSync(`${legacy}.before-sqlite`)) fs.copyFileSync(legacy, `${legacy}.before-sqlite`, fs.constants.COPYFILE_EXCL);
        }
        this.write(initial);
      } catch (err) {
        this.db.close();
        throw new Error(`Alte Historie konnte nicht übernommen werden: ${err.message}`);
      }
    }
  }
  transaction(action) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = action(); this.db.exec('COMMIT'); return result; }
    catch (err) { this.db.exec('ROLLBACK'); throw err; }
  }
  read() {
    const workspace = JSON.parse(this.db.prepare('SELECT value FROM metadata WHERE key=?').get('workspace').value);
    const tasks = this.db.prepare('SELECT record FROM tasks ORDER BY rowid DESC').all().map((row) => JSON.parse(row.record));
    return { ...workspace, tasks };
  }
  write({ tasks, ...workspace }) {
    if (!Array.isArray(tasks)) throw new Error('Auftragsliste ist ungültig');
    this.transaction(() => {
      this.db.prepare('INSERT OR REPLACE INTO metadata VALUES (?,?)').run('workspace', JSON.stringify(workspace));
      const ids = new Set(tasks.map((task) => task.id));
      for (const row of this.db.prepare('SELECT id FROM tasks').all()) {
        if (!ids.has(row.id)) {
          this.db.prepare('DELETE FROM events WHERE attempt_id IN (SELECT id FROM attempts WHERE task_id=?)').run(row.id);
          this.db.prepare('DELETE FROM attempts WHERE task_id=?').run(row.id);
          this.db.prepare('DELETE FROM tasks WHERE id=?').run(row.id);
        }
      }
      for (const task of [...tasks].reverse()) this.put(task);
    });
  }
  put(task) {
    this.db.prepare(`INSERT INTO tasks VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET
      request_id=excluded.request_id, record=excluded.record`).run(task.id, task.requestId || null, JSON.stringify(task));
  }
  get(id) { const row = this.db.prepare('SELECT record FROM tasks WHERE id=?').get(id); return row ? JSON.parse(row.record) : null; }
  findRequest(id) { const row = this.db.prepare('SELECT record FROM tasks WHERE request_id=?').get(id); return row ? JSON.parse(row.record) : null; }
  beginAttempt(taskId, details) {
    const id = randomUUID();
    this.db.prepare('INSERT INTO attempts VALUES (?,?,?)').run(id, taskId, JSON.stringify({ ...details, id, status: 'running', startedAt: new Date().toISOString() }));
    return id;
  }
  addEvent(attemptId, event) {
    this.db.prepare('INSERT INTO events(attempt_id,record) VALUES (?,?)').run(attemptId, JSON.stringify(event));
  }
  finishAttempt(id, details) {
    const row = this.db.prepare('SELECT record FROM attempts WHERE id=?').get(id);
    if (row) this.db.prepare('UPDATE attempts SET record=? WHERE id=?').run(JSON.stringify({ ...JSON.parse(row.record), ...details, endedAt: new Date().toISOString() }), id);
  }
  attempts(taskId) {
    return this.db.prepare('SELECT * FROM attempts WHERE task_id=? ORDER BY rowid').all(taskId).map((row) => ({
      ...JSON.parse(row.record), events: this.db.prepare('SELECT record FROM events WHERE attempt_id=? ORDER BY seq').all(row.id).map((event) => JSON.parse(event.record))
    }));
  }
  reconcile() {
    this.transaction(() => {
      for (const task of this.read().tasks) {
        if (!['queued', 'running'].includes(task.status)) continue;
        task.status = 'incomplete'; task.exitCode = 1;
        task.interruption = 'Server neu gestartet; Fortsetzung muss ausdrücklich gestartet werden';
        const last = this.attempts(task.id).at(-1);
        if (last) {
          task.resultText = last.events.filter((event) => ['text', 'result'].includes(event.type)).map((event) => event.text || '').join('').slice(-12000);
          task.checkpoint = { taskId: task.id, projectPath: task.projectPath, goal: task.prompt, status: 'incomplete',
            revision: null, at: new Date().toISOString(), summary: task.resultText, verified: false,
            openSteps: ['Nach Neustart Dateistand und Prüfungen kontrollieren; Aufgabe ausdrücklich fortsetzen'] };
        }
        this.put(task);
      }
      for (const row of this.db.prepare('SELECT id,record FROM attempts').all()) {
        if (JSON.parse(row.record).status === 'running') this.finishAttempt(row.id, { status: 'incomplete' });
      }
    });
  }
  close() { this.db.close(); }
}
module.exports = { TaskStore };
