const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { dispatchSlotDecision } = require('../routing');
const { resolveWorkspaceDirectory } = require('../runtime/workspace');
const { terminalMessage } = require('../public/task-state');
const DEFAULT_MAX_CONCURRENT = 0;

function createDispatchService({ loadConfig, loadTasksData, taskStore, DEFAULT_ROOT_DIR,
  buildAgentsContext, broadcastToClients, prepareAttachment, prepareBead, saveCheckpoint,
  runConsensusDispatch, runDispatch, finalizeTask = async () => {} }) {
const liveRuns = new Map();
const dispatchQueue = [];
const requestEntries = new Map();



function maxConcurrentRuns() {
  const dispatch = loadConfig().dispatch;
  const n = dispatch && Number(dispatch.max_concurrent);
  return Number.isInteger(n) && n >= 1 ? n : DEFAULT_MAX_CONCURRENT;
}

function nextTaskId(kind) {
  return `${kind}_${randomUUID()}`;
}

// Wer gerade arbeitet, blockiert seinen Ordner und die Harnesses, die er wirklich
// hält. Ein auto-Lauf meldet erst einen Harness an, sobald eine Route gewählt ist.
function runningForGate() {
  return [...liveRuns.values()].map((r) => ({
    taskId: r.taskId,
    projectPath: r.workingDir,
    commands: r.commands
  }));
}

function gateInputs(payload, clis) {
  const enabled = clis.filter((c) => c.enabled !== false && c.capabilities.dispatchable);
  if (payload.harnessOverride === 'consensus') {
    const first = enabled[0];
    const second = enabled.find((route) => route.harnessId !== first?.harnessId);
    return { requires: [first, second].filter(Boolean).map((route) => route.command), candidates: [] };
  }
  if (payload.harnessOverride && payload.harnessOverride !== 'auto') {
    const specific = enabled.find((c) => c.name === payload.harnessOverride);
    return { requires: specific ? [specific.command] : [], candidates: [] };
  }
  return { requires: [], candidates: enabled.map((c) => c.command) };
}

function queueMessage(decision) {
  const blocker = decision.blocker;
  if (decision.reason === 'capacity') {
    return `Warteschlange: alle ${maxConcurrentRuns()} Plätze belegt`;
  }
  if (decision.reason === 'project') {
    return `Warteschlange: in ${path.basename(blocker.projectPath)} arbeitet bereits ein Auftrag`;
  }
  return `Warteschlange: ${blocker.commands.join(' + ')} arbeitet bereits in ${path.basename(blocker.projectPath)}`;
}

// Der erste eintragbare Auftrag gewinnt; ein blockierter bleibt liegen, weil ein
// späterer Auftrag einen anderen Ordner oder Harness brauchen kann.
function pumpRuns() {
  const max = maxConcurrentRuns();
  let startedOne = true;

  while (startedOne) {
    startedOne = false;
    for (const entry of dispatchQueue) {
      const decision = dispatchSlotDecision({
        maxConcurrent: max,
        running: runningForGate(),
        incoming: {
          projectPath: entry.workingDir
        }
      });
      if (decision) {
        if (!entry.queuedNotified) {
          entry.queuedNotified = true;
          const text = queueMessage(decision);
          sendRunMessage(entry.ws, entry.taskId, {
            type: 'queued',
            reason: decision.reason,
            blockerTaskId: decision.blocker ? decision.blocker.taskId : null,
            message: text
          });
        }
        continue;
      }
      dispatchQueue.splice(dispatchQueue.indexOf(entry), 1);
      liveRuns.set(entry.taskId, entry);
      startedOne = true;
      startRun(entry);
      break;
    }
  }
}

function startRun(entry) {
  entry.record.status = 'running';
  writeTask(entry.record);
  const isConsensus = entry.payload.harnessOverride === 'consensus';
  // Der Lauf gibt seine Plätze erst zurück, wenn er wirklich geendet hat — danach
  // rückt die Warteschlange nach.
  entry.finish = (err, record) => {
    if (entry.finalizing) return entry.finalizing;
    entry.finalizing = Promise.resolve().then(() => finalizeTask(entry)).catch(() => {
      entry.record.memoryStatus = { state: 'error', error: 'Projektwissen konnte nicht gespeichert werden' };
    }).finally(() => {
      writeTask(entry.record);
      const message = entry.pendingTerminal || terminalMessage(entry.record, err?.message || 'Auftrag abgeschlossen');
      liveRuns.delete(entry.taskId);
      sendRunMessage(entry.ws, entry.taskId, message);
      if (entry.onComplete) entry.onComplete(err, record);
      pumpRuns();
    });
    return entry.finalizing;
  };
  Promise.resolve().then(async () => {
    if (entry.cancelled) throw new Error('Abgebrochen durch Benutzer');
    prepareAttachment(entry);
    await prepareBead(entry);
    if (entry.cancelled) throw new Error('Abgebrochen durch Benutzer');
    if (isConsensus) runConsensusDispatch(entry);
    else runDispatch(entry);
  }).catch((err) => {
    entry.record.status = entry.cancelled ? 'cancelled' : 'failed';
    entry.record.exitCode = entry.cancelled ? 130 : 1;
    saveCheckpoint(entry.record);
    writeTask(entry.record);
    sendRunMessage(entry.ws, entry.taskId, terminalMessage(entry.record, err.message));
    entry.finish(err, entry.record);
  });
}

function sendRunMessage(ws, taskId, obj) {
  const active = liveRuns.get(taskId);
  if (active && ['done', 'error', 'cancelled'].includes(obj.type)) { active.pendingTerminal = obj; return; }
  const msg = { ...obj, taskId: obj.taskId || taskId };
  const json = JSON.stringify(msg);
  if (ws && ws.readyState === 1) {
    try { ws.send(json); } catch {}
  }
  broadcastToClients(msg, ws);
}

// Nur der eigene Eintrag wird zurückgeschrieben: ein Snapshot der ganzen Liste würde
// die Tasks anderer Läufe mit deren Stand beim Start überschreiben.
function writeTask(taskRecord) { taskStore.put(taskRecord); }

function submitDispatch(payload, ws, onComplete) {
  const requestId = typeof payload.requestId === 'string' && /^[A-Za-z0-9-]{8,128}$/.test(payload.requestId)
    ? payload.requestId : null;
  if (requestId && (requestEntries.has(requestId) || taskStore.findRequest(requestId))) {
    const existing = requestEntries.get(requestId) || { taskId: taskStore.findRequest(requestId).id, record: taskStore.findRequest(requestId) };
    sendRunMessage(ws, existing.taskId, { type: 'task_created', task: existing.record });
    if (!['queued', 'running'].includes(existing.record.status)) {
      sendRunMessage(ws, existing.taskId, terminalMessage(existing.record, 'Auftrag bereits abgeschlossen'));
    }
    return existing;
  }
  if (typeof payload.prompt !== 'string' || !payload.prompt.trim() || payload.prompt.length > 100000) throw new Error('Aufgabe ist leer oder zu lang');
  const clis = loadConfig().clis || [];
  const data = loadTasksData();
  const workingDir = resolveWorkspaceDirectory(payload.projectPath, data.rootDirectory || DEFAULT_ROOT_DIR);
  const isConsensus = payload.harnessOverride === 'consensus';
  if (payload.previousTaskId) {
    const previous = taskStore.get(payload.previousTaskId);
    if (!previous || previous.projectPath !== workingDir) throw new Error('Fortsetzung gehört nicht zu diesem Projekt');
  }
  const gate = gateInputs(payload, clis);
  const enabledRoutes = clis.filter((c) => c.enabled !== false && c.capabilities.dispatchable);
  const initialRoute = enabledRoutes[0] || { name: '—', command: '—', model: 'Standard' };
  const { agentsSources } = buildAgentsContext(workingDir);
  const consensusRoutes = [enabledRoutes[0], enabledRoutes.find((route) => route.harnessId !== enabledRoutes[0]?.harnessId)].filter(Boolean);
  const consensusPair = consensusRoutes.map((route) => route.name).join(' ↔ ');

  const entry = {
    taskId: nextTaskId(isConsensus ? 'consensus' : 'task'),
    payload: { ...payload, projectPath: workingDir },
    workingDir,
    ws,
    onComplete,
    requires: gate.requires,
    candidates: gate.candidates,
    commands: gate.requires.slice(),
    controllers: new Set(),
    queuedNotified: false,
    record: null
  };

  entry.record = {
    id: entry.taskId,
    requestId,
    payload: { prompt: payload.prompt, projectPath: workingDir, harnessOverride: payload.harnessOverride, modelOverride: payload.modelOverride, imagePath: payload.imagePath, previousTaskId: payload.previousTaskId, beadId: payload.beadId, withoutBeads: payload.withoutBeads === true },
    beadId: payload.beadId || null,
    memoryThreadId: payload.previousTaskId ? (taskStore.get(payload.previousTaskId).memoryThreadId || payload.previousTaskId) : entry.taskId,
    projectPath: workingDir,
    projectName: path.basename(workingDir),
    prompt: payload.prompt,
    imagePath: payload.imagePath || null,
    harness: isConsensus ? `Konsens (${consensusPair})` : initialRoute.name,
    command: isConsensus ? 'consensus' : initialRoute.command,
    model: isConsensus
      ? consensusRoutes.map((route) => route.model || 'Standard').join(' ↔ ')
      : ((payload.modelOverride && payload.modelOverride !== 'Standard') ? payload.modelOverride : (initialRoute.model || 'Standard')),
    agentsInfo: agentsSources.length > 0 ? agentsSources.join(' + ') : 'Keine',
    timestamp: new Date().toISOString(),
    status: 'queued',
    outputHtml: ''
  };

  writeTask(entry.record);
  if (requestId) {
    requestEntries.set(requestId, entry);
    const expiry = setTimeout(() => requestEntries.delete(requestId), 24 * 60 * 60 * 1000);
    expiry.unref?.();
  }
  dispatchQueue.push(entry);
  sendRunMessage(ws, entry.taskId, { type: 'task_created', task: entry.record });
  pumpRuns();
  return entry;
}

// Abbrechen gilt immer genau einen Auftrag: der eigene kind-Prozess, oder bei einem
// Auftrag in der Warteschlange dessen Platz dort.
function cancelDispatch(taskId, ws) {
  const queuedIdx = dispatchQueue.findIndex((e) => e.taskId === taskId);
  if (queuedIdx !== -1) {
    const [entry] = dispatchQueue.splice(queuedIdx, 1);
    entry.record.status = 'cancelled';
    entry.record.exitCode = 130;
    writeTask(entry.record);
    sendRunMessage(ws || entry.ws, taskId, {
      ...terminalMessage(entry.record, 'Auftrag aus der Warteschlange genommen')
    });
    entry.onComplete?.(new Error('Auftrag aus der Warteschlange genommen'), entry.record);
    pumpRuns();
    return;
  }

  const run = liveRuns.get(taskId);
  if (!run) return;
  run.cancelled = true;
  run.controllers.forEach((controller) => controller.abort());
  sendRunMessage(ws || run.ws, taskId, {
    type: 'abbruch_laeuft',
    message: 'Abbruch läuft'
  });
}

  return { liveRuns, dispatchQueue, maxConcurrentRuns, submitDispatch, cancelDispatch, writeTask, sendRunMessage };
}
module.exports = { createDispatchService, DEFAULT_MAX_CONCURRENT };
