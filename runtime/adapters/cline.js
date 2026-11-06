// cline schickt das Werkzeugergebnis nicht als Text, sondern als Aufruf: entweder
// ein einzelnes Objekt oder eine Liste davon, jeweils {query, result, success}.
// Ein blankes String() darauf macht aus jedem Ergebnis "[object Object]" — und weil
// cline das bei *jedem* Werkzeugaufruf tut, stand in der Konsole nie eine Ausgabe.
function ergebnisText(output) {
  if (typeof output === 'string') return output;
  if (output == null) return '';
  const aufrufe = Array.isArray(output) ? output : [output];
  return aufrufe.map((aufruf) => {
    if (aufruf == null) return '';
    if (typeof aufruf !== 'object') return String(aufruf);
    // Der Aufruf steht über seiner Ausgabe: sonst ist nicht zu erkennen, welcher
    // Befehl zu welchem Ergebnis gehört.
    const kopf = aufruf.query == null ? '' : String(aufruf.query);
    const rumpf = aufruf.result == null ? '' : String(aufruf.result);
    return [kopf, rumpf].filter((teil) => teil !== '').join('\n');
  }).filter((teil) => teil !== '').join('\n\n');
}

module.exports = {
  build({ prompt, model }) {
    const args = [prompt && !/\s/.test(prompt) ? `${prompt}\n` : prompt, '--json', '--auto-approve', 'true'];
    if (model && model !== 'Standard') args.push('--model', model);
    return args;
  },
  normalize(obj) {
    if (obj.type === 'hook_event' && obj.hookEventName === 'agent_start') return [{ type: 'start', sessionId: obj.taskId }];
    if (obj.type === 'run_result') return obj.finishReason === 'error'
      ? [{ type: 'error', message: obj.text || 'Cline-Lauf fehlgeschlagen' }]
      : [{ type: 'result', text: obj.text || '' }];
    if (obj.type !== 'agent_event') return [];
    const event = obj.event || {};
    if (event.type === 'error') return [{ type: 'error', message: event.message || 'Cline-Lauf fehlgeschlagen' }];
    if (event.type === 'content_end' && event.contentType === 'text') return [{ type: 'text', text: event.text || '' }];
    if (event.type === 'content_end' && ['reasoning', 'thinking'].includes(event.contentType)) return [{ type: 'thinking', text: event.text || '' }];
    if (event.type === 'content_start' && event.contentType === 'tool' && event.toolName === 'ask_question') {
      // Kein Werkzeugergebnis, sondern eine Frage an den Nutzer: sie wird als solche
      // dargestellt und nicht als Textzeile zwischen zwei Werkzeugkästen begraben.
      const frage = event.input && event.input.question;
      if (frage) return [{ type: 'question', question: frage, options: event.input.options || [] }];
    }
    if (event.type === 'content_start' && event.contentType === 'tool') return [{ type: 'tool_start', name: event.toolName, input: event.input, id: event.toolCallId }];
    if (event.type === 'content_end' && event.contentType === 'tool') return [{ type: 'tool_result', text: ergebnisText(event.output), exitCode: Number.isInteger(event.exitCode) ? event.exitCode : null, id: event.toolCallId }];
    return [];
  }
};
