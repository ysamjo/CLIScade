(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TaskState = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  const terminal = (status) => ['done', 'completed', 'failed', 'error', 'cancelled', 'incomplete'].includes(status);
  function terminalMessage(record, message) {
    const status = record.status;
    const type = status === 'cancelled' ? 'cancelled' : status === 'completed' ? 'done' : 'error';
    return { type, status, exitCode: type === 'cancelled' ? 130 : type === 'done' ? 0 : (record.exitCode || 1), message };
  }
  function fromMessage(data) {
    if (data.type === 'cancelled' || data.exitCode === 130) return 'cancelled';
    if (data.status === 'incomplete') return 'incomplete';
    return data.type === 'done' && (data.exitCode == null || data.exitCode === 0) ? 'completed' : 'failed';
  }
  return { terminal, terminalMessage, fromMessage };
});
