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

// Ein Harness, den das Terminal auswählen kann. Nur freebuff ist tuiOnly —
// das interaktive Terminal zeigt ausschließlich die TUI-only-CLIs, der Rest
// (Claude, Qoder, …) gehört in den Auto-Route-Dispatch.
const HEALTH = [
  { name: "Freebuff", cmd: "freebuff", available: true, version: "1.0", tuiOnly: true },
  { name: "Claude Code", cmd: "claude", available: true, version: "2.0" },
  { name: "Qoder", cmd: "qoder", available: false }
];
const MODEL_TEST_ROUTES = [
  { name: "OpenCode", harnessId: "opencode", harness: "opencode", command: "opencode", model: "Standard", enabled: true }
];

const ANTWORTEN = {
  "GET /api/status": {
    health: HEALTH,
    clis: [...HEALTH.slice(0, 2), ...MODEL_TEST_ROUTES],
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
    // Ein archivierter Auftrag aus der Liste: er darf nicht in der Seitenleiste
    // auftauchen, solange das Archiv zu ist.
    tasks: [
      {
        id: "old_task", prompt: "Auftrag aus dem Archiv", projectPath: "/tmp/proj-a",
        projectName: "proj-a", harness: "Cline", model: "plan-free",
        status: "completed", archived: true, outputHtml: ""
      },
      // Ein beendeter Auftrag mit Protokoll: ihn will der Nutzer fortsetzen.
      {
        id: "alt_lauf", prompt: "Alter Auftrag in proj-b", projectPath: "/tmp/proj-b",
        projectName: "proj-b", harness: "Cline", model: "plan-free", status: "completed",
        archived: false, timestamp: "2026-10-06T09:00:00.000Z",
        outputHtml: "<div>ALTE AUSGABE</div>"
      },
      // Ein zweiter alter Auftrag in einem anderen Ordner und Harness.
      {
        id: "alt_lauf2", prompt: "Anderer alter Auftrag in proj-c", projectPath: "/tmp/proj-c",
        projectName: "proj-c", harness: "Qoder", model: "auto", status: "completed",
        archived: false, timestamp: "2026-10-06T10:00:00.000Z",
        outputHtml: "<div>ZWEITE ALTE AUSGABE</div>"
      }
    ]
  },
  "GET /api/model-presets": {
    opencode: [
      { id: "Standard", label: "Standard" },
      { id: "opencode/fledge-alpha-free", label: "Fledge Alpha (Free Tier)" }
    ]
  },
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
  // Modell-Presets absichtlich später liefern als den Status: so wird die
  // parallele Startreihenfolge und das anschließende UI-Update abgedeckt.
  if (schluessel === "GET /api/model-presets") {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const daten = ANTWORTEN[schluessel] ?? ANTWORTEN[pfad] ?? {};
  return { ok: true, status: 200, json: async () => daten, text: async () => JSON.stringify(daten) };
};

// jsdom kennt scrollIntoView nicht; die Oberfläche rollt beim Klick auf einen Auftrag.
window.Element.prototype.scrollIntoView = () => {};

window.eval(readFileSync(join(PUBLIC, "icons.js"), "utf8"));
window.eval(readFileSync(join(PUBLIC, "konsole-schichten.js"), "utf8"));
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

pruefe("kein #connection-status mehr (grüner Punkt raus)",
  document.querySelector("#connection-status") === null);
pruefe("keine .dot-green mehr in der Oberfläche",
  document.querySelectorAll(".dot-green").length === 0);
pruefe("kein .run-pane-dot mehr an den Konsolen",
  document.querySelectorAll(".run-pane-dot").length === 0);
pruefe("kein Bild-Upload-Knopf mehr",
  document.querySelector("#image-upload-btn") === null);
pruefe("kein Voice-Knopf mehr",
  document.querySelector("#voice-input-btn") === null);
pruefe("keine Bildvorschau mehr",
  document.querySelector("#image-preview-tray") === null);
pruefe("kein Bild-Dateiinput mehr",
  document.querySelector("#image-upload-input") === null);
pruefe("Archiv-Schalter ist ein Icon",
  document.querySelector("#archive-filter-btn [data-icon='archive']") !== null);

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
pruefe("OpenCode-Modellliste erscheint auch bei verspätetem Preset-Laden",
  [...document.querySelectorAll(".model-dropdown option")].some((option) => option.value === "opencode/fledge-alpha-free"));
// Das interaktive Terminal listet nur noch die TUI-only-CLI (hier freebuff);
// die Headless-CLIs (claude, qoder) gehören in den Auto-Route-Dispatch.
pruefe("CLI-Auswahl zeigt nur die TUI-CLI (freebuff)",
  document.querySelectorAll("#interactive-cli-select option").length === 1
  && document.querySelector("#interactive-cli-select option")?.value === "freebuff");
pruefe("Freebuff lässt sich nicht als Headless-Route hinzufügen",
  document.querySelector('#new-route-harness option[value="freebuff"]') === null);
pruefe("Dispatch-Konsolen haben je ein Routing-Feld",
  document.querySelectorAll("#run-split .run-pane-routing").length === 2);
pruefe("Das globale Routing-Feld ist raus",
  document.querySelector("#harness-override") === null);
pruefe("die gemeinsame Statuszeile unter den Konsolen ist entfernt",
  document.querySelector(".prompt-box") === null
  && document.querySelector("#agents-context-pill, #route-usage-pill, #run-capacity-pill") === null);

// --- 5. Default ist Auto-Route: kein Terminal-Autostart beim Laden -------

const ws = WebSocketStub.last;
pruefe("WebSocket wurde geöffnet", ws != null);
ws.readyState = WebSocketStub.OPEN;
ws.onopen();
await ruhen(4);

pruefe("im Default-Modus kein pty_start (Auto-Route liegt vorn)",
  !frames.some((f) => f.type === "pty_start"), JSON.stringify(frames));

// --- 6. Terminal-Modus: Betreten startet, Beenden gibt frei -------------

frames.length = 0;
document.querySelector("#mode-interactive-btn").click();
// setStudioMode startet erst im nächsten Animationsframe — der kommt nicht in
// setTimeout(0)-Schritten, also kurz echt warten.
await new Promise((r) => setTimeout(r, 80));
await ruhen(6);
pruefe("Betreten des Modus startet die CLI",
  frames.some((f) => f.type === "pty_start"), JSON.stringify(frames));

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
// Zuerst in den Dispatch-Modus (entwaffnet), dann zurück — nur so stellt die
// App den Auto-Start scharf und startet die CLI neu.
document.querySelector("#mode-dispatch-btn").click();
await new Promise((r) => setTimeout(r, 80));
document.querySelector("#mode-interactive-btn").click();
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
pruefe("der Senden-Knopf bleibt während des Laufs benutzbar",
  [...document.querySelectorAll(".run-pane-send")].every((b) => b.disabled === false));

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

// --- 11. Zwei Eingabefelder: jede Konsole hat ihren eigenen Composer -----
// Ein Feld pro Konsole, weil der Nutzer sehen will, wohin der nächste Auftrag schaut:
// Text und Zielordner gehören zum Feld, nicht zur Oberfläche.

const gemeinsameEingabe = document.querySelector("#prompt-input");
pruefe("das gemeinsame Eingabefeld ist raus", gemeinsameEingabe === null);
pruefe("der gemeinsame Ausführen-Knopf ist raus", document.querySelector("#send-prompt-btn") === null);
pruefe("der Zielordner-Pill ist raus", document.querySelector("#prompt-target-folder") === null);
pruefe("jedes Feld hat ein eigenes Eingabefeld",
  document.querySelectorAll("#run-split .run-pane-input").length === 2);
pruefe("jedes Feld hat einen eigenen Senden-Knopf",
  document.querySelectorAll("#run-split .run-pane-send").length === 2);
pruefe("jedes Feld hat einen eigenen Zielordner",
  document.querySelectorAll("#run-split .run-pane-target").length === 2);
pruefe("der Zielordner nennt die Projekte",
  [...(konsole(0)?.querySelectorAll(".run-pane-target option") || [])].some((o) => o.value === "/tmp/proj-b"),
  konsole(0)?.querySelector(".run-pane-target")?.innerHTML);

const tippe = (slot, text) => { konsole(slot).querySelector(".run-pane-input").value = text; };
const ziel = (slot, pfad) => { konsole(slot).querySelector(".run-pane-target").value = pfad; };
const senden = (slot) => konsole(slot).querySelector(".run-pane-send").click();
const enter = (slot) => konsole(slot).querySelector(".run-pane-input")
  .dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
const sendungen = () => frames.filter((f) => f.type === "dispatch");

frames.length = 0;
ziel(0, "/tmp/proj-a");
tippe(0, "Erster Paneel-Auftrag");
senden(0);
await ruhen(3);
const s0 = sendungen()[0];
pruefe("Feld 1 schickt seinen eigenen Text", s0?.prompt === "Erster Paneel-Auftrag", JSON.stringify(s0));
pruefe("Feld 1 schickt in seinen eigenen Ordner", s0?.projectPath === "/tmp/proj-a", JSON.stringify(s0));

frames.length = 0;
ziel(1, "/tmp/proj-b");
tippe(1, "Zweiter Paneel-Auftrag");
enter(1);
await ruhen(3);
const s1 = sendungen()[0];
pruefe("Enter im zweiten Feld schickt von dort", s1?.prompt === "Zweiter Paneel-Auftrag", JSON.stringify(s1));
pruefe("das zweite Feld nimmt seinen eigenen Zielordner", s1?.projectPath === "/tmp/proj-b", JSON.stringify(s1));
pruefe("das erste Feld ist nach dem Senden leer",
  konsole(0).querySelector(".run-pane-input").value === "");
pruefe("das gesendete Feld ist danach leer",
  konsole(1).querySelector(".run-pane-input").value === "");

frames.length = 0;
tippe(0, "Nur Text, kein Senden");
senden(1);
await ruhen(3);
pruefe("Senden leert nur das eigene Feld",
  konsole(0).querySelector(".run-pane-input").value === "Nur Text, kein Senden");
pruefe("und schickt nicht den Text des anderen Feldes",
  !sendungen().some((f) => f.prompt === "Nur Text, kein Senden"), JSON.stringify(sendungen()));

// --- 12. Die Bezahlnutzung ist aus den Einstellungen raus ----------------

pruefe("keine Bezahl-Spalte in der Kopfzeile", document.querySelector(".col-paid") === null);
pruefe("keine Bezahl-Kästchen in den Routen",
  document.querySelectorAll("#harness-config-list .harness-paid-chk").length === 0);
pruefe("pro Route bleibt nur das Aktiv-Kästchen",
  [...document.querySelectorAll("#harness-config-list .harness-row")]
    .every((row) => row.querySelectorAll('input[type="checkbox"]').length === 1),
  document.querySelector("#harness-config-list .harness-row")?.innerHTML);

// --- 13. Tasks lassen sich archivieren -----------------------------------

pruefe("Archiv-Schalter in der Seitenleiste", document.querySelector("#archive-filter-btn") !== null);
pruefe("archivierte Aufträge sind standardmäßig raus",
  document.querySelector('.task-item[data-task-id="old_task"]') === null);

fetches.length = 0;
document.querySelector('.task-item[data-task-id="task_b"] .task-archive-btn')?.click();
await ruhen(6);
const archiviert = fetches.find((f) => f.schluessel === "POST /api/tasks/archive");
pruefe("Archivieren meldet die Task-ID an den Server",
  JSON.parse(archiviert?.body || "{}").taskId === "task_b", archiviert?.body);
pruefe("und bittet ums Einpacken",
  JSON.parse(archiviert?.body || "{}").archived === true, archiviert?.body);
sag({ type: "task_archived", taskId: "task_b", archived: true });
await ruhen(4);
pruefe("der archivierte Auftrag verschwindet aus der Liste",
  document.querySelector('.task-item[data-task-id="task_b"]') === null);

document.querySelector("#archive-filter-btn").click();
await ruhen(4);
pruefe("das Archiv zeigt den eingepackten Auftrag",
  document.querySelector('.task-item[data-task-id="task_b"]') !== null);
pruefe("und den bereits archivierten aus der Historie",
  document.querySelector('.task-item[data-task-id="old_task"]') !== null);
pruefe("im Archiv gibt es ein Zurück",
  document.querySelector('.task-item[data-task-id="task_b"] .task-restore-btn') !== null);

fetches.length = 0;
document.querySelector('.task-item[data-task-id="old_task"] .task-restore-btn')?.click();
await ruhen(6);
const zurueck = fetches.find((f) => f.schluessel === "POST /api/tasks/archive");
pruefe("Zurück meldet archived:false",
  JSON.parse(zurueck?.body || "{}").archived === false, zurueck?.body);
document.querySelector("#archive-filter-btn").click();
await ruhen(4);
pruefe("zurückgekehrt steht der Auftrag wieder in der Liste",
  document.querySelector('.task-item[data-task-id="old_task"]') !== null);
pruefe("ein laufender Auftrag hat keinen Archiv-Knopf",
  document.querySelector('.task-item[data-task-id="task_a"] .task-archive-btn') === null);

// --- 14. Alter Auftrag anklicken: die Konsole übernimmt sein Ziel ----------
// Das Studio hat zwei Achsen: den Tab und den Modus. Der Klick entschied bisher nur
// den Tab, also blieb das Protokoll hinter dem Terminal versteckt. Fortsetzen heißt
// außerdem: Das Feld_ordner, Harness und Modell des alten Laufs — der neue Auftrag
// startet dort, wo der alte endete, und das alte Protokoll bleibt darüber stehen.

document.querySelector("#mode-interactive-btn").click();
await new Promise((r) => setTimeout(r, 80));
await ruhen(4);
pruefe("vor dem Klick ist das Terminal offen",
  document.querySelector("#dispatch-panel")?.classList.contains("hidden") === true);

const altZeile = document.querySelector('.task-item[data-task-id="alt_lauf"]');
pruefe("der alte Auftrag steht in der Seitenleiste", altZeile !== null);

altZeile?.click();
await ruhen(6);
pruefe("Klick auf den Auftrag zeigt die Konsolen",
  document.querySelector("#dispatch-panel")?.classList.contains("hidden") === false);
pruefe("Klick klappt das Terminal zu",
  document.querySelector("#interactive-panel")?.classList.contains("hidden") === true);

const folgeSlot = [0, 1].find((i) => (konsole(i)?.textContent || "").includes("ALTE AUSGABE"));
pruefe("das alte Protokoll ist in einer Konsole sichtbar", folgeSlot !== undefined);
const folge = konsole(folgeSlot);
pruefe("das Feld nennt den alten Auftrag",
  /Alter Auftrag/.test(folge?.querySelector(".run-pane-title")?.textContent || ""),
  folge?.querySelector(".run-pane-title")?.textContent);
// Harness und Modell sind die Art des Laufs — sie stehen als Marke daneben, damit
// zwei Konsolen desselben Harness trotzdem unterscheidbar bleiben.
pruefe("die Marke nennt den alten Harness",
  /Cline · plan-free/.test(folge?.querySelector(".run-pane-harness")?.textContent || ""),
  folge?.querySelector(".run-pane-harness")?.textContent);
pruefe("das Feld zeigt den Ordner des alten Auftrags",
  folge?.querySelector(".run-pane-target")?.value === "/tmp/proj-b",
  folge?.querySelector(".run-pane-target")?.value);

const anderes = folgeSlot === 0 ? 1 : 0;
frames.length = 0;
tippe(anderes, "Feld ohne alten Auftrag");
enter(anderes);
await ruhen(4);
pruefe("ein Feld ohne alten Auftrag nimmt das globale Routing",
  sendungen()[0]?.harnessOverride === "auto" && sendungen()[0]?.modelOverride === undefined,
  JSON.stringify(sendungen()[0]));

frames.length = 0;
tippe(folgeSlot, "Fortsetzung: noch einen Test schreiben");
enter(folgeSlot);
await ruhen(4);
const fort = sendungen()[0];
pruefe("Enter schickt in den Ordner des alten Auftrags",
  fort?.projectPath === "/tmp/proj-b", JSON.stringify(fort));
pruefe("Enter nimmt den Harness des alten Auftrags",
  fort?.harnessOverride === "Cline", JSON.stringify(fort));
pruefe("Enter nimmt das Modell des alten Auftrags",
  fort?.modelOverride === "plan-free", JSON.stringify(fort));

sag({ type: "task_created", taskId: "task_f1", task: auftrag("task_f1", "proj-b", "Fortsetzung: noch einen Test schreiben") });
sag({ type: "route_selected", taskId: "task_f1", harness: "Cline", command: "cline", model: "plan-free" });
sag({ type: "output", taskId: "task_f1", html: "NEUE AUSGABE" });
await ruhen(4);
pruefe("das alte Protokoll bleibt über dem neuen stehen",
  /ALTE AUSGABE/.test(konsole(folgeSlot)?.textContent || "") &&
  /NEUE AUSGABE/.test(konsole(folgeSlot)?.textContent || ""),
  konsole(folgeSlot)?.textContent);

frames.length = 0;
tippe(folgeSlot, "Und noch ein Auftrag");
enter(folgeSlot);
await ruhen(4);
pruefe("das Feld bleibt für weitere Aufträge am alten Ziel",
  sendungen()[0]?.harnessOverride === "Cline" && sendungen()[0]?.projectPath === "/tmp/proj-b",
  JSON.stringify(sendungen()[0]));

// Der Folgauftrag zieht in sein Feld zurück, auch wenn das andere Feld gerade
// einen Platz frei hätte — das Protokoll soll nicht allein stehen bleiben.
sag({ type: "done", taskId: "task_c" });
await ruhen(3);
const zweiteZeile = document.querySelector('.task-item[data-task-id="alt_lauf2"]');
pruefe("der zweite alte Auftrag steht in der Seitenleiste", zweiteZeile !== null);
zweiteZeile?.click();
await ruhen(4);
const zweiterSlot = folgeSlot === 0 ? 1 : 0;
pruefe("der zweite alte Auftrag zieht in das andere Feld",
  /ZWEITE ALTE AUSGABE/.test(konsole(zweiterSlot)?.textContent || ""),
  konsole(zweiterSlot)?.textContent?.slice(0, 80));
sag({ type: "done", taskId: "task_f1" });
await ruhen(3);
frames.length = 0;
tippe(zweiterSlot, "Folgauftrag im zweiten Feld");
enter(zweiterSlot);
await ruhen(4);
pruefe("der Folgauftrag nimmt den Harness des zweiten alten Auftrags",
  sendungen()[0]?.harnessOverride === "Qoder" && sendungen()[0]?.projectPath === "/tmp/proj-c",
  JSON.stringify(sendungen()[0]));
sag({ type: "task_created", taskId: "task_f2", task: auftrag("task_f2", "proj-c", "Folgauftrag im zweiten Feld") });
sag({ type: "route_selected", taskId: "task_f2", harness: "Qoder", command: "qoder", model: "auto" });
sag({ type: "output", taskId: "task_f2", html: "NEUE AUSGABE ZWEI" });
await ruhen(4);
pruefe("der Folgauftrag bleibt im Feld seines alten Protokolls",
  /ZWEITE ALTE AUSGABE/.test(konsole(zweiterSlot)?.textContent || "") &&
  /NEUE AUSGABE ZWEI/.test(konsole(zweiterSlot)?.textContent || ""),
  konsole(zweiterSlot)?.textContent?.replace(/\s+/g, ' ').slice(0, 120));
pruefe("und das andere Feld bleibt unberührt",
  !(konsole(folgeSlot)?.textContent || "").includes("NEUE AUSGABE ZWEI"));

// Wer absichtlich woanders hin schickt, verlässt die Fortsetzung.
ziel(zweiterSlot, "/tmp/proj-a");
frames.length = 0;
tippe(zweiterSlot, "Anderer Ordner, anderes Routing");
enter(zweiterSlot);
await ruhen(4);
const manuell = sendungen()[0];
pruefe("ein anderer Ordner löst die Fortsetzung ab",
  manuell?.projectPath === "/tmp/proj-a" && manuell?.harnessOverride === "auto",
  JSON.stringify(manuell));
pruefe("ohne Fortsetzung geht kein Modell über", manuell?.modelOverride === undefined, JSON.stringify(manuell));

// ＋ heißt Anfang: auch im Ordner des alten Auftrags leiht kein Historienlauf das Ziel.
// Das andere Feld bleibt solange belegt, bis freeSlot sicher das fortgesetzte Feld wählt.
sag({ type: "done", taskId: "task_f2", exitCode: 0, message: "Fertig" });
await ruhen(3);
sag({ type: "task_created", taskId: "task_h", task: auftrag("task_h", "proj-a", "Lauf im anderen Feld") });
sag({ type: "route_selected", taskId: "task_h", harness: "Qoder", command: "qoder", model: "auto" });
await ruhen(4);
document.querySelector("#mode-interactive-btn").click();
await new Promise((r) => setTimeout(r, 80));
frames.length = 0;
document.querySelector('.project-node[data-path="/tmp/proj-c"] .add-task-btn')?.click();
await ruhen(3);
pruefe("＋ öffnet die Konsole",
  document.querySelector("#dispatch-panel")?.classList.contains("hidden") === false);
const aktiverSlot = [0, 1].find((i) => konsole(i).querySelector(".run-pane-input") === document.activeElement);
pruefe("＋ stellt das fortgesetzte Feld bereit",
  aktiverSlot === zweiterSlot && konsole(zweiterSlot).querySelector(".run-pane-target").value === "/tmp/proj-c",
  String(aktiverSlot));
tippe(zweiterSlot, "Frischer Auftrag im alten Ordner");
enter(zweiterSlot);
await ruhen(4);
pruefe("＋ im selben Ordner ist ein Anfang statt einer Fortsetzung",
  sendungen()[0]?.harnessOverride === "auto", JSON.stringify(sendungen()[0]));

// --- 15. Die Konsole schichtet: Gedanke, Werkzeug, Antwort ---------------
// Die Formen kommen aus den echten Protokollen in studio-tasks.json: Claude schreibt
// eine &lt;think&gt;-Region, die erst nach zwei freien Zeilen endet; cline und freebuff
// schreiben [thinking], [run_commands], ⎿-Folgezeilen und Tokens-Zeilen. Alles vorher
// ungeordnet in einer Textwüste.

document.querySelector("#mode-dispatch-btn")?.click();
await ruhen(3);

const CLAUDE_CHUNK =
  '<div class="route-banner" style=""><span class="badge badge-accent">Priorität #1</span>' +
  '<span><strong>Harness:</strong> Claude Code (claude)</span></div>\n\n' +
  '&lt;think&gt;Der Nutzer fragt nach RAM.<br/><br/>Ich schaue ins Portfolio.' +
  '<br/><br/><br/>ANTWORT-LAYER: 2 GB<br/><br/>Fertig.<br/>';

// Beide Felder müssen frei sein: sonst hängt der neue Lauf hinter einem alten in
// demselben Ordner, und seine Ausgabe liegt in einer anderen Konsole als der Marker.
sag({ type: "done", taskId: "task_a", exitCode: 0, message: "Fertig" });
sag({ type: "done", taskId: "task_h", exitCode: 0, message: "Fertig" });
await ruhen(3);

sag({ type: "task_created", taskId: "task_l", task: auftrag("task_l", "proj-a", "LAYER-MARKER Claude") });
sag({ type: "route_selected", taskId: "task_l", harness: "Claude Code", command: "claude", model: "Standard" });
sag({ type: "output", taskId: "task_l", html: CLAUDE_CHUNK });
await ruhen(4);

// Das Feld gehört dem Lauf, der mit LAYER-MARKER betitelt ist — welches der beiden
// Konsolenfelder das ist, entscheidet der freie Platz, nicht der Test.
const slotVon = (marker) => [0, 1].find((i) => (konsole(i)?.textContent || "").includes(marker)) ?? 0;
const feld = () => konsole(slotVon("LAYER-MARKER"));
const body = () => feld()?.querySelector(".run-pane-body");
const inKeinemOrdner = (text) =>
  [...(body()?.querySelectorAll("details") || [])].every((d) => !d.textContent.includes(text));

const denk = body()?.querySelector("details.ko-denke");
pruefe("der Gedankengang sitzt in einem Ordner", denk !== null && denk !== undefined, body()?.innerHTML?.slice(0, 200));
pruefe("der Ordner ist automatisch zugeklappt", denk && !denk.hasAttribute("open"), denk?.outerHTML?.slice(0, 120));
pruefe("beide Gedankenzeilen bleiben im Ordner",
  /fragt nach RAM/.test(denk?.textContent || "") && /Portfolio/.test(denk?.textContent || ""));
pruefe("die Antwort liegt außerhalb jedes Ordners", inKeinemOrdner("ANTWORT-LAYER: 2 GB"));
pruefe("die Antwort steht in der Antwortebene",
  /ANTWORT-LAYER: 2 GB/.test(body()?.querySelector(".ko-antwort")?.textContent || ""),
  body()?.querySelector(".ko-antwort")?.textContent);
pruefe("das Routing-Banner bleibt ein ganzes Element",
  body()?.querySelectorAll(".route-banner").length === 1 &&
  body()?.querySelector(".route-banner .badge") !== null,
  body()?.querySelector(".route-banner")?.outerHTML?.slice(0, 160));

const CLINE_CHUNK =
  "ZWISCHENTEXT-EIN<br/>" +
  '<span style="color:#7fa3ad">[run_commands]</span> ls -la | head -n 100<br/>' +
  '<span style="color:#555">&#x23BF; </span>total 496 drwxr-xr-x<br/>' +
  "[thinking] Analysing build config.<br/>" +
  "ZWISCHENTEXT-ZWEI<br/>" +
  "Tokens: 4,090 (2,446 Prompt / 1,644 Antwort)<br/>";
sag({ type: "output", taskId: "task_l", html: CLINE_CHUNK });
await ruhen(4);

const werkzeug = body()?.querySelector("details.ko-werkzeug");
pruefe("Werkzeugaufruf und ⎿-Zeile sammeln sich in einem Ordner",
  werkzeug !== null && /\[run_commands\]/.test(werkzeug.textContent) && /total 496/.test(werkzeug.textContent),
  werkzeug?.textContent);
pruefe("der Werkzeugordner ist zu und zählt seine Zeilen",
  werkzeug && !werkzeug.hasAttribute("open") && /2 Zeilen/.test(werkzeug.querySelector(".ko-kopf")?.textContent || ""),
  werkzeug?.querySelector(".ko-kopf")?.textContent);
pruefe("die [thinking]-Zeile kommt in einen Gedankengang-Ordner",
  [...(body()?.querySelectorAll("details.ko-denke") || [])].some((d) => /Analysing build config/.test(d.textContent)),
  [...(body()?.querySelectorAll("details.ko-denke") || [])].map((d) => d.textContent).join(" | "));
pruefe("Tokens-Zeile wird Randnotiz",
  /Tokens: 4,090/.test(body()?.querySelector("details.ko-notiz")?.textContent || ""),
  body()?.querySelector("details.ko-notiz")?.textContent);
pruefe("die Zwischentexte bleiben sichtbar",
  inKeinemOrdner("ZWISCHENTEXT-EIN") && inKeinemOrdner("ZWISCHENTEXT-ZWEI"));

// Faltzustand: jeder Chunk malt das ganze Feld neu — wer einen Ordner aufmacht,
// darf ihn nicht beim nächsten Chunk wieder verloren haben.
const ersterDenk = body()?.querySelector("details.ko-denke");
ersterDenk.open = true;
ersterDenk.dispatchEvent(new window.Event("toggle"));
await ruhen(2);
sag({ type: "output", taskId: "task_l", html: "SPAETER-CHUNK<br/>" });
await ruhen(4);
pruefe("ein aufgeklappter Ordner bleibt offen",
  body()?.querySelector("details.ko-denke")?.open === true,
  body()?.querySelector("details.ko-denke")?.outerHTML?.slice(0, 120));
pruefe("ein zugeklappter Ordner bleibt zu",
  body()?.querySelector("details.ko-werkzeug")?.open === false);

// Ein Denkordner, der noch mitten im Lauf wächst, meldet das — sonst wirkt die
// Konsole leer, obwohl der Harness gerade denkt.
sag({ type: "output", taskId: "task_l", html: "&lt;think&gt;offener Gedanke ohne Ende<br/>" });
await ruhen(4);
pruefe("ein wachsender Gedankengang-Ordner ist als lebendig markiert",
  body()?.querySelector("details.ko-denke.ko-wachsend") !== null,
  [...(body()?.querySelectorAll("details") || [])].map((d) => d.className).join(" | "));
sag({ type: "done", taskId: "task_l", exitCode: 0, message: "Fertig" });
await ruhen(4);
pruefe("nach dem Lauf ist kein Ordner mehr lebendig",
  body()?.querySelector("details.ko-wachsend") === null);
pruefe("nach dem Lauf bleiben die Ordner zugeklappt, die der Nutzer nicht öffnete",
  [...(body()?.querySelectorAll("details") || [])].filter((d) => d.open).length <= 1);

// --- 16. Ein Klick auf einen Auftrag zeigt sein Feld ---------------------
// Zwei Konsolen desselben Harness waren nicht zu unterscheiden: der Titel trug nur
// "harness · modell". Jetzt trägt das Feld den Auftrag, die Art steht als Marke
// daneben, und die Seitenleiste sagt, in welchem Feld der Lauf liegt.
const layerSlot = slotVon("LAYER-MARKER");
pruefe("das Feld trägt den Auftrag als Titel",
  /LAYER-MARKER/.test(konsole(layerSlot)?.querySelector(".run-pane-title")?.textContent || ""),
  konsole(layerSlot)?.querySelector(".run-pane-title")?.textContent);
pruefe("die Marke trägt Harness und Modell",
  /Claude Code · Standard/.test(konsole(layerSlot)?.querySelector(".run-pane-harness")?.textContent || ""),
  konsole(layerSlot)?.querySelector(".run-pane-harness")?.textContent);

const seitenItem = () => document.querySelector('.task-item[data-task-id="task_l"]');
pruefe("die Seitenleiste nennt das Feld des Laufs",
  seitenItem()?.querySelector(".task-konsole")?.textContent === `Konsole ${layerSlot + 1}`,
  seitenItem()?.querySelector(".task-konsole")?.textContent);

document.querySelector("#mode-interactive-btn")?.click();
await ruhen(2);
seitenItem()?.click();
await ruhen(4);
const markiert = [0, 1].filter((i) => konsole(i)?.classList.contains("ist-fokus"));
pruefe("Klick markiert genau das Feld des Auftrags",
  markiert.length === 1 && markiert[0] === layerSlot, JSON.stringify(markiert));
pruefe("Klick auf einen liegenden Auftrag holt die Konsole wieder hervor",
  document.querySelector("#dispatch-panel")?.classList.contains("hidden") === false);

console.log(`\n${bestanden.length} bestanden, ${gefallen.length} fehlgeschlagen`);
process.exitCode = gefallen.length === 0 ? 0 : 1;
