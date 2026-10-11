const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyError } = require('../../runtime/errors');

test('Erfolgreiche Ausgabe mit Fehlerbegriffen bleibt erfolgreich', () => {
  assert.equal(classifyError({ raw: 'Die Dokumentation erwähnt HTTP 429 und Login.', exitCode: 0 }), null);
});

test('Explizite und fehlgeschlagene Fehler werden klassifiziert', () => {
  assert.equal(classifyError({ explicit: 'Authentication failed', exitCode: 0 }).kind, 'auth');
  assert.equal(classifyError({ raw: '429 Too Many Requests', exitCode: 1 }).kind, 'rate_limit');
  assert.equal(classifyError({ raw: 'Antwort', stderr: 'Authentication failed', exitCode: 0 }).kind, 'auth');
});

test('Neue CLI-Diagnosen unterscheiden Anmeldung, Kontingent, Kontext und Freigabe', () => {
  for (const [explicit, kind] of [
    ['Missing API key', 'auth'], ['Not logged in', 'auth'], ['Credits exhausted', 'quota'],
    ['Premium requests exhausted', 'quota'], ['context_too_long', 'context_limit'],
    ['Permission requested; auto-rejecting', 'permission'], ['Invalid model not found', 'model_unavailable']
  ]) {
    const result = classifyError({ explicit, exitCode: 0 });
    assert.equal(result.kind, kind, explicit);
    assert.equal(result.retryability, 'next_harness');
  }
});
