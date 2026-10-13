const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Codex nutzt Sandbox als Standard und braucht ausdrückliche Freigabe', () => {
  const adapter = require('../../runtime/adapters/codex');
  const safe = adapter.build({ prompt: 'Aufgabe' });
  assert.ok(safe.includes('sandbox_mode="workspace-write"'));
  assert.ok(!safe.includes('--dangerously-bypass-approvals-and-sandbox'));
  assert.ok(adapter.build({ prompt: 'Aufgabe', execution: { codexUnsafe: true } }).includes('--dangerously-bypass-approvals-and-sandbox'));
});

test('Codebuddy gibt Live-Ereignisse aus statt eines gepufferten Blocks', () => {
  const adapter = require('../../runtime/adapters/codebuddy');
  const args = adapter.build({ prompt: 'Aufgabe', model: 'deepseek-v4.1-flash' });
  assert.ok(args.includes('--output-format') && args.includes('stream-json'),
    'ohne stream-json puffert die CLI bis zum Ende und der Idle-Watchdog tötet lange Läufe');
  assert.ok(args.includes('--model') && args.includes('deepseek-v4.1-flash'));
  assert.equal(args.at(-1), 'Aufgabe');
  // Werkzeugergebnis kommt als Blockliste; sie muss lesbar werden, ohne einen Exit-Code zu erfinden.
  const [toolResult] = adapter.normalize({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: [{ type: 'text', text: 'GEHEIM-42' }] }] } });
  assert.equal(toolResult.type, 'tool_result');
  assert.equal(toolResult.text, 'GEHEIM-42');
  assert.equal(toolResult.exitCode, null);
});

for (const id of ['claude', 'codebuddy', 'codex', 'cline', 'opencode']) {
  test(`${id} normalisiert strukturierte Text-, Tool- und Session-Ereignisse`, () => {
    const adapter = require(`../../runtime/adapters/${id}`);
    const fixture = fs.readFileSync(path.join(__dirname, '..', 'fixtures', id, 'stream.ndjson'), 'utf8');
    const events = fixture.trim().split('\n').flatMap((line) => adapter.normalize(JSON.parse(line)));
    for (const type of ['start', 'text', 'thinking', 'tool_start', 'tool_result']) {
      assert.ok(events.some((event) => event.type === type), `${id}: ${type} fehlt`);
    }
    assert.ok(events.some((event) => event.type === 'text' && event.text === 'Antwort'));
  });
}

test('strukturierte Fehler werden von allen vier Adaptern erfasst', () => {
  const failures = {
    claude: { type: 'result', is_error: true, result: 'Authentication failed' },
    codebuddy: { type: 'result', is_error: true, result: 'Authentication failed' },
    codex: { type: 'turn.failed', error: { message: 'Authentication failed' } },
    cline: { type: 'run_result', finishReason: 'error', text: 'Authentication failed' },
    opencode: { type: 'error', error: { message: 'Authentication failed' } }
  };
  for (const [id, payload] of Object.entries(failures)) {
    const event = require(`../../runtime/adapters/${id}`).normalize(payload)[0];
    assert.equal(event.type, 'error');
    assert.match(event.message, /Authentication/);
  }
});


test('Tool-Exit-Codes bleiben strukturiert; fehlende Codes werden nicht aus Text erraten', () => {
 const cases = {
  codex: exit => ({type:'item.completed',item:{type:'command_execution',id:'tool',aggregated_output:'Tests grün',exit_code:exit}}),
  claude: exit => ({type:'user',message:{content:[{type:'tool_result',tool_use_id:'tool',content:'Tests grün',exit_code:exit}]}}),
  cline: exit => ({type:'agent_event',event:{type:'content_end',contentType:'tool',toolCallId:'tool',output:'Tests grün',exitCode:exit}}),
  opencode: exit => ({type:'tool',part:{type:'tool',callID:'tool',state:{status:'completed',output:'Tests grün',metadata:{exit}}}})
 };
 for (const [id,payload] of Object.entries(cases)) {
  const adapter = require(`../../runtime/adapters/${id}`);
  assert.equal(adapter.normalize(payload(0))[0].exitCode,0);
  assert.equal(adapter.normalize(payload(2))[0].exitCode,2);
  assert.equal(adapter.normalize(payload(undefined))[0].exitCode,null);
 }
});
