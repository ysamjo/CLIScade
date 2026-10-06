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
  "GET /api/status": { health: HEALTH, clis: HEALTH },
  "GET /api/workspace": { projects: [{ name: "harness-router-gui", path: "/tmp/harness-router-gui", hasAgentsMd: true }], tasks: [] },
  "GET /api/model-presets": {},
  "GET /api/agents-md": {},
  "GET /api/skills": [],
  "GET /api/usage": {},
  "GET /api/remote": {},
  "GET /api/schedules": [],
  "GET /api/installer/status": {}
};

const frames = [];
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

console.log(`\n${bestanden.length} bestanden, ${gefallen.length} fehlgeschlagen`);
process.exitCode = gefallen.length === 0 ? 0 : 1;
