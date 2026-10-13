const test = require('node:test');
const assert = require('node:assert/strict');
const { HARNESS_REGISTRY, resolveHarness, normalizeRoutes } = require('../../runtime/registry');

test('Registry enthält genau die bekannten Harnesses, alle dispatchbar', () => {
  assert.equal(Object.keys(HARNESS_REGISTRY).length, 13);
  assert.ok(Object.values(HARNESS_REGISTRY).every((entry) => entry.transport === 'headless'));
  assert.ok(Object.values(HARNESS_REGISTRY).every((entry) => entry.dispatchable && entry.modelTest));
});

test('Kein Harness beansprucht ein doppeltes oder fremdes Executable', () => {
  const commands = Object.values(HARNESS_REGISTRY).flatMap((entry) => entry.commands);
  assert.equal(new Set(commands).size, commands.length, 'Executable-Namen müssen eindeutig sein');
  // `agent` gehört der Grok-CLI und steht im PATH vor Cursor; Cursor installiert ausschließlich `cursor-agent`.
  assert.deepEqual(HARNESS_REGISTRY.cursor.commands, ['cursor-agent']);
});

test('Konfigurationsrouten verwenden feste IDs und ignorieren frei gesetzte Executables', () => {
  assert.equal(resolveHarness({ command: 'codex' }).id, 'codex');
  assert.equal(resolveHarness({ harnessId: 'codex', command: 'evil' }).commands[0], 'codex');
  assert.equal(resolveHarness({ command: 'evil; touch /tmp/injected' }), null);
  assert.equal(resolveHarness({ command: 'cbc', harness: 'codebuddy' }).id, 'codebuddy');
  assert.deepEqual(normalizeRoutes([{ name: 'Codex', command: 'codex', enabled: true }]), [
    { name: 'Codex', harnessId: 'codex', enabled: true }
  ]);
  assert.throws(() => normalizeRoutes([{ name: 'Böse', command: 'evil' }]), /Unbekanntes Harness/);
});
