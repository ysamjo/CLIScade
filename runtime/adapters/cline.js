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
    if (event.type === 'content_start' && event.contentType === 'tool') return [{ type: 'tool_start', name: event.toolName, input: event.input, id: event.toolCallId }];
    if (event.type === 'content_end' && event.contentType === 'tool') return [{ type: 'tool_result', text: event.output || '', exitCode: Number.isInteger(event.exitCode) ? event.exitCode : null, id: event.toolCallId }];
    return [];
  }
};
