const EVENT_TYPES = new Set(['start', 'text', 'thinking', 'tool_start', 'tool_result', 'warning', 'result', 'error', 'session_lost']);

function canonicalEvent(event, harnessId) {
  if (!event || !EVENT_TYPES.has(event.type)) return null;
  return { ...event, harnessId, at: Date.now() };
}

module.exports = { canonicalEvent };
