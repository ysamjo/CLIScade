// JSONL mit dem offiziellen Copilot-Session-Ereignisschema.
module.exports = {
  build({ prompt, model }) {
    const args = ['--output-format', 'json', '--no-ask-user'];
    if (model && model !== 'Standard') args.push('--model', model);
    args.push('-p', prompt);
    return args;
  },
  normalize(obj) {
    if (!obj || typeof obj !== 'object') return [];
    const data = obj.data || {};
    switch (obj.type) {
      case 'session.start': return [{ type: 'start', sessionId: data.sessionId }];
      // Keine Verdopplung durch *_delta plus vollständige Nachricht.
      case 'assistant.message': return [{ type: 'text', text: data.content || '' }];
      case 'assistant.reasoning': return [{ type: 'thinking', text: data.content || '' }];
      case 'tool.execution_start': return [{ type: 'tool_start', id: data.toolCallId, name: data.toolName, input: data.arguments }];
      case 'tool.execution_complete': {
        const message = data.error?.message || '';
        const events = [{ type: 'tool_result', id: data.toolCallId, text: data.result?.content || message, exitCode: null }];
        if (data.success === false && /permission|denied|approval/i.test(message)) events.push({ type: 'error', message });
        return events;
      }
      case 'session.error': return [{ type: 'error', message: `${data.errorType || ''} ${data.statusCode || ''} ${data.message || 'Copilot-Lauf fehlgeschlagen'}`.trim() }];
      case 'session.idle': return data.aborted ? [{ type: 'error', message: 'Copilot-Session wurde unterbrochen' }] : [];
      default: return [];
    }
  }
};
