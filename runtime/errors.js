function classifyError({ explicit, raw = '', stderr = '', exitCode, reason } = {}) {
  if (reason === 'cancelled') return { kind: 'cancelled', retryability: 'never', message: 'Abgebrochen durch Benutzer' };
  if (reason === 'timeout' || reason === 'idle_timeout') return { kind: 'timeout', retryability: 'next_harness', message: reason === 'idle_timeout' ? 'Keine Ausgabe innerhalb der Frist' : 'Zeitlimit überschritten' };
  if (reason === 'spawn_failure') return { kind: 'spawn_failure', retryability: 'next_harness', message: String(explicit || 'Prozess konnte nicht gestartet werden') };
  const successfulStartupRefusal = /^(?:configuration is invalid at|invalid configuration file|unknown (?:option|command|flag)|unrecognized command line option)\b/im.test(raw);
  if (!explicit && exitCode === 0 && !successfulStartupRefusal && !stderr) return null;
  const text = String(explicit || (exitCode === 0 ? (stderr || raw) : raw) || '').replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
  let kind = 'unknown';
  if (/unauthorized|authentication|not authenticated|please.{0,20}login|invalid.{0,10}(api.?key|token)/i.test(text)) kind = 'auth';
  else if (/quota|insufficient.{0,20}(credit|balance)|out of credits/i.test(text)) kind = 'quota';
  else if (/429|rate.?limit|too many requests/i.test(text)) kind = 'rate_limit';
  else if (/context.{0,20}(length|window|limit|exceeded|too long)/i.test(text)) kind = 'context_limit';
  else if (/model.{0,20}(not.{0,10}found|invalid|unknown|unavailable|unsupported)/i.test(text)) kind = 'model_unavailable';
  else if (/service unavailable|bad gateway|fetch failed|ENOTFOUND|ECONNREFUSED|\b5\d\d\b/i.test(text)) kind = 'service';
  else if (/configuration is invalid at|invalid configuration file|unknown (option|command)|unknown flag|unrecognized command line option/i.test(text)) kind = 'harness_failure';
  else if (exitCode !== 0) kind = 'harness_failure';
  if (kind === 'unknown' && !explicit && exitCode === 0) return null;
  const diagnosis = String(explicit || text.trim().slice(-400) || `Harness endete mit Code ${exitCode}`);
  const startup = /configuration is invalid at|invalid configuration file|unknown (option|command)|unknown flag|unrecognized command line option/i.test(text);
  return { kind, retryability: kind === 'session_busy' ? 'never' : 'next_harness',
    message: startup ? `Start verweigert: ${diagnosis}` : diagnosis };
}

module.exports = { classifyError };
