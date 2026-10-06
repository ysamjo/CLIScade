// Rauchtest für die Haupt-GUI: lädt die echte index.html mit dem echten app.js
// in jsdom und prüft die Struktur, die das Skript beim Start erwartet.
//
// Warum das existiert: app.js holt sich beim Laden ~200 Elemente über
// getElementById. Wird ein Element aus dem HTML entfernt, ohne die Referenz im
// Skript nachzuziehen, stirbt das Bootstrap mit einer TypeError — und zwar
// mitten in der Kette, also sieht man eine halb aufgebaute Oberfläche.
// Genau diese Klasse Fehler fängt dieser Test.
//
// Aufruf:  node test/ui-smoke.mjs
//
// Kein Browser nötig: xterm und WebSocket werden gestubbt, fetch wird über eine
// Routentabelle bedient.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { homedir } from "node:os";

const HIER = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HIER, "..", "public");

const jsdomPfad = join(
  homedir(), ".workbuddy-ai", "binaries", "node", "workspace", "node_modules", "jsdom", "lib", "api.js"
);
const { JSDOM } = await import(process.env.JSDOM_MODULE || pathToFileURL(jsdomPfad).href);

const bestanden = [];
const gefallen = [];
function pruefe(name, bedingung, zusatz = "") {
  if (bedingung) {
    bestanden.push(name);
    console.log(`  ok    ${name}`);
  } else {
    gefallen.push(name);
    console.log(`  FEHL  ${name}${zusatz ? `  -> ${zusatz}` : ""}`);
  }
}
const ruhen = async (n = 10) => {
  for (let i = 0; i < n; i += 1) await new Promise((r) => setTimeout(r, 0));
};

// --- Stubs ---------------------------------------------------------------

// Ein Harness, den das Terminal auswählen kann. freebuff ist die Vorauswahl.
const HEALTH = [
  { name: "Freebuff", cmd: "freebuff", available: true, version: "1.0" },
  { name: "Claude Code", cmd: "claude", available: true, version: "2.0" },
  { name: "Qoder", cmd: "qoder", available: false }
];

const ANTWORTEN = {
  "GET /api/status": {
    health: HEALTH,
    clis: HEALTH,
    dispatch: { max_concurrent: 3 }
  },
  "GET /api/workspace": {
    projects: [
      { name: "harness-router-gui", path: "/tmp/harness-router-gui", hasAgentsMd: true },
      // Die drei Parallel-Aufträge liegen in echten Ordnern — sonst tauchen sie
      // in der Seitenleiste gar nicht auf und diebadge-Prüfung liefe ins Leere.
      { name: "proj-a", path: "/tmp/proj-a" },
      { name: "proj-b", path: "/tmp/proj-b" },
      { name: "proj-c", path: "/tmp/proj-c" }
    ],
    tasks: []
  },
  "GET /api/model-presets": {},
  "GET /api/agents-md": {},
  "GET /api/skills": [],
  "GET /api/usage": {},
  "GET /api/remote": {},
  "GET /api/schedules": [],
  "GET /api/installer/status": {},
  // Zwei Läufe von drei Plätzen belegt: der Zähler muss "1/3 frei" sagen.
  "GET /api/runs": { running: [{ taskId: "f1" }, { taskId: "f2" }], queued: [], maxConcurrent: 3 }
};

const frames = [];
const fetches = [];
class WebSocketStub {
  static CONNECTING = 0;
  static OPEN = 1;
  static last = null;
  constructor(url) {
    this.url = url;
    this.readyState = WebSocketStub.CONNECTING;
    this.sent = [];
    WebSocketStub.last = this;
  }
  send(rohtext) {
    const nachricht = JSON.parse(rohtext);
    this.sent.push(nachricht);
    frames.push(nachricht);
  }
  close() { this.readyState = 3; }
}

class TerminalStub {
  constructor() {
    this.cols = 100;
    this.rows = 30;
    this.ausgabe = [];
  }
  open() {}
  loadAddon() {}
  onData() {}
  write(text) { this.ausgabe.push(text); }
  reset() { this.ausgabe = []; }
  clear() {}
  focus() {}
  dispose() {}
}

// --- Seite bauen ---------------------------------------------------------

const dom = new JSDOM(readFileSync(join(PUBLIC, "index.html"), "utf8"), {
  url: "http://localhost:3000/",
  runScripts: "outside-only",
  // jsdom liefert requestAnimationFrame nur mit dieser Option; setStudioMode
  // misst das Terminal darin neu.
  pretendToBeVisual: true
});
const { window } = dom;
const { document } = window;

const fehler = [];
window.addEventListener("error", (e) => fehler.push(`window.error: ${e.message}`));
window.onerror = (meldung) => fehler.push(`onerror: ${meldung}`);
window.alert = () => {};
window.confirm = () => true;
window.open = () => null;
window.WebSocket = WebSocketStub;
window.Terminal = TerminalStub;
window.FitAddon = { FitAddon: class { fit() {} } };

window.fetch = async (pfad, optionen = {}) => {
  const schluessel = `${optionen.method || "GET"} ${pfad}`;
  fetches.push({ schluessel, body: optionen.body });
  const daten = ANTWORTEN[schluessel] ?? ANTWORTEN[pfad] ?? {};
  return { ok: true, status: 200, json: async () => daten, text: async () => JSON.stringify(daten) };
};

window.eval(readFileSync(join(PUBLIC, "icons.js"), "utf8"));
window.eval(readFileSync(join(PUBLIC, "app.js"), "utf8"));
if (document.readyState !== "loading") {
  // Der Zuhörer auf DOMContentLoaded kam je nach jsdom-Timing zu spät.
  document.dispatchEvent(new window.Event("DOMContentLoaded"));
}
await ruhen(12);

// --- 1. Die Top-Leiste ist raus -----------------------------------------

pruefe("keine .top-bar mehr im DOM", document.querySelector(".top-bar") === null);
pruefe("kein #current-project-name mehr", document.querySelector("#current-project-name") === null);
pruefe("kein #new-task-top-btn mehr", document.querySelector("#new-task-top-btn") === null);
pruefe("kein #top-usage-btn / #top-usage-badge mehr",
  document.querySelector("#top-usage-btn") === null && document.querySelector("#top-usage-badge") === null);

// --- 2. Was umgezogen ist, sitzt am neuen Platz -------------------------

const status = document.querySelector("#connection-status");
pruefe("#connection-status lebt weiter", status !== null);
pruefe("#connection-status hängt in der Sidebar-Fußzeile",
  status?.parentElement?.classList.contains("sidebar-footer-status") === true);
pruefe("#connection-status trägt keinen Text (nur Punkt)",
  (status?.textContent || "") === "");

const drawer = document.querySelector("#mobile-sidebar-toggle");
pruefe("#mobile-sidebar-toggle sitzt in der Modus-Leiste",
  drawer?.parentElement?.classList.contains("studio-mode-switch") === true);

// --- 3. Start/Beenden: nur noch Beenden, im Terminal-Header -------------

pruefe("kein Start-Knopf mehr", document.querySelector("#interactive-start-btn") === null);
pruefe("keine .interactive-actions mehr", document.querySelector(".interactive-actions") === null);

const stopp = document.querySelector("#interactive-stop-btn");
pruefe("#interactive-stop-btn existiert", stopp !== null);
pruefe("Beenden sitzt im Terminal-Header",
  stopp?.parentElement?.classList.contains("terminal-actions") === true);
pruefe("Beenden ist im Ruhezustand deaktiviert", stopp?.disabled === true);

const takeover = document.querySelector("#interactive-takeover-btn");
pruefe("#interactive-takeover-btn existiert", takeover !== null);
pruefe("Übernehmen ist im Ruhezustand versteckt", takeover?.hidden === true);

// --- 4. Das Skript ist ohne Fehler durchgelaufen -------------------------

pruefe("keine JS-Fehler beim Bootstrap", fehler.length === 0, fehler.join(" | "));
pruefe("CLI-Auswahl wurde gefüllt", document.querySelectorAll("#interactive-cli-select option").length === 3);

// --- 5. Auto-Start: Terminal läuft ohne Klick an -------------------------

const ws = WebSocketStub.last;
pruefe("WebSocket wurde geöffnet", ws != null);
ws.readyState = WebSocketStub.OPEN;
ws.onopen();
await ruhen(4);

const start = frames.find((f) => f.type === "pty_start");
pruefe("Auto-Start hat einen pty_start geschickt", start != null, JSON.stringify(frames));
pruefe("Auto-Start nutzt die gewählte CLI (freebuff)", start?.command === "freebuff");
pruefe("Auto-Start übergibt Spalten/Zeilen", start?.cols === 100 && start?.rows === 30);
pruefe("Status-Punkt steht auf verbunden", status?.classList.contains("connected") === true);

// --- 6. Beenden gibt frei, Auto-Start startet nicht von selbst neu -------

frames.length = 0;
ws.onmessage({ data: JSON.stringify({ type: "pty_started", sessionId: "s1", command: "freebuff", cwd: "/tmp/harness-router-gui" }) });
await ruhen(2);
pruefe("Beenden wird aktiv, sobald der Prozess läuft", stopp?.disabled === false);

frames.length = 0;
stopp.click();
await ruhen(2);
pruefe("Klick auf Beenden schickt pty_kill", frames.some((f) => f.type === "pty_kill"));

frames.length = 0;
ws.onmessage({ data: JSON.stringify({ type: "pty_exit", exitCode: 0, killed: true }) });
await ruhen(6);
pruefe("nach dem Beenden kein automatischer Neustart", frames.length === 0, JSON.stringify(frames));
pruefe("Beenden ist danach wieder deaktiviert", stopp?.disabled === true);

// --- 7. Erneutes Betreten des Modus startet wieder -----------------------

frames.length = 0;
document.querySelector("#mode-interactive-btn").click();
// setStudioMode startet erst im nächsten Animationsframe — der kommt nicht in
// setTimeout(0)-Schritten, also kurz echt warten.
await new Promise((r) => setTimeout(r, 80));
await ruhen(6);
pruefe("Klick auf den Modus-Knopf startet die CLI neu",
  frames.some((f) => f.type === "pty_start"), JSON.stringify(frames));

// --- 8. Server-Neustart: das Terminal friert nicht ein -------------------
// Faellt die Verbindung weg, ist der PTY-Prozess auf dem Server laengst fort.
// Hielte die App ihn fuer lebendig, koennte der Nutzer nichts mehr starten.

frames.length = 0;
ws.onmessage({ data: JSON.stringify({ type: "pty_started", sessionId: "s9", command: "freebuff", cwd: "/tmp/harness-router-gui" }) });
await ruhen(2);
ws.onclose();
await ruhen(2100); // die App verbindet sich nach zwei Sekunden neu

const ws2 = WebSocketStub.last;
pruefe("Neuverbindung opened", ws2 != null && ws2 !== ws);
ws2.readyState = WebSocketStub.OPEN;
ws2.onopen();
await ruhen(8);
pruefe("Terminal startet nach der Neuverbindung neu",
  frames.some((f) => f.type === "pty_start"), JSON.stringify(frames));

// --- 9. Split-View: zwei Aufträge nebeneinander -------------------------
// Der Composer sperrt nicht mehr: Aufträge werden schnell nacheinander geschickt und
// laufen nebeneinander. Meldungen sind über die Task-ID zugeordnet und rendereren
// ausschließlich ihr eigenes Feld.

const konsole = (i) => document.querySelector(`#run-split .run-pane:nth-child(${i + 1})`);
const auftrag = (id, ordner, name) => ({
  id, prompt: name, projectPath: `/tmp/${ordner}`, projectName: ordner,
  harness: "Freebuff", model: "plan-free", status: "queued", outputHtml: ""
});
const A = auftrag("task_a", "proj-a", "Erster Auftrag");
const B = auftrag("task_b", "proj-b", "Zweiter Auftrag");
const C = auftrag("task_c", "proj-c", "Dritter Auftrag");
const sag = (json) => ws2.onmessage({ data: JSON.stringify(json) });

pruefe("#run-split existiert", document.querySelector("#run-split") !== null);
pruefe("zwei Konsolenfelder", document.querySelectorAll("#run-split .run-pane").length === 2);
pruefe("jedes Feld hat eigene Ausgabe",
  document.querySelectorAll("#run-split .run-pane-body").length === 2);
pruefe("jedes Feld hat eigenen Abbrechen-Knopf",
  document.querySelectorAll("#run-split .run-pane-cancel").length === 2);
pruefe("die Einzelkonsole ist raus", document.querySelector("#terminal-body") === null);
pruefe("das globale Routing-Banner ist raus", document.querySelector("#active-routing-card") === null);

frames.length = 0;
sag({ type: "task_created", taskId: A.id, task: A });
sag({ type: "route_selected", taskId: A.id, harness: "Freebuff", command: "freebuff", model: "plan-free", agentsInfo: "AGENTS.md aktiv" });
sag({ type: "output", taskId: A.id, html: "AUSGABE-A" });
await ruhen(4);

pruefe("Auftrag A sitzt im ersten Feld", (konsole(0)?.textContent || "").includes("AUSGABE-A"), konsole(0)?.innerHTML);
pruefe("der Ausführen-Knopf bleibt während des Laufs benutzbar",
  document.querySelector("#send-prompt-btn")?.disabled === false);

frames.length = 0;
sag({ type: "task_created", taskId: B.id, task: B });
sag({ type: "route_selected", taskId: B.id, harness: "Qoder", command: "qoder", model: "auto" });
sag({ type: "output", taskId: B.id, html: "AUSGABE-B" });
await ruhen(4);

pruefe("Auftrag B bekommt das zweite Feld", (konsole(1)?.textContent || "").includes("AUSGABE-B"));
pruefe("B schreibt nicht in A's Feld", !(konsole(0)?.textContent || "").includes("AUSGABE-B"));
pruefe("A's Ausgabe bleibt stehen", (konsole(0)?.textContent || "").includes("AUSGABE-A"));
pruefe("jedes Feld nennt seinen Harness",
  /Freebuff/.test(konsole(0)?.textContent || "") && /Qoder/.test(konsole(1)?.textContent || ""));
// Die Seitenleiste weiß es vorher (erste Route der Kette) — route_selected bessert nach.
pruefe("die Seitenleiste zeigt den gewählten Harness",
  /Qoder/.test(document.querySelector('.task-item[data-task-id="task_b"]')?.textContent || ""),
  document.querySelector('.task-item[data-task-id="task_b"]')?.textContent);
pruefe("die Seitenleiste markiert den Lauf als aktiv",
  /◐/.test(document.querySelector('.task-item[data-task-id="task_b"]')?.textContent || ""),
  document.querySelector('.task-item[data-task-id="task_b"]')?.textContent);

sag({ type: "queued", taskId: B.id, reason: "project", blockerTaskId: A.id, message: "Warteschlange: in proj-a arbeitet bereits ein Auftrag" });
await ruhen(3);
pruefe("die Warteschlangen-Meldung erscheint im eigenen Feld",
  /Warteschlange/.test(konsole(1)?.textContent || ""));

sag({ type: "done", taskId: B.id, exitCode: 0, message: "Fertig" });
await ruhen(4);
pruefe("Abbrechen ist im beendeten Feld weg", konsole(1)?.querySelector(".run-pane-cancel")?.hidden === true);
pruefe("Abbrechen bleibt im laufenden Feld stehen", konsole(0)?.querySelector(".run-pane-cancel")?.hidden === false);

frames.length = 0;
sag({ type: "task_created", taskId: C.id, task: C });
sag({ type: "route_selected", taskId: C.id, harness: "Cline", command: "cline", model: "plan-free" });
sag({ type: "output", taskId: C.id, html: "AUSGABE-C" });
await ruhen(4);

pruefe("der dritte Auftrag nimmt das Feld des beendeten", (konsole(1)?.textContent || "").includes("AUSGABE-C"));
pruefe("C verdrängt A nicht aus dem laufenden Feld", (konsole(0)?.textContent || "").includes("AUSGABE-A"));
pruefe("C löscht B's Ausgabe aus seinem Feld", !(konsole(1)?.textContent || "").includes("AUSGABE-B"));

konsole(0)?.querySelector(".run-pane-cancel")?.click();
await ruhen(2);
pruefe("Klick auf Abbrechen meldet genau diese Task-ID",
  frames.some((f) => f.type === "cancel" && f.taskId === A.id), JSON.stringify(frames));

pruefe("der Zähler meldet die freie Kapazität",
  (document.querySelector("#run-capacity-text")?.textContent || "").includes("1/3"),
  document.querySelector("#run-capacity-text")?.textContent);

// --- 10. Die Kappe ist ein Schalter in den Einstellungen ------------------

const kappe = document.querySelector("#max-concurrent-input");
pruefe("Feld für gleichzeitige Aufträge", kappe !== null);
pruefe("das Feld zeigt die gespeicherte Kappe", kappe?.value === "3", kappe?.value);

kappe.value = "5";
fetches.length = 0;
document.querySelector("#save-settings-btn").click();
await ruhen(8);
const gespeichert = fetches.find((f) => f.schluessel === "POST /api/config");
const gesendet = gespeichert ? JSON.parse(gespeichert.body) : {};
pruefe("Speichern schickt die Kappe mit", gesendet.dispatch?.max_concurrent === 5, gespeichert?.body);
pruefe("und behält die Harness-Routen dabei", (gesendet.clis || []).length === 3);

console.log(`\n${bestanden.length} bestanden, ${gefallen.length} fehlgeschlagen`);
process.exitCode = gefallen.length === 0 ? 0 : 1;
