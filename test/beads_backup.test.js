const test = require('node:test'); const assert = require('node:assert/strict');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const { BeadsBackupService } = require('../services/beads-backup');
function fixture(t) {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-test-')); const project = path.join(root, 'project');fs.mkdirSync(project);
 t.after(() => fs.rmSync(root, { recursive: true, force: true }));
 const calls = [];
 const beads = { enabled: () => true, exclusive: async (cwd, callback) => callback(async args => { calls.push(args);return args[0] === 'memories' ? '{"marker":"Wissen"}' : args[0] === 'list' ? '[]' : ''; }) };
 const execute = async (file, args) => {
  if (file === 'tar') { fs.writeFileSync(args[1], 'Sicherung'); return ''; }
  if (file === 'ssh' || file === 'scp') throw new Error('NAS offline');
  throw new Error('Kein Git');
 };
 return { root, project, calls, beads, execute };
}
test('NAS-Ausfall bleibt ausstehend; geprüfte lokale Sicherung überlebt Neustart', async t => {
 const f = fixture(t);const options = { beads: f.beads, stateDirectory: f.root, execute: f.execute, nas: { host:'root@192.168.178.162',key:'/key',directory:'/DATA/AppData/beads' } };
 const service = new BeadsBackupService(options);service.verifyArchive = async () => {};
 await service.request(f.project);
 assert.equal(service.status(f.project).local, 'verified');assert.equal(service.status(f.project).remote, 'pending');
 assert.ok(fs.existsSync(service.status(f.project).archive));
 const count = f.calls.length;
 const restarted = new BeadsBackupService(options);await restarted.request(f.project);
 assert.equal(restarted.status(f.project).remote, 'pending');assert.equal(f.calls.length, count);
});
test('Fehlgeschlagene Wiederherstellung wird nie als erfolgreiche Sicherung gemeldet', async t => {
 const f = fixture(t);const service = new BeadsBackupService({ beads:f.beads,stateDirectory:f.root,execute:f.execute });
 service.verifyArchive = async () => { throw new Error('Wissen fehlt'); };
 await service.request(f.project);
 assert.equal(service.status(f.project).local,'error');assert.equal(service.status(f.project).archive,undefined);
});

test('NAS gilt erst nach Übertragung und bestätigter Prüfsumme als gesichert', async t => {
 const f = fixture(t); const remoteCalls = [];
 const execute = async (file,args) => {
  if (file === 'ssh' || file === 'scp') {remoteCalls.push({file,args});return 'OK';}
  return f.execute(file,args);
 };
 const service = new BeadsBackupService({beads:f.beads,stateDirectory:f.root,execute,nas:{host:'root@192.168.178.162',key:'/key',directory:'/DATA/AppData/beads'}});
 service.verifyArchive = async () => {};
 await service.request(f.project);
 const state = service.status(f.project);
 assert.equal(state.remote,'verified');assert.ok(state.remoteAt);
 assert.deepEqual(remoteCalls.map(c=>c.file),['ssh','scp','ssh']);
 assert.match(remoteCalls.at(-1).args.at(-1),/sha256sum -c .*\.sha256/);
 assert.ok(fs.readFileSync(`${state.archive}.sha256`,'utf8').startsWith(state.checksum));
});
