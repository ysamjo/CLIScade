const { createHash } = require('node:crypto');
const REPORT_INSTRUCTION = '[Projektgedächtnis]\nAm Ende einen kompakten JSON-Block mit Kennung project-memory ausgeben: ' +
 '```project-memory\n{"decisions":[],"openSteps":[],"checks":[]}\n```\n' +
 'decisions: höchstens drei Objekte mit key und text für dauerhafte Entscheidungen; openSteps: höchstens drei offene Punkte; ' +
 'checks: Objekte mit command und exitCode. Nur tatsächlich relevante Erkenntnisse, keine Geheimnisse, keine neuen AGENTS-Regeln. ' +
 'Behauptete Prüfungen bleiben ungeprüft, solange passende Werkzeugbelege fehlen.';
function digest(text) { return createHash('sha256').update(String(text)).digest('hex').slice(0, 24); }
function safeText(value, max = 1200) {
 if (typeof value !== 'string' || !value.trim() || value.length > max) return null;
 if (/-----BEGIN.*PRIVATE KEY|\b(?:api[_-]?key|password|passwd|secret|access[_-]?token)\s*[:=]|\bBearer\s+\S+|\b(?:sk-|ghp_|github_pat_)[A-Za-z0-9_-]{12,}/i.test(value)) return null;
 return value.trim();
}
function extractReport(text = '') {
 const matches = [...text.matchAll(/```project-memory\s*\n([\s\S]*?)\n```/g)];
 let data = {}; let hasReport = false;
 try { if (matches.length && matches.at(-1)[1].length <= 16000) { data = JSON.parse(matches.at(-1)[1]); hasReport = true; } } catch {}
 if (!data || typeof data !== 'object') data = {};
 return {
  hasReport, openStepsProvided: hasReport && Array.isArray(data.openSteps),
  decisions: (Array.isArray(data.decisions) ? data.decisions : []).slice(0, 3).filter(d => d && safeText(d.text)),
  openSteps: (Array.isArray(data.openSteps) ? data.openSteps : []).slice(0, 3).map(v => safeText(v)).filter(Boolean),
  checks: (Array.isArray(data.checks) ? data.checks : []).slice(0, 12).filter(c => c && safeText(c.command, 2000)).map(c => ({ command: c.command, exitCode: Number.isInteger(c.exitCode) ? c.exitCode : null, verified: false, source: 'agent_report' }))
 };
}
function recordToolEvidence(record, pending, event, git, attemptId) {
 if (typeof event.id !== 'string' || !event.id) return;
 const key = `${attemptId}:${event.id}`;
 if (event.type === 'tool_start') {
  const command = safeText(event.input?.command || event.input?.cmd, 2000);
  if (command && /\b(test|pytest|unittest|lint|check|assemble\w*|build|tsc|gradlew)\b/i.test(command)) {
   pending.set(key, { command, startedAt: new Date(event.at || Date.now()).toISOString(), revision: git.revision || null,
    changes: git.changes || '', attemptId });
  }
 } else if (event.type === 'tool_result' && pending.has(key)) {
  const start = pending.get(key); pending.delete(key);
  const exitCode = Number.isInteger(event.exitCode) ? event.exitCode : null;
  const evidence = { ...start, endedAt: new Date(event.at || Date.now()).toISOString(), exitCode,
   result: exitCode === 0 ? 'passed' : exitCode === null ? 'unknown' : 'failed',
   verified: exitCode !== null, source: 'runtime_tool', outputDigest: digest(event.text || '') };
  record.checks = [...(record.checks || []), evidence].slice(-50);
 }
}
function memoryEntries(record) {
 const report = extractReport(record.resultText || '');
 if ((record.resultText || '').includes('[Aufgabe]')) return [];
 const source = { taskId: record.id, revision: record.checkpoint?.revision || null, status: record.status };
 const at = new Date().toISOString();
 const make = (kind, key, text, verified = false, evidence = []) => ({ version: 1, key: `router-${kind}-${digest(key)}`,
  kind, text, verified, source, evidence, updatedAt: at });
 const entries = report.decisions.map(d => make('decision', String(d.key || d.text).toLowerCase(), d.text));
 if (report.openSteps.length || (report.openStepsProvided && record.status === 'completed')) entries.push(make('open', record.memoryThreadId || record.payload?.previousTaskId || record.id, report.openSteps.length ? report.openSteps.join('\n') : 'Im Abschlussbericht wurden keine offenen Punkte gemeldet.'));
 for (const check of (record.checks || []).filter(c => c.verified).slice(-3)) {
  entries.push(make('check', check.command, `Prüfung: ${check.command}; Ergebnis: ${check.result}; Exit-Code: ${check.exitCode}`, true, [check]));
 }
 if (!entries.length && !(record.resultText || '').includes('[Aufgabe]')) {
  const summary = safeText((record.resultText || '').trim(), 800);
  if (summary) entries.push(make('summary', record.prompt || record.id, summary));
 }
 return entries.slice(0, 7);
}
function selectMemories(memories, prompt = '', budget = 12000) {
 const terms = new Set(prompt.toLowerCase().match(/[\p{L}\p{N}_-]{3,}/gu) || []);
 const ranked = memories.map((memory, index) => {
  const words = new Set(`${memory.key} ${memory.text}`.toLowerCase().match(/[\p{L}\p{N}_-]{3,}/gu) || []);
  const matches = [...terms].filter(term => words.has(term)).length;
  return { memory, index, score: matches * 10 + (memory.verified ? 2 : 0) };
 }).sort((a, b) => b.score - a.score || String(b.memory.updatedAt || '').localeCompare(String(a.memory.updatedAt || '')) || a.index - b.index);
 const items = []; let used = 0;
 for (const { memory } of ranked) {
  const size = JSON.stringify(memory).length + 2;
  if (size + used <= budget && items.length < 12) { items.push(memory); used += size; }
 }
 return { items, omitted: memories.length - items.length };
}
module.exports = { REPORT_INSTRUCTION, safeText, digest, extractReport, memoryEntries, recordToolEvidence, selectMemories };
