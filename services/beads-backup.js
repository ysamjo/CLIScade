const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { createHash } = require('node:crypto');
const { digest } = require('./project-memory');
function defaultNas() { return null; }
function command(file, args, options = {}) {
 return new Promise((resolve, reject) => execFile(file, args, { timeout: 120000, maxBuffer: 1024 * 1024, ...options },
  (error, stdout) => error ? reject(new Error(`${path.basename(file)} fehlgeschlagen`)) : resolve(stdout)));
}
class BeadsBackupService {
 constructor({ beads, stateDirectory, nas = null, execute = command, intervalMs = 86400000, onChange = () => {} } = {}) {
  this.onChange = onChange; this.beads = beads; this.directory = path.join(stateDirectory, 'beads-backups'); this.nas = nas; this.controller = new AbortController();
  this.execute = (file, args, options = {}) => execute(file, args, { ...options, signal: this.controller.signal });
  this.intervalMs = intervalMs; this.jobs = new Map(); this.dirty = new Set(); this.chain = Promise.resolve(); this.stopped = false;
  fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
  this.file = path.join(this.directory, 'state.json');
  try { this.states = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { this.states = {}; }
 }
 persist() {
  const temporary = `${this.file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(this.states, null, 2), { mode: 0o600 }); fs.renameSync(temporary, this.file);
  for (const state of Object.values(this.states)) if (state.projectPath) this.onChange(state.projectPath, this.nas ? state : { ...state, remote: 'disabled', remoteError: undefined });
 }
 status(cwd) {
  const state = this.states[digest(fs.realpathSync(cwd))] || { local: 'never', remote: 'pending' };
  return this.nas ? state : { ...state, remote: 'disabled', remoteError: undefined };
 }
 request(cwd, { force = false } = {}) {
  if (this.stopped || !this.beads.enabled(cwd)) return Promise.resolve();
  const key = digest(fs.realpathSync(cwd));
  if (this.jobs.has(key)) { if (force) this.dirty.add(key); return this.jobs.get(key); }
  const current = this.chain.catch(() => {}).then(() => this.backup(cwd, force)).catch(() => {
   this.states[key] = { ...this.states[key], local: 'error', error: 'Sicherung oder Wiederherstellungsprobe fehlgeschlagen' }; this.persist();
  }).finally(() => {
   this.jobs.delete(key);
   if (this.dirty.delete(key) && !this.stopped) this.request(cwd, { force: true });
  });
  this.jobs.set(key, current); this.chain = current; return current;
 }
 async backup(cwd, force = false) {
  if (this.stopped) return;
  const key = digest(fs.realpathSync(cwd));
  const prior = this.states[key] || {};
  // Ein gültiger lokaler Stand wird bei NAS-Ausfall erneut übertragen statt neu erzeugt.
  if (!force && prior.local === 'verified' && Date.now() - Date.parse(prior.at) < this.intervalMs && fs.existsSync(prior.archive)) {
   await this.upload(key); return;
  }
  const target = path.join(this.directory, key); fs.mkdirSync(target, { recursive: true, mode: 0o700 });
  const native = path.join(target, 'native');
  const at = new Date().toISOString(); const stamp = at.replace(/[:.]/g, '-');
  const archive = path.join(target, `${stamp}.tar.gz`);
  this.states[key] = { ...prior, local: 'running', projectPath: cwd, remote: this.nas ? 'pending' : 'disabled' }; this.persist();
  // Die lokalen Beads-Backup-Pfade gehören nicht in die Versionsverwaltung.
  try {
   const ignoreFile = (await this.execute('git', ['rev-parse', '--git-path', 'info/exclude'], { cwd })).trim();
   const ignore = path.resolve(cwd, ignoreFile); fs.mkdirSync(path.dirname(ignore), { recursive: true });
   const old = fs.existsSync(ignore) ? fs.readFileSync(ignore, 'utf8') : '';
   if (!old.includes('/.beads/dolt-backup')) fs.appendFileSync(ignore, '\n/.beads/dolt-backup*.json\n');
  } catch {}
  await this.beads.exclusive(cwd, async (run) => {
   await run(['backup', 'init', native, '--sandbox']);
   await run(['backup', 'sync', '--sandbox']);
   const expected = { memories: JSON.parse(await run(['memories', '--json', '--readonly'])),
     issues: JSON.parse(await run(['list', '--all', '--limit', '0', '--json', '--readonly'])) };
   await this.execute('tar', ['-czf', `${archive}.tmp`, '-C', target, 'native']);
   await this.verifyArchive(`${archive}.tmp`, expected);
   fs.renameSync(`${archive}.tmp`, archive); fs.chmodSync(archive, 0o600);
  }, { signal: this.controller.signal, timeout: 120000, maxBuffer: 32 * 1024 * 1024 });
  const checksum = createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
  fs.writeFileSync(`${archive}.sha256`, `${checksum}  ${path.basename(archive)}\n`, { mode: 0o600 });
  this.states[key] = { local: 'verified', remote: this.nas ? 'pending' : 'disabled', at, archive, checksum, projectPath: cwd, restoreVerifiedAt: new Date().toISOString() };
  this.persist();
  await this.upload(key);
  const snapshots = fs.readdirSync(target).filter(f => /^\d.*\.tar\.gz$/.test(f)).sort().reverse();
  for (const old of snapshots.slice(7)) { fs.rmSync(path.join(target, old), { force: true }); fs.rmSync(path.join(target, `${old}.sha256`), { force: true }); }
 }
 async verifyArchive(archive, expected) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'beads-restore-check-'));
  try {
   await this.execute('tar', ['-xzf', archive, '-C', temporary]);
   const project = path.join(temporary, 'project'); fs.mkdirSync(project);
   const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('BEADS_') && !key.startsWith('BD_')));
   env.BEADS_DIR = path.join(project, '.beads');
   await this.execute('bd', ['init', '--skip-agents', '--skip-hooks', '--non-interactive', '--prefix', 'restore'], { cwd: project, env });
   await this.execute('bd', ['backup', 'restore', path.join(temporary, 'native'), '--force', '--sandbox'], { cwd: project, env });
   const actual = JSON.parse(await this.execute('bd', ['memories', '--json', '--readonly'], { cwd: project, env, maxBuffer: 32 * 1024 * 1024 }));
   // Das Gedächtnis muss vollständig und unverändert wiederherstellbar sein.
   const ordered = object => JSON.stringify(Object.entries(object).sort(([a], [b]) => a.localeCompare(b)));
   if (ordered(actual) !== ordered(expected.memories)) throw new Error('Wiederhergestelltes Projektwissen stimmt nicht überein');
   const issues = JSON.parse(await this.execute('bd', ['list', '--all', '--limit', '0', '--json', '--readonly'], { cwd: project, env, maxBuffer: 32 * 1024 * 1024 }));
   const sorted = list => JSON.stringify(list.sort((a, b) => String(a.id).localeCompare(String(b.id))));
   if (sorted(issues) !== sorted(expected.issues)) throw new Error('Wiederhergestellte Aufgaben stimmen nicht überein');
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
 }
 async upload(key) {
  if (!this.nas || this.stopped) return;
  const state = this.states[key];
  if (state.remote === 'verified') return;
  if (this.lastNasFailure && Date.now() - this.lastNasFailure < 60000) return;
  const file = path.basename(state.archive); const directory = `${this.nas.directory}/${key}`;
  const sshArgs = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', '-i', this.nas.key];
  try {
   // Ausschließlich feste Konfiguration und selbst erzeugte Hex-IDs/Dateinamen im Remote-Befehl.
   if (!/^\/[A-Za-z0-9_./-]+$/.test(directory) || !/^[0-9TZ-]+\.tar\.gz$/.test(file)) throw new Error('Ungültiges Sicherungsziel');
   await this.execute('ssh', [...sshArgs, this.nas.host, `mkdir -p ${directory} && chmod 700 ${directory}`], { timeout: 10000 });
   await this.execute('scp', [...sshArgs, state.archive, `${state.archive}.sha256`, `${this.nas.host}:${directory}/`]);
   await this.execute('ssh', [...sshArgs, this.nas.host, `cd ${directory} && chmod 600 ${file} ${file}.sha256 && sha256sum -c ${file}.sha256`], { timeout: 10000 });
   state.remote = 'verified'; state.remoteAt = new Date().toISOString(); delete state.remoteError;
  } catch { state.remote = 'pending'; state.remoteError = 'NAS nicht erreichbar oder Prüfsumme nicht bestätigt'; this.lastNasFailure = Date.now(); }
  this.persist();
 }
 start(projects) {
  const run = () => { for (const cwd of projects()) this.request(cwd); };
  this.startTimer = setTimeout(run, 2000); this.startTimer.unref();
  this.timer = setInterval(run, 30 * 60 * 1000); this.timer.unref();
 }
 stop() { this.stopped = true; this.controller.abort(); clearTimeout(this.startTimer); clearInterval(this.timer); }
}
module.exports = { BeadsBackupService, command, defaultNas };
