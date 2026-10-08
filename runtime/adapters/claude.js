module.exports = {
  build({ prompt, model, sessionId }) {
    const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits'];
    if (sessionId) args.push('--resume', sessionId);
    if (model && model !== 'Standard') args.push('--model', model);
    return args;
  },
  normalize(obj) {
    if (obj.type === 'system' && obj.subtype === 'init') return [{ type: 'start', sessionId: obj.session_id }];
    if (obj.type === 'result') return obj.is_error
      ? [{ type: 'error', message: obj.result || 'Claude-Lauf fehlgeschlagen' }]
      : [{ type: 'result', text: obj.result || '', sessionId: obj.session_id }];
    if (obj.type !== 'assistant' && obj.type !== 'user') return [];
    const blocks = obj.message?.content || [];
    return blocks.flatMap((block) => {
      if (block.type === 'text') return [{ type: 'text', text: block.text || '' }];
      if (block.type === 'thinking') return [{ type: 'thinking', text: block.thinking || '' }];
      if (block.type === 'tool_use') return [{ type: 'tool_start', name: block.name, input: block.input, id: block.id }];
      if (block.type === 'tool_result') return [{ type: 'tool_result', text: typeof block.content === 'string' ? block.content : JSON.stringify(block.content), id: block.tool_use_id }];
      return [];
    });
  }
};
