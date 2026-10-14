// Jedes Ereignis geht durch canonicalEvent. Wenn ein Adapter ein Objekt als Text
// durchreicht, macht die Konsole daraus "[object Object]" und der Inhalt ist weg.
// cline hat genau das getan: sein Werkzeugergebnis ist eine Liste von Aufrufen.
//
// Aufruf:  node --test test/runtime/events.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const { canonicalEvent } = require('../../runtime/events');

test('kein Adapter kann ein Objekt als Text durchreichen', () => {
  const ergebnis = canonicalEvent({ type: 'tool_result', text: { query: 'ls', result: 'a' } }, 'test');
  assert.equal(typeof ergebnis.text, 'string');
  assert.ok(!/\[object Object\]/.test(ergebnis.text), ergebnis.text);
  assert.match(ergebnis.text, /"result":"a"/, 'der Inhalt überlebt als JSON statt als Platzhalter');

  const fehler = canonicalEvent({ type: 'error', message: { code: 5, message: 'kaputt' } }, 'test');
  assert.equal(typeof fehler.message, 'string');
  assert.match(fehler.message, /kaputt/);
});

test('Text bleibt Text und unbekannte Typen fallen weiter heraus', () => {
  assert.equal(canonicalEvent({ type: 'text', text: 'Hallo' }, 'test').text, 'Hallo');
  // Ein fehlendes Feld wird nicht erfunden — die Konsole liest mit `|| ''`.
  assert.equal(canonicalEvent({ type: 'text' }, 'test').text, undefined);
  assert.equal(canonicalEvent({ type: 'quatsch', text: 'x' }, 'test'), null);
  assert.equal(canonicalEvent(null, 'test'), null);
  assert.equal(canonicalEvent({ type: 'start', sessionId: 's1' }, 'test').sessionId, 's1');
});

test('die Optionen einer Auswahlabfrage kommen in einer Form an', () => {
  // Die Oberfläche baut daraus Knöpfe und darf nicht raten müssen, welche CLI
  // gerade Zeichenketten und welche Objekte schickt.
  const frage = canonicalEvent({ type: 'question', question: 'Was soll ich bauen?',
    options: [{ label: 'A', description: 'klein' }, 'B', { label: 'C' }, null, ''] }, 'test');
  assert.deepEqual(frage.options, [
    { label: 'A', description: 'klein' },
    { label: 'B', description: '' },
    { label: 'C', description: '' }
  ]);
  assert.equal(frage.question, 'Was soll ich bauen?');
  // Fehlende oder falsche Optionen werden zu einer leeren Liste, nicht zu Text.
  assert.deepEqual(canonicalEvent({ type: 'question', question: 'X' }, 'test').options, []);
  assert.deepEqual(canonicalEvent({ type: 'question', question: 'X', options: 'A,B' }, 'test').options, []);
  // Eine Frage ohne Text bleibt lesbar statt "[object Object]".
  assert.equal(canonicalEvent({ type: 'question', question: { text: 'X' } }, 'test').question, '{"text":"X"}');
});
