'use strict';
const readline = require('node:readline');
const mode = process.env.MOCK_ACP_MODE || 'ok';
const send = message => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
let sessionId = 'session-one';
let promptId;
const calls = [];
readline.createInterface({ input: process.stdin }).on('line', line => {
  const message = JSON.parse(line);
  calls.push(message.method || 'reply');
  if (message.method === 'initialize') {
    send({ id: message.id, result: { protocolVersion: mode === 'badversion' ? 77 : 1,
      agentCapabilities: { loadSession: true, sessionCapabilities: { resume: {} } } } });
  } else if (message.method === 'session/new') {
    send({ id: message.id, result: { sessionId } });
  } else if (message.method === 'session/resume') {
    sessionId = message.params.sessionId;
    send({ id: message.id, result: {} });
  } else if (message.method === 'session/prompt') {
    promptId = message.id;
    if (mode === 'broken') {
      process.stdout.write('not-json\n');
    } else if (mode === 'permission') {
      send({ id: 901, method: 'session/request_permission', params: {
        sessionId, toolCall: { toolCallId: 'test-tool', title: 'Write' },
        options: [{ optionId: 'allow_once', name: 'Allow', kind: 'allow_once' }] } });
    } else if (mode === 'hang') {
      // Wait for session/cancel.
    } else {
      send({ method: 'session/update', params: { sessionId, update: {
        sessionUpdate: 'tool_call', toolCallId: 'tool-1', title: 'Read file' } } });
      send({ method: 'session/update', params: { sessionId, update: {
        sessionUpdate: 'tool_call_update', toolCallId: 'tool-1', status: 'completed',
        content: [{ type: 'content', content: { type: 'text', text: 'read ok' } }] } } });
      send({ method: 'session/update', params: { sessionId, update: {
        sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Fertig' } } } });
      send({ id: message.id, result: { stopReason: 'end_turn' } });
    }
  } else if (message.id === 901 && message.result) {
    send({ method: 'session/update', params: { sessionId, update: {
      sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Permission denied' } } } });
    send({ id: promptId, result: { stopReason: 'end_turn' } });
  } else if (message.method === 'session/cancel' && mode === 'hang') {
    process.exit(0);
  }
});
