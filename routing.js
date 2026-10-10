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

// Ein Auftrag startet nur, wenn zwei Dinge frei sind: ein Platz an der Kappe (0 oder
// fehlend = keine Kappe) und der Ordner — zwei Agenten im selben Repo schreiben sich
// gegenseitig in den Arbeitsbaum.
function dispatchSlotDecision({ maxConcurrent, running = [], incoming = {} } = {}) {
  if (maxConcurrent && running.length >= maxConcurrent) return { reason: 'capacity' };

  const sameFolder = running.find((r) => r.projectPath === incoming.projectPath);
  if (sameFolder) return { reason: 'project', blocker: sameFolder };

  return null;
}

// Nur die genannten Variablen wandern aus der Shell-Umgebung in den Lauf: ein Marker des
// Startprozesses (QODER_*) oder die PATH-Kosmetik der Shell darf den Harness nie erreichen.
// Was der Startprozess selbst schon weiss, bleibt vorn — die Shell ist nur der Ersatz.
function gatewayEnvFromShell({ shellEnv = {}, currentEnv = {}, names = [] } = {}) {
  const picked = {};
  for (const name of names) {
    const value = shellEnv[name];
    if (value && !currentEnv[name]) picked[name] = value;
  }
  return picked;
}

function isJobDue(job, now) {
  const last = new Date(job.lastRun || job.createdAt || now).getTime();
  const diffMinutes = (now.getTime() - last) / 60000;
  switch (job.interval) {
    case 'every_15_mins': return diffMinutes >= 15;
    case 'hourly': return diffMinutes >= 60;
    case 'every_6_hours': return diffMinutes >= 360;
    case 'daily_02_00': return now.getHours() === 2 && now.toDateString() !== new Date(last).toDateString();
    case 'daily_08_00': return now.getHours() === 8 && now.toDateString() !== new Date(last).toDateString();
    case 'weekly_monday': return now.getDay() === 1 && now.getHours() === 8 &&
      now.toDateString() !== new Date(last).toDateString();
    default: return diffMinutes >= 60;
  }
}

module.exports = {
  RUN_IDLE_TIMEOUT_MS,
  RUN_IDLE_GRACE_MS,
  armIdleWatchdog,
  knownBrokenBlocker,
  startupRefusal,
  dispatchSlotDecision,
  gatewayEnvFromShell,
  isJobDue,
  formatAge
};
