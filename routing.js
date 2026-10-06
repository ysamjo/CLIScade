// Pure routing decisions for the dispatch chain. No fs, no express, no spawn-side
// effects, so each rule is testable with the functions below.

// Three minutes covers a model that thinks and writes in long bursts; anything
// past that is waiting for a human approval that never arrives in a relay run.
// HARNESS_IDLE_TIMEOUT_MS shortens the deadline so the chain can be checked
// end-to-end without waiting out the real timeout.
const RUN_IDLE_TIMEOUT_MS = Number(process.env.HARNESS_IDLE_TIMEOUT_MS) || 180000;
const RUN_IDLE_GRACE_MS = 5000;

// A route that stops writing is stuck on an approval prompt or a dead connection.
// Only the process is known here, so killing, logging and chain advance stay with
// the caller, which owns the routing chain.
function armIdleWatchdog(child, options = {}) {
  const idleMs = options.idleMs || RUN_IDLE_TIMEOUT_MS;
  const graceMs = options.graceMs || RUN_IDLE_GRACE_MS;
  const onFire = options.onFire || (() => {});

  let timer = null;
  let killTimer = null;
  let done = false;
  let fired = false;

  const clear = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (killTimer) { clearTimeout(killTimer); killTimer = null; }
  };

  const arm = () => {
    if (done || fired) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (done || fired) return;
      fired = true;
      onFire({ idleMs });
      try { child.kill('SIGTERM'); } catch {}
      killTimer = setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, graceMs);
    }, idleMs);
  };

  const touch = () => { if (!done && !fired) arm(); };
  touch();

  child.on('close', () => { done = true; clear(); });
  child.on('error', () => { done = true; clear(); });
  if (child.stdout) child.stdout.on('data', touch);
  if (child.stderr) child.stderr.on('data', touch);

  return { stop: () => { done = true; clear(); }, touch };
}

// What decides "this costs extra" is the model actually selected, not the route:
// the same harness serves a free-tier model and a metered one. Only the names the
// presets and providers spell out count as free, so an unknown model is treated as
// paid and never relayed to while the user asked for no spend.
const FREE_MODEL = /(-free\b|free[- ]?tier|gratis|unmetered|kostenlos|stealth\/)/i;

function routePolicyBlocker(route = {}) {
  const name = route.name || route.command;
  if (route.allow_paid_usage !== false) return null;
  if (route.model && FREE_MODEL.test(route.model)) return null;
  return `Kostenrichtlinie: ${name} würde mit „${route.model || 'Standard'}" extra kosten, und Bezahl-Routen sind deaktiviert`;
}

function formatAge(ms) {
  const minutes = Math.max(1, Math.round(ms / 60000));
  if (minutes < 60) return `vor ${minutes} min`;
  return `vor ${Math.round(minutes / 60)} h`;
}

// Marks are written by the harness test endpoint, so "broken" means "already
// measured", not inferred. Only a login failure removes a route from the chain;
// a quota failure can clear on its own while the task is running.
function knownBrokenBlocker(route = {}, broken = {}, options = {}) {
  if (options.explicitChoice) return null;
  const mark = broken[route.command];
  if (!mark || mark.errorKind !== 'auth') return null;
  const name = route.name || route.command;
  return `${name}: Login fehlgeschlagen (${formatAge(Date.now() - mark.at)}) — erneut in den Einstellungen testen`;
}

// Some harnesses refuse their own startup and still exit with 0, which the chain
// would count as a finished task. These phrasings come from the CLI's argument and
// config parser, never from an agent that is busy working, so they are safe to read
// as "nothing was attempted".
const STARTUP_REFUSAL = /(configuration is invalid at|invalid configuration file|error: unknown (option|command)|unrecognized command line option|unknown flag:)/i;

function startupRefusal(rawOutput = '') {
  const clean = rawOutput.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');
  const line = clean.split('\n').find((l) => STARTUP_REFUSAL.test(l));
  return line ? line.trim().slice(0, 200) : null;
}

// Harnesses wie freebuff nehmen dem Konto genau eine Session ab: startet ein zweites
// Fenster dieselbe CLI, verdrängt die neue die alte und das alte Terminal meldet
// "released or taken over". Ein Fenster darf seinen eigenen Prozess neu starten, weil
// der Server ihn vor dem Spawn fegt.
function ptyOwnershipBlocker({ singleSessionCommands, sessions = [], command, clientId } = {}) {
  if (!singleSessionCommands || !singleSessionCommands.has(command)) return null;
  return sessions.find((s) => s.command === command && s.clientId !== clientId) || null;
}

// Ein Auftrag startet nur, wenn drei Dinge frei sind: ein Platz an der Kappe, der
// Ordner (zwei Agenten im selben Repo ueberschreiben sich gegenseitig) und der Harness
// (die Kontingente sollen nicht gebuendelt angezapft werden). `requires` sind die
// Befehle, die der Auftrag fest braucht — eine Route, ein freier Wille, zwei Engines
// im Konsens. „auto" hat keine Vorgabe, sondern weicht auf eine freie Route der Kette
// aus und wartet erst, wenn die ganze Kette belegt ist.
function dispatchSlotDecision({ maxConcurrent, running = [], incoming = {} } = {}) {
  if (maxConcurrent && running.length >= maxConcurrent) return { reason: 'capacity' };

  const sameFolder = running.find((r) => r.projectPath === incoming.projectPath);
  if (sameFolder) return { reason: 'project', blocker: sameFolder };

  const required = incoming.requires || [];
  const busyRequired = running.find((r) => required.includes(r.command));
  if (busyRequired) return { reason: 'harness', blocker: busyRequired };
  if (required.length) return null;

  const candidates = incoming.candidateCommands || [];
  const allBusy = candidates.length > 0 && candidates.every((c) => running.some((r) => r.command === c));
  if (allBusy) return { reason: 'harness', blocker: running.find((r) => r.command === candidates[0]) };
  return null;
}

// Dieselbe Regel noch einmal im laufenden Ausweichen: ein Harness, der schon in einem
// anderen Task arbeitet, gilt als Grund, eine Route zu ueberspringen — nie zwei Tasks
// auf ein Konto.
function busyHarnessBlocker(route = {}, running = []) {
  const busy = running.find((r) => r.command === route.command);
  if (!busy) return null;
  return `${route.name || route.command} arbeitet bereits in einem anderen Task`;
}

module.exports = {
  RUN_IDLE_TIMEOUT_MS,
  RUN_IDLE_GRACE_MS,
  armIdleWatchdog,
  routePolicyBlocker,
  knownBrokenBlocker,
  startupRefusal,
  ptyOwnershipBlocker,
  dispatchSlotDecision,
  busyHarnessBlocker,
  formatAge
};
