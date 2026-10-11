// Kilo run JSON-Ereignisse: packages/opencode/src/cli/cmd/run.ts.
module.exports = {
  build({ prompt, model }) {
    const args = ['run', '--format', 'json', '--thinking'];
    if (model && model !== 'Standard') args.push('--model', model);
    args.push('--', prompt);
    return args;
  },
  normalize(obj) {
    if (!obj || typeof obj !== 'object') return [];
    if (obj.type === 'error') return [{ type: 'error', message: obj.error?.data?.message || obj.error?.message || obj.error?.name || obj.message || 'Kilo-Lauf fehlgeschlagen' }];
    const part = obj.part || {};
    const events = obj.sessionID ? [{ type: 'start', sessionId: obj.sessionID }] : [];
    if (obj.type === 'text') events.push({ type: 'text', text: part.text || '' });
    if (obj.type === 'reasoning') events.push({ type: 'thinking', text: part.text || '' });
    if (obj.type === 'tool_use') {
      const state = part.state || {};
      events.push({ type: 'tool_start', name: part.tool, input: state.input, id: part.callID });
      if (state.status === 'completed') events.push({ type: 'tool_result', text: state.output || '', id: part.callID, exitCode: Number.isInteger(state.metadata?.exit) ? state.metadata.exit : null });
      if (state.status === 'error') events.push({ type: 'warning', text: state.error || 'Werkzeug fehlgeschlagen' });
    }
    return events;
  }
};
