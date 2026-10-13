// Kilo run JSON-Ereignisse: packages/opencode/src/cli/cmd/run.ts.
module.exports = {
  build({ prompt, model }) {
    const args = ['run', '--format', 'json', '--thinking', '--auto'];
    if (model && model !== 'Standard') args.push('--model', model);
    args.push('--', prompt);
    return args;
  },
  normalize(obj) {
    if (!obj || typeof obj !== 'object') return [];
    if (obj.type === 'error') return [{ type: 'error', message: obj.error?.data?.message || obj.error?.message || obj.error?.name || obj.message || 'Kilo-Lauf fehlgeschlagen' }];
    const part = obj.part || {};
    const events = obj.sessionID ? [{ type: 'start', sessionId: obj.sessionID }] : [];
    if (obj.type === 'text' || part.type === 'text') events.push({ type: 'text', text: part.text || obj.text || '' });
    if (obj.type === 'reasoning' || part.type === 'reasoning') events.push({ type: 'thinking', text: part.text || obj.text || '' });
    if (obj.type === 'tool_use' || obj.type === 'tool' || part.type === 'tool') {
      const state = part.state || obj.state || {};
      const callID = part.callID || obj.callID || part.id || obj.id;
      const toolName = part.tool || obj.tool || state.title || 'tool';
      events.push({ type: 'tool_start', name: toolName, input: state.input, id: callID });
      if (state.status === 'completed') events.push({ type: 'tool_result', text: state.output || '', id: callID, exitCode: Number.isInteger(state.metadata?.exit) ? state.metadata.exit : null });
      if (state.status === 'error') events.push({ type: 'warning', text: state.error || 'Werkzeug fehlgeschlagen' });
    }
    return events;
  }
};
