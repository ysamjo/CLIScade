// Kein --model: VIBE_ACTIVE_MODEL ist die offizielle Konfigurationsüberschreibung.
module.exports = {
  build({ prompt }) { return ['--output', 'streaming', `--prompt=${prompt}`]; },
  environment({ model }) { return model && model !== 'Standard' ? { VIBE_ACTIVE_MODEL: model } : {}; },
  normalize(obj) {
    if (!obj || typeof obj !== 'object') return [];
    // Aktuelle PublicHistoryEntry-Nachrichten (camelCase) sowie Legacy-Message.
    if (obj.role === 'assistant') return [{ type: 'text', text: typeof obj.content === 'string' ? obj.content : (obj.content || []).filter(part => part.type === 'text').map(part => part.text).join('\n\n') }];
    if (obj.type === 'reasoning') return [{ type: 'thinking', text: obj.text || '' }];
    if (obj.type === 'effect') {
      const state = obj.state || {};
      const events = [{ type: 'tool_start', id: obj.id, name: obj.title || obj.detail?.kind, input: obj.detail?.input }];
      if (state.status === 'completed' || state.status === 'failed') events.push({ type: 'tool_result', id: obj.id, text: state.outputText || state.error?.message || '', exitCode: null });
      if (state.status === 'skipped' || state.status === 'cancelled') events.push({ type: 'error', message: state.reason || 'Vibe-Werkzeugfreigabe verweigert' });
      return events;
    }
    if (obj.type === 'callback' && obj.detail?.kind === 'approval' && ['deny', 'cancel_turn'].includes(obj.state?.output?.decision?.type)) return [{ type: 'error', message: 'Permission denied: Vibe-Werkzeugfreigabe verweigert' }];
    return [];
  }
};
