module.exports = {
  build({ prompt, model, sessionId, execution = {} }) {
    const args = ['exec'];
    if (sessionId) args.push('resume', sessionId);
    args.push('--json');
    if (execution.codexUnsafe === true) args.push('--dangerously-bypass-approvals-and-sandbox');
    else args.push('-c', 'sandbox_mode="workspace-write"', '-c', 'approval_policy="never"');
    if (model && model !== 'Standard') args.push('--model', model);
    args.push(prompt);
    return args;
  },
  normalize(obj) {
    if (obj.type === 'thread.started') return [{ type: 'start', sessionId: obj.thread_id }];
    if (obj.type === 'turn.failed' || obj.type === 'error') return [{ type: 'error', message: obj.error?.message || obj.message || 'Codex-Lauf fehlgeschlagen' }];
    if (obj.type === 'turn.completed') return [{ type: 'result', text: '' }];
    const item = obj.item;
    if (!item) return [];
    if (obj.type === 'item.completed' && item.type === 'agent_message') return [{ type: 'text', text: item.text || '' }];
    if (obj.type === 'item.completed' && item.type === 'reasoning') return [{ type: 'thinking', text: item.text || '' }];
    if (obj.type === 'item.started' && item.type === 'command_execution') return [{ type: 'tool_start', name: 'shell', input: { command: item.command }, id: item.id }];
    if (obj.type === 'item.completed' && item.type === 'command_execution') return [{ type: 'tool_result', text: item.aggregated_output || '', exitCode: Number.isInteger(item.exit_code) ? item.exit_code : null, id: item.id }];
    return [];
  }
};
