// Echter Server und Kindprozesse, ausschließlich Stub-CLIs im eigenen HOME/PATH.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const net = require('node:net');
const WebSocket = require('ws');
const { HARNESS_REGISTRY } = require('../runtime/registry');
const ids = ['junie', 'kilo', 'copilot', 'kiro', 'vibe'];
let root, bin, project, server, base, log = '';
const response = id => id === 'junie' ? 'OK\n' : JSON.stringify({
  kilo: { type: 'text', sessionID: 'kilo-test', part: { text: 'OK' } },
  copilot: { type: 'assistant.message', data: { content: 'OK' } },
  kiro: { type: 'runFinished', data: { status: 'success', finalText: 'OK', sessionId: 'kiro-test' } },
  vibe: { type: 'message', role: 'assistant', content: [{ type: 'text', text: 'OK' }] }
}[id])+'\n';
function stub(id, mode = 'ok') {
  const command = HARNESS_REGISTRY[id].commands[0];
  fs.writeFileSync(path.join(bin, command), `#!${process.execPath}\n` + `
const fs=require('node:fs');
const args=process.argv.slice(2);
if(args.includes('--version')){console.log('test-1.0');process.exit(0);}
fs.appendFileSync(${JSON.stringify(path.join(root,'calls.jsonl'))},JSON.stringify({id:${JSON.stringify(id)},args,cwd:process.cwd(),model:process.env.VIBE_ACTIVE_MODEL})+'\\n');
${mode === 'layers' ? `process.stdout.write(${JSON.stringify([{type:'reasoning',part:{text:'Gedanke eins\nGedanke zwei'}},{type:'tool_use',part:{tool:'shell',callID:'test-tool',state:{status:'completed',output:'Ergebnis eins\nErgebnis zwei',metadata:{exit:0}}}},{type:'text',part:{text:'FERTIGE_ANTWORT'}}].map(JSON.stringify).join('\n')+'\n')});` : mode === 'quota' ? "console.error('quota exceeded');process.exit(1);" : `process.stdout.write(${JSON.stringify(response(id))});`}
`, { mode: 0o755 });
}
async function api(url, body) {
  const r = await fetch(base + url, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json();
  assert.equal(r.status, 200, JSON.stringify(data));
  return data;
}
function dispatch(prompt) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(base.replace('http:', 'ws:'));
    const messages = [];
    const timer = setTimeout(() => { ws.close(); reject(new Error(log)); }, 15000);
    ws.on('error', e => { clearTimeout(timer); reject(e); });
    ws.on('open', () => ws.send(JSON.stringify({ type: 'dispatch', projectPath: project, prompt, withoutBeads: true })));
    ws.on('message', raw => {
      const m = JSON.parse(raw); messages.push(m);
      if (['done', 'error', 'cancelled'].includes(m.type)) { clearTimeout(timer); ws.close(); resolve(messages); }
    });
  });
}
test.before(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cliscade-new-clis-'));
  bin=path.join(root,'bin'); project=path.join(root,'project');
  [bin,project,path.join(root,'.harness-dispatch')].forEach(p=>fs.mkdirSync(p,{recursive:true}));
  fs.writeFileSync(path.join(root,'.harness-dispatch','studio-tasks.json'),JSON.stringify({rootDirectory:root,tasks:[]}));
  fs.writeFileSync(path.join(project,'AGENTS.md'),'PROJEKTREGEL_NEUE_CLIS');
  fs.writeFileSync(path.join(bin,'shell'), '#!/bin/sh\necho PATH=/usr/bin:/bin\n',{mode:0o755});
  for (const id of ids) stub(id);
  // Kaskadenabschluss durch bestehendes Harness belegt Rückwärtskompatibilität.
  fs.writeFileSync(path.join(bin,'codebuddy'),'#!/bin/sh\necho BESTEHENDES_HARNESS_OK\n',{mode:0o755});
  const port = await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
  base=`http://127.0.0.1:${port}`;
  server=spawn(process.execPath,['server.js'],{cwd:path.join(__dirname,'..'),env:{HOME:root,PATH:`${bin}:/usr/bin:/bin`,SHELL:path.join(bin,'shell'),HOST:'127.0.0.1',PORT:String(port),HARNESS_BEADS_BACKUPS:'0'},stdio:['ignore','pipe','pipe']});
  server.stdout.on('data',c=>{log+=c}); server.stderr.on('data',c=>{log+=c});
  for(let n=0;n<100;n++){try{await api('/api/status');return;}catch{await new Promise(r=>setTimeout(r,50));}}
  throw new Error(log);
});
test.after(async () => {
  if(server && server.exitCode === null){await new Promise(resolve=>{server.once('exit',resolve);server.kill('SIGTERM');});}
  if(root)fs.rmSync(root,{recursive:true,force:true});
});

test('Install-/Detect-/Modell-Endpunkte enthalten alle fünf und erhalten bestehende Harnesses',async()=>{
  const status=await api('/api/status');
  assert.equal(status.harnesses.length,13);
  const installer=await api('/api/installer/status?refresh=true');
  assert.equal(installer.total,13);
  const presets=await api('/api/model-presets');
  for(const id of ids){
    const info=installer.tools.find(t=>t.id===`${id}_cli`);
    assert.ok(info.available && info.installCmd && info.limitations);
    assert.ok(status.harnesses.find(h=>h.id===id));
    assert.ok((presets[id] || presets.models?.[id])?.some(m=>m.id==='Standard'));
    const result=await api('/api/harness/test',{harnessId:id,model:id==='vibe'?'configured-alias':'test-model'});
    assert.ok(result.ok,JSON.stringify(result)); assert.equal(result.sample,'OK');
  }
  const calls=fs.readFileSync(path.join(root,'calls.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
  for(const c of calls){assert.match(c.cwd,/harness-modeltest-/);assert.ok(!fs.existsSync(c.cwd));}
  assert.equal(calls.find(c=>c.id==='vibe').model,'configured-alias');
});

test('Konfiguration persistiert alle fünf; jeder Dispatcher erhält Regeln und vollständigen Auftrag',async()=>{
  for(const id of ids){
    await api('/api/config',{clis:[{harnessId:id,name:id,enabled:true,model:'Standard'}]});
    assert.equal((await api('/api/config')).clis[0].harnessId,id);
    const messages=await dispatch(`AUFTRAG_${id}`);
    assert.equal(messages.at(-1).type,'done',JSON.stringify(messages));
    const calls=fs.readFileSync(path.join(root,'calls.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
    const args=calls.at(-1).args.join('\n');
    assert.match(args,/PROJEKTREGEL_NEUE_CLIS/); assert.ok(args.includes(`AUFTRAG_${id}`));
  }
});

test('Strukturierte Denk- und Werkzeugausgaben bleiben mehrzeilig im passenden Konsolenbereich',async()=>{
  stub('kilo','layers');
  await api('/api/config',{clis:[{harnessId:'kilo',name:'Kilo',enabled:true}]});
  const messages=await dispatch('SCHICHTEN_TEST');
  assert.equal(messages.at(-1).type,'done');
  const output=messages.filter(m=>m.type==='output').map(m=>m.html).join('');
  assert.match(output,/<div data-console-layer="denke">[\s\S]*Gedanke zwei[\s\S]*<\/div>/);
  assert.match(output,/<div data-console-layer="werkzeug">Werkzeug: shell/);
  assert.match(output,/<div data-console-layer="werkzeug">[\s\S]*Ergebnis zwei[\s\S]*<\/div>/);
  assert.match(output,/FERTIGE_ANTWORT/);
});

test('Quota-Kaskade wechselt durch alle fünf zum bestehenden Harness ohne Kontextverlust',async()=>{
  for(const id of ids)stub(id,'quota');
  await api('/api/config',{clis:[...ids,'codebuddy'].map(id=>({harnessId:id,name:id,enabled:true}))});
  const messages=await dispatch('AUFTRAG_FALLBACK');
  assert.deepEqual(messages.filter(m=>m.type==='route_selected').map(m=>m.harness),[...ids,'codebuddy']);
  assert.equal(messages.at(-1).type,'done');
  const calls=fs.readFileSync(path.join(root,'calls.jsonl'),'utf8').trim().split('\n').map(JSON.parse).slice(-5);
  for(const call of calls){assert.match(call.args.join('\n'),/PROJEKTREGEL_NEUE_CLIS/);assert.match(call.args.join('\n'),/AUFTRAG_FALLBACK/);}
});
