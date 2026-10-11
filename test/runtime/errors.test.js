const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyError } = require('../../runtime/errors');

test('Erfolgreiche Ausgabe mit Fehlerbegriffen bleibt erfolgreich', () => {
  assert.equal(classifyError({ raw: 'Die Dokumentation erwähnt HTTP 429 und Login.', exitCode: 0 }), null);
  assert.equal(classifyError({ raw: 'Keine Rückfragen: Please select [1/2] ist ein Beispiel.\nPermission denied wurde im Test erwartet.', exitCode: 0 }), null);
});

test('Explizite Interaktionsverweigerung wird auch bei Exit 0 als Fallback behandelt', () => {
  for (const raw of ['Interactive mode is required', 'Error: Cannot prompt in non-interactive mode', '\u001b[31mError: stdin is not a TTY\u001b[0m']) {
    const error = classifyError({ raw, exitCode: 0 });
    assert.equal(error.kind, 'interactive_required');
    assert.equal(error.retryability, 'next_harness');
  }
  assert.equal(classifyError({ explicit: 'Interactive mode is required', exitCode: 1, reason: 'cancelled' }).kind, 'cancelled');
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
