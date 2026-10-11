const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const { createDispatchService } = require('../services/dispatch-service');

test('Abschluss und Projektfreigabe warten auf genau eine Wissensspeicherung', async t => {
 const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-finalization-'));
 t.after(() => fs.rmSync(directory, {recursive:true, force:true}));
 const records = new Map(); const messages = []; let finalizations = 0; let release;
 const gate = new Promise(resolve => {release = resolve;});
 let service;
 service = createDispatchService({
  loadConfig: () => ({clis:[{name:'Route',command:'qodercli',harnessId:'qoder',capabilities:{dispatchable:true}}]}),
  loadTasksData: () => ({rootDirectory:directory}), DEFAULT_ROOT_DIR:directory,
  taskStore: {put: r => records.set(r.id,r),get: id => records.get(id),findRequest: () => null},
  buildAgentsContext: () => ({agentsSources:[]}), broadcastToClients: m => messages.push(m),
  prepareAttachment: () => {}, prepareBead: async () => {}, saveCheckpoint: () => {},
  runDispatch: entry => {
   entry.record.status = 'completed';
   service.sendRunMessage(null,entry.taskId,{type:'done'});
   entry.finish(null,entry.record); entry.finish(null,entry.record);
  },
  finalizeTask: async entry => {finalizations++;await gate;entry.record.memoryStatus = {saved:1};}
 });
 const first = service.submitDispatch({projectPath:directory,prompt:'Erster Auftrag'},null);
 const second = service.submitDispatch({projectPath:directory,prompt:'Nächster Auftrag'},null);
 await new Promise(resolve => setImmediate(resolve));
 assert.equal(messages.filter(m => m.type === 'done').length,0);
 assert.equal(finalizations,1);assert.ok(service.liveRuns.has(first.taskId));
 assert.equal(service.dispatchQueue[0].taskId,second.taskId);
 release();await first.finalizing;await new Promise(resolve => setImmediate(resolve));
 assert.equal(records.get(first.taskId).memoryStatus.saved,1);
 assert.equal(messages.filter(m => m.type === 'done' && m.taskId === first.taskId).length,1);
 assert.equal(finalizations,2);
 await second.finalizing;
});
