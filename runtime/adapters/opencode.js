module.exports = {
  build({ prompt, model, sessionId }) {
    const args = ['run', '--format', 'json', '--thinking', '--auto'];
    if (model && model !== 'Standard') args.push('--model', model);
    if (sessionId) args.push('--session', sessionId);
    if (prompt.startsWith('-')) args.push('--');
    args.push(prompt);
    return args;
  },
  normalize(obj) {
    if (obj.type === 'session') return [{ type: 'start', sessionId: obj.sessionID || obj.sessionId }];
    if (obj.type === 'error') return [{ type: 'error', message: obj.error?.message || obj.message || 'OpenCode-Lauf fehlgeschlagen' }];
    const part = obj.part || {};
    if (obj.sessionID && obj.type === 'step_start') return [{ type: 'start', sessionId: obj.sessionID }];
    if (obj.type === 'text' || part.type === 'text') return [{ type: 'text', text: part.text || obj.text || '' }];
    if (obj.type === 'reasoning' || part.type === 'reasoning') return [{ type: 'thinking', text: part.text || obj.text || '' }];
    if (obj.type === 'tool' || part.type === 'tool') {
      const state = part.state || obj.state || {};
      return state.status === 'completed'
        ? [{ type: 'tool_result', text: state.output || '', exitCode: Number.isInteger(state.metadata?.exit) ? state.metadata.exit : null, id: part.callID }]
        : [{ type: 'tool_start', name: part.tool || obj.tool, input: state.input, id: part.callID }];
    }
    return [];
  }
};
