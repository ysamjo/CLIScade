// CLI 2.28: stream-json schreibt ACP-Ereignisse; V3 explizit auswählen.
module.exports = {
  build({ prompt, model }) {
    const args = ['chat', '--agent-engine', 'v3', '--no-interactive', '--output-format', 'stream-json', '--trust-all-tools'];
    if (model && model !== 'Standard') args.push('--model', model);
    args.push('--', prompt);
    return args;
  },
  normalize(obj) {
    if (!obj || typeof obj !== 'object') return [];
    if (obj.error) return [{ type: 'error', message: obj.error.message || 'Kiro-Lauf fehlgeschlagen' }];
    if (obj.type === 'runFinished') {
      const data = obj.data || {};
      if (data.status !== 'success') return [{ type: 'error', message: `${data.status || 'Kiro-Lauf fehlgeschlagen'}: ${data.stopReason || ''} ${data.error?.message || ''}`.trim() }];
      return [{ type: 'result', text: data.finalText || '', sessionId: data.sessionId }];
    }
    const params = obj.type === 'sessionUpdate' ? obj.data : obj.method === 'session/update' ? obj.params : obj;
    const update = params?.update || params;
    const events = params?.sessionId ? [{ type: 'start', sessionId: params.sessionId }] : [];
    if (update?.sessionUpdate === 'agent_message_chunk' && update.content?.type === 'text') events.push({ type: 'text', text: update.content.text });
    if (update?.sessionUpdate === 'agent_thought_chunk' && update.content?.type === 'text') events.push({ type: 'thinking', text: update.content.text });
    if (update?.sessionUpdate === 'tool_call') events.push({ type: 'tool_start', id: update.toolCallId, name: update.title, input: update.rawInput });
    if (update?.sessionUpdate === 'tool_call_update') {
      const text = (update.content || []).filter(part => part.type === 'content' && part.content?.type === 'text').map(part => part.content.text).join('\n')
        || update.rawOutput?.output || update.rawOutput?.message || '';
      const exitCode = Number.isInteger(update.rawOutput?.exitCode) ? update.rawOutput.exitCode : null;
      if (update.status === 'completed') events.push({ type: 'tool_result', id: update.toolCallId, text, exitCode });
      if (update.status === 'failed') events.push({ type: 'error', message: text || update.rawOutput?.message || 'Kiro-Werkzeug fehlgeschlagen oder Freigabe verweigert' });
    }
    return events;
  }
};
