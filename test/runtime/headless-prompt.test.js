const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { prepareHeadlessPrompt, HEADLESS_AUTONOMY_INSTRUCTION } = require('../../runtime/headless-prompt');
const { HARNESS_REGISTRY } = require('../../runtime/registry');
const { runHarness } = require('../../runtime/harness-runtime');

test('Autonomie gilt nur für fachliche Entscheidungen und erhält den Originalkontext', () => {
  const prompt = '--help\nAGENTS.md: keine Netzwerkaufrufe. Nutzer: SQLite verwenden.\n"Zitat" $HOME `Befehl`';
  const prepared = prepareHeadlessPrompt(prompt);
  assert.ok(prepared.startsWith(HEADLESS_AUTONOMY_INSTRUCTION));
  assert.ok(prepared.endsWith(prompt));
  for (const pattern of [/keine Rückfragen oder Auswahlmenüs/, /Annahmen.*Ergebnis/, /Implementierung.*Tests/,
    /Explizite Nutzereinstellungen.*AGENTS\.md.*Vorrang/, /keine.*Berechtigungen/, /Sandbox.*nicht umgehen/,
    /kontrolliert.*Fehler/]) assert.match(HEADLESS_AUTONOMY_INSTRUCTION, pattern);
});

for (const [id, entry] of Object.entries(HARNESS_REGISTRY)) {
  test(`${id}: Runtime übergibt Autonomie und Auftrag ohne neue Rechte oder Adapterflags`, async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'headless-prompt-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const capture = path.join(root, 'args.json');
    fs.writeFileSync(path.join(root, entry.commands[0]), `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(capture)}, JSON.stringify(process.argv.slice(2))); console.error('Permission denied'); process.exit(1);\n`, { mode: 0o755 });
    const prompt = 'AGENTS.md: Dateien behalten. Auftrag: SQLite wählen.\n$HOME `Befehl`';
    const env = { HOME: root, PATH: `${root}:/usr/bin:/bin` };
    const execution = { codexUnsafe: false };
    const expected = require(`../../runtime/adapters/${id}`).build({ prompt: prepareHeadlessPrompt(prompt), model: 'Standard', cwd: root, env, execution, sessionId: null });
    const result = await runHarness({ harnessId: id, prompt, cwd: root, env, execution });
    assert.equal(result.status, 'failed');
    assert.equal(result.error.kind, 'permission');
    assert.equal(result.error.retryability, 'next_harness');
    assert.deepEqual(JSON.parse(fs.readFileSync(capture, 'utf8')), expected);
  });
}
