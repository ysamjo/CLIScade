// Kiro muss als bereit erkannt werden, solange das eingetragene Binary läuft.
// Regression: hing `~/.local/bin/kiro-cli` als toter Symlink in der Luft (keine
// Kiro-App unter /Applications), meldete runHarness `not_installed`, obwohl die
// Route als dispatchbar galt.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runHarness } = require('../../runtime/harness-runtime');

test('Kiro-Route erkennt fehlendes Binary als not_installed statt leerem Fehler', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kiro-fehlend-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = { HOME: root, PATH: `${root}:/usr/bin:/bin` };
  const ergebnis = await runHarness({ harnessId: 'kiro', prompt: 'Auftrag', cwd: root, env });
  assert.equal(ergebnis.status, 'failed');
  assert.equal(ergebnis.error.kind, 'not_installed');
  assert.match(ergebnis.error.message, /Kiro CLI ist nicht installiert/);
});
