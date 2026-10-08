const test = require('node:test');
const assert = require('node:assert/strict');
const { HARNESS_REGISTRY, resolveHarness, normalizeRoutes } = require('../../runtime/registry');

test('Registry enthält genau die bekannten Harnesses und nur Freebuff nutzt PTY', () => {
  assert.equal(Object.keys(HARNESS_REGISTRY).length, 9);
  assert.deepEqual(Object.values(HARNESS_REGISTRY).filter((entry) => entry.transport === 'pty').map((entry) => entry.id), ['freebuff']);
  assert.equal(HARNESS_REGISTRY.freebuff.dispatchable, false);
  assert.equal(HARNESS_REGISTRY.freebuff.modelTest, false);
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
  assert.deepEqual(normalizeRoutes([{ name: 'Terminal', harnessId: 'freebuff', enabled: true }]), [
    { name: 'Terminal', harnessId: 'freebuff', enabled: false }
  ]);
});
