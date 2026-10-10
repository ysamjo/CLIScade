const test = require('node:test');
const assert = require('node:assert/strict');
const { HARNESS_REGISTRY, resolveHarness, normalizeRoutes } = require('../../runtime/registry');

test('Registry enthält genau die bekannten Harnesses, alle dispatchbar', () => {
  assert.equal(Object.keys(HARNESS_REGISTRY).length, 8);
  assert.ok(Object.values(HARNESS_REGISTRY).every((entry) => entry.transport === 'headless'));
  assert.ok(Object.values(HARNESS_REGISTRY).every((entry) => entry.dispatchable && entry.modelTest));
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
