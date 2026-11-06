// Werkzeugergebnisse kommen als Blockliste (wie bei Claude Code), nicht als Zeichenkette.
function toolText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((part) => (typeof part === 'string' ? part : part?.text || '')).join('');
}

module.exports = {
  build({ prompt, model }) {
    // stream-json statt Text: die CLI puffert im Textmodus bis zum Ende, dann
    // sieht der Idle-Watchdog keinen Fortschritt und tötet lange Läufe.
    const args = ['-p', '-y', '--output-format', 'stream-json'];
    if (model && model !== 'Standard') args.push('--model', model);
    args.push(prompt);
    return args;
  },
  normalize(obj) {
    if (obj.type === 'system' && obj.subtype === 'init') return [{ type: 'start', sessionId: obj.session_id }];
    if (obj.type === 'result') return obj.is_error
      ? [{ type: 'error', message: obj.result || 'Codebuddy-Lauf fehlgeschlagen' }]
      : [{ type: 'result', text: obj.result || '', sessionId: obj.session_id }];
    if (obj.type !== 'assistant' && obj.type !== 'user') return [];
    const blocks = obj.message?.content || [];
    return blocks.flatMap((block) => {
      if (block.type === 'text') return [{ type: 'text', text: block.text || '' }];
      if (block.type === 'thinking') return [{ type: 'thinking', text: block.thinking || '' }];
      if (block.type === 'tool_use') return [{ type: 'tool_start', name: block.name, input: block.input, id: block.id }];
      if (block.type === 'tool_result') return [{ type: 'tool_result', text: toolText(block.content), exitCode: Number.isInteger(block.exit_code) ? block.exit_code : null, id: block.tool_use_id }];
      return [];
    });
  }
};
