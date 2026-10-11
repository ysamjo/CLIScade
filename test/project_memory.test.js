const test = require('node:test');
const assert = require('node:assert/strict');
const { extractReport, memoryEntries, recordToolEvidence, selectMemories } = require('../services/project-memory');
const { buildContext } = require('../services/context-service');

test('Projektwissen ist strukturiert, wiederholbar und niemals durch Agententext bestätigt', () => {
 const record = { id: 'task-1', projectPath: '/projekt', status: 'completed', checkpoint: { revision: 'abc' }, resultText: '```project-memory\n'+JSON.stringify({ decisions: [{ key: 'storage', text: 'SQLite bleibt die Quelle' }], openSteps: ['Migration prüfen'], checks: [{ command: 'npm test', exitCode: 0 }] })+'\n```' };
 const report = extractReport(record.resultText);
 assert.equal(report.decisions.length, 1);
 const entries = memoryEntries(record);
 assert.equal(entries[0].verified, false);
 assert.equal(entries[0].source.taskId, 'task-1');
 assert.equal(entries[0].source.revision, 'abc');
 assert.equal(entries[0].key, memoryEntries({ ...record, id: 'task-2' })[0].key);
 assert.equal(entries.length, 2);
 assert.equal(extractReport('Erledigt, Tests grün').checks.length, 0);
 assert.equal(memoryEntries({ ...record, resultText: '```project-memory\n{"decisions":[{"text":"API_KEY=geheim"}]}\n```' }).length, 0);
});

test('Prüfbelege stammen aus zugeordneten Werkzeugereignissen mit Exit-Code und Git-Stand', () => {
 const record = {}; const pending = new Map();
 recordToolEvidence(record, pending, { type: 'tool_start', id: 'a', input: { command: 'npm test' }, at: 1000 }, { revision: 'abc', changes: 'M app.js' }, 'attempt-1');
 recordToolEvidence(record, pending, { type: 'tool_result', id: 'a', text: '2 passed', exitCode: 0, at: 2000 }, {}, 'attempt-1');
 assert.equal(record.checks[0].verified, true);
 assert.equal(record.checks[0].exitCode, 0);
 assert.equal(record.checks[0].revision, 'abc');
 assert.equal(record.checks[0].attemptId, 'attempt-1');
 recordToolEvidence(record, pending, { type: 'tool_start', id: 'b', input: { command: 'pytest' }, at: 3000 }, { revision: 'def' }, 'attempt-1');
 recordToolEvidence(record, pending, { type: 'tool_result', id: 'b', text: 'Tests grün', at: 4000 }, {}, 'attempt-1');
 assert.equal(record.checks[1].verified, false);
 assert.equal(record.checks[1].exitCode, null);
 recordToolEvidence(record,pending,{type:'tool_start',id:'c',input:{command:'npm test'}},{revision:'abc'},'attempt-1');
 recordToolEvidence(record,pending,{type:'tool_result',id:'c',exitCode:0},{},'attempt-2');
 assert.equal(record.checks.length,2);
 recordToolEvidence(record,pending,{type:'tool_start',input:{command:'npm test'}},{},'attempt-1');
 recordToolEvidence(record,pending,{type:'tool_result',exitCode:0},{},'attempt-1');
 assert.equal(record.checks.length,2);
});

test('Relevanter Kontext erhält ganze Erinnerungen und ein gemeinsames Budget', () => {
 const memories = [{ key: 'unrelated', text: 'Farben im Dashboard', updatedAt: '2020-01-01' }, { key: 'sqlite', text: 'SQLite Migration erhalten', updatedAt: '2026-10-11' }];
 const selected = selectMemories(memories, 'SQLite Migration reparieren', 100);
 assert.equal(selected.items[0].key, 'sqlite');
 const text = buildContext({ rules: 'REGEL', prompt: 'AUFTRAG', beadsContext: { prime: 'WORKFLOW', memories: selected.items, ready: [], availableTasks: 0 }, budget: 4000 });
 assert.ok(text.length <= 4000);
 assert.match(text, /REGEL/); assert.match(text, /AUFTRAG/); assert.match(text, /SQLite Migration erhalten/);
 assert.throws(() => buildContext({ rules: 'x'.repeat(5000), prompt: 'y', budget: 4000 }), /Kontext.*lang/);
});

test('Beads speichert stabil nach Schlüssel, aktualisiert Fakten und stuft Belege nicht herab', async t => {
 const fs = require('node:fs');const os = require('node:os');const path = require('node:path');
 const { BeadsAdapter } = require('../services/beads-adapter');
 const dir = fs.mkdtempSync(path.join(os.tmpdir(),'learning-test-'));fs.mkdirSync(path.join(dir,'.beads'));
 t.after(() => fs.rmSync(dir,{recursive:true,force:true}));
 const memories = {}; let writes = 0;
 const adapter = new BeadsAdapter({execute: async (cwd,args) => {
  if (args[0] === 'memories') return JSON.stringify(memories);
  if (args[0] === 'remember') { memories[args[3]] = args[1]; writes++;return 'gespeichert'; }
  throw new Error('Unerwarteter Befehl');
 }});
 const record = {id:'a',status:'completed',checkpoint:{revision:'abc'},resultText:'```project-memory\n{"decisions":[{"key":"storage","text":"SQLite ist Quelle"}]}\n```'};
 await adapter.learn(dir,record);assert.equal(writes,1);
 await adapter.learn(dir,{...record,id:'b'});assert.equal(writes,1);
 await adapter.learn(dir,{...record,resultText:record.resultText.replace('SQLite ist Quelle','SQLite bleibt Quelle')});assert.equal(writes,2);
 assert.equal((await adapter.memories(dir))[0].text,'SQLite bleibt Quelle');
 const key = Object.keys(memories)[0]; const confirmed = JSON.parse(memories[key]);confirmed.verified = true;memories[key] = JSON.stringify(confirmed);
 await adapter.learn(dir,{...record,resultText:record.resultText.replace('SQLite ist Quelle','Andere unbestätigte Aussage')});
 assert.equal(writes,2);assert.equal((await adapter.memories(dir))[0].verified,true);
});


test('Fortsetzung ersetzt offene Punkte; ausdrücklich leere Liste bleibt leer', () => {
 const { checkpoint } = require('../services/context-service');
 const record = {id:'a',memoryThreadId:'original',status:'completed',resultText:'```project-memory\n{"openSteps":["Migration prüfen"]}\n```'};
 const prior = memoryEntries(record)[0];
 const completed = {...record,id:'b',resultText:'```project-memory\n{"openSteps":[]}\n```'};
 assert.equal(memoryEntries(completed)[0].key,prior.key);
 assert.match(memoryEntries(completed)[0].text,/keine offenen Punkte/);
 assert.deepEqual(checkpoint(completed,'abc','').openSteps,[]);
});
