const test = require('node:test');
const assert = require('node:assert/strict');
const { HARNESS_REGISTRY, CLI_INSTALL_REGISTRY, normalizeRoutes } = require('../../runtime/registry');
const additions = { junie: 'junie', kilo: 'kilo', copilot: 'copilot', kiro: 'kiro-cli', vibe: 'vibe' };

for (const [id, command] of Object.entries(additions)) {
  test(`${id}: feste Registry, Headless und keine pauschale Berechtigungsfreigabe`, () => {
    const entry = HARNESS_REGISTRY[id];
    assert.ok(entry, id);
    assert.deepEqual(entry.commands, [command]);
    assert.ok(entry.dispatchable && entry.modelTest && entry.consensus && entry.scheduler);
    assert.match(CLI_INSTALL_REGISTRY[entry.installId].docsUrl, /^https:\/\//);
    assert.deepEqual(normalizeRoutes([{ harnessId: id, command: 'evil', model: 'Standard' }]),
      [{ harnessId: id, name: entry.name, model: 'Standard' }]);
    const adapter = require(`../../runtime/adapters/${id}`);
    const prompt = '--help\nAuftrag mit "Zitat", $HOME und `Befehl`';
    const args = adapter.build({ prompt, model: 'Standard', cwd: '/tmp/project' });
    assert.ok(args.includes(prompt) || args.includes(`--prompt=${prompt}`));
    for (const flag of ['--auto', '--allow-all', '--allow-all-tools', '--allow-all-paths', '--trust-all-tools', '--auto-approve', '--yolo', '--brave', '--trust']) {
      assert.ok(!args.includes(flag), `${id}: ${flag}`);
    }
    assert.ok(!args.includes('--model'));
  });
}

test('Vibe wählt das Modell über dokumentierte Prozessumgebung statt erfundenem Flag', () => {
  const adapter = require('../../runtime/adapters/vibe');
  assert.deepEqual(adapter.environment({ model: 'local-model' }), { VIBE_ACTIVE_MODEL: 'local-model' });
  assert.deepEqual(adapter.environment({ model: 'Standard' }), {});
});

test('Copilot ignoriert Textdeltas zugunsten vollständiger Nachrichten und erhält echte Tool-Codes', () => {
  const adapter = require('../../runtime/adapters/copilot');
  assert.deepEqual(adapter.normalize({ type: 'assistant.message_delta', data: { deltaContent: 'OK' } }), []);
  assert.equal(adapter.normalize({ type: 'assistant.message', data: { content: 'OK' } })[0].text, 'OK');
  assert.equal(adapter.normalize({ type: 'session.error', data: { message: 'quota exhausted' } })[0].type, 'error');
  assert.equal(adapter.normalize({ type: 'tool.execution_complete', data: { toolCallId: 't', success: true, result: { content: 'grün' } } })[0].exitCode, null);
});

test('Kilo liest tool_use und verschachtelte API-Fehler aus offiziellen Run-Ereignissen', () => {
  const adapter = require('../../runtime/adapters/kilo');
  assert.equal(adapter.normalize({ type: 'error', error: { name: 'APIError', data: { message: 'quota exceeded' } } })[0].message, 'quota exceeded');
  const events = adapter.normalize({ type: 'tool_use', part: { callID: 't', tool: 'bash', state: { status: 'completed', input: { command: 'npm test' }, output: 'grün', metadata: { exit: 0 } } } });
  assert.deepEqual(events.map(e => e.type), ['tool_start', 'tool_result']);
  assert.equal(events[1].exitCode, 0);
});

test('Kiro verarbeitet ACP-Nachrichten und verweigerte Werkzeugaufrufe', () => {
  const adapter = require('../../runtime/adapters/kiro');
  const update = update => ({ method: 'session/update', params: { sessionId: 's', update } });
  assert.equal(adapter.normalize(update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'OK' } })).find(e => e.type === 'text').text, 'OK');
  assert.ok(adapter.normalize(update({ sessionUpdate: 'tool_call_update', toolCallId: 't', status: 'failed', content: [{ type: 'content', content: { type: 'text', text: 'Permission denied' } }] })).some(e => e.type === 'error'));
});

test('Vibe liest aktuelle History-Einträge und verweigerte Freigaben ohne erfundene Exit-Codes', () => {
  const adapter = require('../../runtime/adapters/vibe');
  assert.equal(adapter.normalize({ type: 'message', role: 'assistant', content: [{ type: 'text', text: 'OK' }] })[0].text, 'OK');
  assert.deepEqual(adapter.normalize({ type: 'message', role: 'user', content: [{ type: 'text', text: 'Auftrag' }] }), []);
  const events = adapter.normalize({ type: 'effect', id: 't', title: 'bash', detail: { kind: 'shell', input: { command: 'npm test' } }, state: { status: 'completed', outputText: 'grün', output: {} } });
  assert.equal(events.find(e => e.type === 'tool_result').exitCode, null);
  assert.equal(adapter.normalize({ type: 'callback', detail: { kind: 'approval' }, state: { status: 'answered', output: { type: 'approval', decision: { type: 'deny' } } } })[0].type, 'error');
});

test('Kiro 2.28 Headless-Envelope aus echtem Modelltest einschließlich Abschluss', () => {
  const adapter = require('../../runtime/adapters/kiro');
  assert.equal(adapter.normalize({ type: 'sessionUpdate', data: { sessionId: 's', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'OK' } } } }).find(e => e.type === 'text').text, 'OK');
  assert.equal(adapter.normalize({ type: 'runFinished', data: { status: 'success', finalText: 'OK', sessionId: 's' } })[0].type, 'result');
  assert.equal(adapter.normalize({ type: 'runFinished', data: { status: 'interrupted', stopReason: 'cancelled' } })[0].type, 'error');
});

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runHarness } = require('../../runtime/harness-runtime');
for (const [id, command] of Object.entries(additions)) {
  test(`${id}: echte Kindprozesse behandeln fehlende Installation, leere Antwort und Fehler als Fallback`, async t => {
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'new-cli-runtime-'));
    t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    const env={HOME:root,PATH:`${root}:/usr/bin:/bin`};
    const options={harnessId:id,prompt:'Auftrag',cwd:root,env};
    assert.equal((await runHarness(options)).error.kind,'not_installed');
    const file=path.join(root,command);
    fs.writeFileSync(file,'#!/bin/sh\nexit 0\n',{mode:0o755});
    assert.equal((await runHarness(options)).status,'failed');
    fs.writeFileSync(file,"#!/bin/sh\necho 'quota exceeded' >&2\nexit 1\n",{mode:0o755});
    assert.equal((await runHarness(options)).error.kind,'quota');
    fs.writeFileSync(file,"#!/bin/sh\necho 'Authentication failed' >&2\nexit 0\n",{mode:0o755});
    assert.equal((await runHarness(options)).error.kind,'auth');
    if(id!=='junie'){
      fs.writeFileSync(file,"#!/bin/sh\necho 'Unknown event or text banner'\necho '{\"type\":\"unknown\"}'\n",{mode:0o755});
      const r=await runHarness(options); assert.equal(r.status,'failed'); assert.equal(r.finalText,'');
    }
  });
}


test('Copilot-Freigabefehler bleibt auch mit späterer Antwort ein Fehler',()=>{
 const adapter=require('../../runtime/adapters/copilot');
 assert.ok(adapter.normalize({type:'tool.execution_complete',data:{toolCallId:'t',success:false,error:{message:'Permission denied'}}}).some(e=>e.type==='error'));
});
