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
// Kein Browser nötig: WebSocket und fetch werden gestubbt, fetch über eine
// Routentabelle.

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

// Die Harnesses, die der Server im Status meldet. Alle sind headless: das
// interaktive Terminal gibt es nicht mehr, jeder Harness läuft über den Dispatch.
const HEALTH = [
  { name: "Claude Code", cmd: "claude", available: true, version: "2.0" },
  { name: "Qoder", cmd: "qoder", available: false }
];
const MODEL_TEST_ROUTES = [
  { name: "OpenCode", harnessId: "opencode", harness: "opencode", command: "opencode", model: "Standard", enabled: true }
];

const ANTWORTEN = {
  "GET /api/access": { authorized: true, local: true },
  "GET /api/status": {
    health: HEALTH,
    clis: [...HEALTH.slice(0, 2), ...MODEL_TEST_ROUTES],
    dispatch: { max_concurrent: 3 }
  },
  "GET /api/workspace": {
    projects: [
      { name: "cliscade", path: "/tmp/cliscade", hasAgentsMd: true },
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

// --- Seite bauen ---------------------------------------------------------

const dom = new JSDOM(readFileSync(join(PUBLIC, "index.html"), "utf8"), {
  url: "http://localhost:3000/",
  runScripts: "outside-only",
  // jsdom liefert requestAnimationFrame nur mit dieser Option; die Oberfläche
  // hängt daran beim Aufbau der Konsolenfelder.
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
window.eval(readFileSync(join(PUBLIC, "task-state.js"), "utf8"));
window.eval(readFileSync(join(PUBLIC, "image-composer.js"), "utf8"));
window.eval(readFileSync(join(PUBLIC, "app.js"), "utf8"));
if (document.readyState !== "loading") {
  // Der Zuhörer auf DOMContentLoaded kam je nach jsdom-Timing zu spät.
  document.dispatchEvent(new window.Event("DOMContentLoaded"));
}
await ruhen(12);

// --- 1. Die Top-Leiste ist raus -----------------------------------------

pruefe("Die Oberfläche heißt CLIscade", document.title === "CLIscade" && document.querySelector(".logo-text")?.textContent === "CLIscade");
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
pruefe("#mobile-sidebar-toggle sitzt in der Studio-Leiste",
  drawer?.parentElement?.classList.contains("studio-bar") === true);

// --- 3. Das interaktive Terminal ist raus --------------------------------
// Kein Umschalter, kein xterm, kein PTY: die Oberfläche dispatcht nur noch.

pruefe("kein Modus-Umschalter mehr",
  document.querySelector("#mode-interactive-btn") === null
  && document.querySelector("#mode-dispatch-btn") === null);
pruefe("kein interaktives Panel mehr",
  document.querySelector("#interactive-panel") === null
  && document.querySelector("#xterm-container") === null);
pruefe("keine Terminal-Knöpfe mehr",
  document.querySelector("#interactive-stop-btn") === null
  && document.querySelector("#interactive-takeover-btn") === null
  && document.querySelector("#interactive-clear-btn") === null);
pruefe("kein Terminal-Gerüst mehr",
  document.querySelector(".terminal-header") === null
  && document.querySelector(".terminal-actions") === null);
pruefe("kein Terminal-Skript mehr im DOM",
  [...document.querySelectorAll("script[src]")].every((s) => !/xterm/.test(s.src)));

// --- 4. Das Skript ist ohne Fehler durchgelaufen -------------------------

pruefe("keine JS-Fehler beim Bootstrap", fehler.length === 0, fehler.join(" | "));
pruefe("OpenCode-Modellliste erscheint auch bei verspätetem Preset-Laden",
  [...document.querySelectorAll(".model-dropdown option")].some((option) => option.value === "opencode/fledge-alpha-free"));
pruefe("keine CLI-Auswahl des Terminals mehr",
  document.querySelector("#interactive-cli-select") === null);
pruefe("die Routen-Auswahl kennt genau die dreizehn Registry-Harnesses",
  [...document.querySelectorAll("#new-route-harness option")].map((o) => o.value).join(",")
    === "claude_code,codex,cline,opencode,antigravity_cli,qoder,codebuddy,cursor,junie,kilo,copilot,kiro,vibe",
  [...document.querySelectorAll("#new-route-harness option")].map((o) => o.value).join(","));
pruefe("Dispatch-Konsolen haben je ein Routing-Feld",
  document.querySelectorAll("#run-split .run-pane-routing").length === 4);
pruefe("Das globale Routing-Feld ist raus",
  document.querySelector("#harness-override") === null);
pruefe("die gemeinsame Statuszeile unter den Konsolen ist entfernt",
  document.querySelector(".prompt-box") === null
  && document.querySelector("#agents-context-pill, #route-usage-pill, #run-capacity-pill") === null);

// --- 5. Kein PTY mehr: die Oberfläche spricht nur noch Dispatch ----------
// Der interaktive Modus ist raus. Auf keinem Pfad — Laden, Verbinden,
// Neuverbinden — darf ein pty_*-Frame entstehen.

const ws = WebSocketStub.last;
pruefe("WebSocket wurde geöffnet", ws != null);
ws.readyState = WebSocketStub.OPEN;
ws.onopen();
await ruhen(4);

pruefe("kein pty-Frame beim Laden",
  !frames.some((f) => String(f.type).startsWith("pty_")), JSON.stringify(frames));
pruefe("der Run-Pool wird beim Verbinden gelesen",
  fetches.some((f) => f.schluessel === "GET /api/runs"),
  JSON.stringify(fetches.map((f) => f.schluessel)));

// --- 6. Server-Neustart: die Oberfläche verbindet sich neu ----------------

fetches.length = 0;
ws.onclose();
await ruhen(2100); // die App verbindet sich nach zwei Sekunden neu

const ws2 = WebSocketStub.last;
pruefe("Neuverbindung opened", ws2 != null && ws2 !== ws);
ws2.readyState = WebSocketStub.OPEN;
ws2.onopen();
await ruhen(8);
pruefe("nach der Neuverbindung wird der Run-Pool neu gelesen",
  fetches.some((f) => f.schluessel === "GET /api/runs"),
  JSON.stringify(fetches.map((f) => f.schluessel)));
pruefe("auch nach der Neuverbindung kein pty-Frame",
  !frames.some((f) => String(f.type).startsWith("pty_")), JSON.stringify(frames));

// --- 7. Split-View: zwei Aufträge nebeneinander -------------------------
// Der Composer sperrt nicht mehr: Aufträge werden schnell nacheinander geschickt und
// laufen nebeneinander. Meldungen sind über die Task-ID zugeordnet und rendereren
// ausschließlich ihr eigenes Feld.

const konsole = (i) => document.querySelector(`#run-split .run-pane:nth-child(${i + 1})`);
const auftrag = (id, ordner, name) => ({
  id, prompt: name, projectPath: `/tmp/${ordner}`, projectName: ordner,
  harness: "Cline", model: "plan-free", status: "queued", outputHtml: ""
});
const A = auftrag("task_a", "proj-a", "Erster Auftrag");
const B = auftrag("task_b", "proj-b", "Zweiter Auftrag");
const C = auftrag("task_c", "proj-c", "Dritter Auftrag");
const sag = (json) => ws2.onmessage({ data: JSON.stringify(json) });

pruefe("#run-split existiert", document.querySelector("#run-split") !== null);
pruefe("Nur die erste Konsole ist am Anfang sichtbar",
  !konsole(0).hidden && konsole(1).hidden && konsole(2).hidden && konsole(3).hidden);
pruefe("Ordnerauswahl sitzt als Titel im Konsolenkopf", [...document.querySelectorAll(".run-pane")].every(p => p.querySelector(".run-pane-head .run-pane-target") && !p.querySelector(".run-pane-toolbar .run-pane-target")));
pruefe("vier Konsolenfelder", document.querySelectorAll("#run-split .run-pane").length === 4);
pruefe("jedes Feld hat eigene Ausgabe",
  document.querySelectorAll("#run-split .run-pane-body").length === 4);
pruefe("jedes Feld hat eigenen Abbrechen-Knopf",
  document.querySelectorAll("#run-split .run-pane-cancel").length === 4);
pruefe("jedes Feld hat einen Schließen-Knopf",
  [...document.querySelectorAll(".run-pane")].every(p => p.querySelector(".run-pane-close")?.getAttribute("aria-label")));
pruefe("der Schließen-Knopf bleibt bei einer Konsole verborgen",
  konsole(0).querySelector(".run-pane-close").hidden);
pruefe("Kopieren und Abbrechen sind beschriftete Icons unten", [...document.querySelectorAll(".run-pane")].every(p => ["copy", "cancel"].every(action => {
  const button = p.querySelector(`.run-pane-${action}`);
  return button.closest(".run-pane-actions") && button.querySelector("svg") && button.getAttribute("aria-label");
})));
pruefe("die Einzelkonsole ist raus", document.querySelector("#terminal-body") === null);
pruefe("das globale Routing-Banner ist raus", document.querySelector("#active-routing-card") === null);

frames.length = 0;
sag({ type: "task_created", taskId: A.id, task: A });
sag({ type: "route_selected", taskId: A.id, harness: "Cline", command: "cline", model: "plan-free", agentsInfo: "AGENTS.md aktiv" });
sag({ type: "output", taskId: A.id, html: "AUSGABE-A" });
await ruhen(4);

pruefe("Ein einzelner Task öffnet keine zweite Konsole", konsole(1).hidden);
pruefe("Der Ordnertitel folgt dem geöffneten Task", konsole(0).querySelector(".run-pane-target").value === "/tmp/proj-a");
pruefe("Auftrag A sitzt im ersten Feld", (konsole(0)?.textContent || "").includes("AUSGABE-A"), konsole(0)?.innerHTML);
pruefe("der Senden-Knopf bleibt während des Laufs benutzbar",
  [...document.querySelectorAll(".run-pane-send")].every((b) => b.disabled === false));

frames.length = 0;
sag({ type: "task_created", taskId: B.id, task: B });
sag({ type: "route_selected", taskId: B.id, harness: "Qoder", command: "qoder", model: "auto" });
sag({ type: "output", taskId: B.id, html: "AUSGABE-B" });
await ruhen(4);

pruefe("Der zweite geöffnete Task macht die zweite Konsole sichtbar", !konsole(1).hidden);
pruefe("Auftrag B bekommt das zweite Feld", (konsole(1)?.textContent || "").includes("AUSGABE-B"));
pruefe("B schreibt nicht in A's Feld", !(konsole(0)?.textContent || "").includes("AUSGABE-B"));
pruefe("A's Ausgabe bleibt stehen", (konsole(0)?.textContent || "").includes("AUSGABE-A"));
pruefe("jedes Feld nennt seinen Harness",
  /Cline/.test(konsole(0)?.querySelector(".run-pane-harness")?.title || "") && /Qoder/.test(konsole(1)?.querySelector(".run-pane-harness")?.title || ""));
// Die Seitenleiste weiß es vorher (erste Route der Kette) — route_selected bessert nach.
pruefe("die Seitenleiste zeigt den gewählten Harness",
  document.querySelector('.task-item[data-task-id="task_b"] .task-harness-icon')?.getAttribute('src') === '/harness-icons/qoder.svg',
  document.querySelector('.task-item[data-task-id="task_b"]')?.textContent);
pruefe("die Seitenleiste markiert den Lauf als aktiv",
  /◐/.test(document.querySelector('.task-item[data-task-id="task_b"]')?.textContent || ""),
  document.querySelector('.task-item[data-task-id="task_b"]')?.textContent);
pruefe("das Raster kennt zwei sichtbare Konsolen",
  document.querySelector("#run-split")?.dataset.panes === "2");
pruefe("ab zwei Konsolen klappt die Seitenleiste ein",
  document.querySelector(".app-layout")?.classList.contains("sidebar-collapsed") === true);
pruefe("der Ausklapp-Griff erscheint im eingeklappten Zustand",
  document.querySelector("#sidebar-expand")?.hidden === false);
document.querySelector("#sidebar-expand")?.click();
await ruhen(2);
pruefe("ein Klick klappt die Seitenleiste wieder aus",
  document.querySelector(".app-layout")?.classList.contains("sidebar-collapsed") === false);
document.querySelector("#sidebar-collapse")?.click();
await ruhen(2);
pruefe("ein Klick klappt die Seitenleiste wieder ein",
  document.querySelector(".app-layout")?.classList.contains("sidebar-collapsed") === true);

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

pruefe("der dritte Auftrag bekommt ein eigenes, freies Feld", (konsole(2)?.textContent || "").includes("AUSGABE-C"));
pruefe("C verdrängt A nicht aus dem laufenden Feld", (konsole(0)?.textContent || "").includes("AUSGABE-A"));
pruefe("C lässt B's Ausgabe stehen", (konsole(1)?.textContent || "").includes("AUSGABE-B"));

let copiedOutput;
Object.defineProperty(window.navigator, "clipboard", {configurable:true, value:{writeText:async text => { copiedOutput = text; }}});
const copyButton = konsole(0).querySelector(".run-pane-copy");
const outputBody = konsole(0).querySelector(".run-pane-body");
// jsdom hat kein gerendertes innerText; der Browser liefert es nativ.
Object.defineProperty(outputBody, "innerText", {configurable:true, value:"AUSGABE-A"});
copyButton.click();
await ruhen(2);
pruefe("Kopieren überträgt nur die eigene Ausgabe und behält das Icon", copiedOutput === "AUSGABE-A" && copyButton.querySelector("svg") && copyButton.getAttribute("aria-label") === "Ausgabe kopiert");
window.navigator.clipboard.writeText = async () => { throw new Error("Verweigert"); };
copyButton.click();
await ruhen(2);
pruefe("Fehlgeschlagenes Kopieren meldet keinen Erfolg", copyButton.title === "Kopieren fehlgeschlagen" && copyButton.querySelector("svg"));

konsole(0)?.querySelector(".run-pane-cancel")?.click();
await ruhen(2);
pruefe("Klick auf Abbrechen meldet genau diese Task-ID",
  frames.some((f) => f.type === "cancel" && f.taskId === A.id), JSON.stringify(frames));

// --- 8. Die Kappe ist ein Schalter in den Einstellungen ------------------

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

// --- 9. Zwei Eingabefelder: jede Konsole hat ihren eigenen Composer -----
// Ein Feld pro Konsole, weil der Nutzer sehen will, wohin der nächste Auftrag schaut:
// Text und Zielordner gehören zum Feld, nicht zur Oberfläche.

const gemeinsameEingabe = document.querySelector("#prompt-input");
pruefe("das gemeinsame Eingabefeld ist raus", gemeinsameEingabe === null);
pruefe("der gemeinsame Ausführen-Knopf ist raus", document.querySelector("#send-prompt-btn") === null);
pruefe("der Zielordner-Pill ist raus", document.querySelector("#prompt-target-folder") === null);
pruefe("jedes Feld hat ein eigenes Eingabefeld",
  document.querySelectorAll("#run-split .run-pane-input").length === 4);
pruefe("jedes Feld hat einen eigenen Senden-Knopf",
  document.querySelectorAll("#run-split .run-pane-send").length === 4);
pruefe("jedes Feld hat einen eigenen Zielordner",
  document.querySelectorAll("#run-split .run-pane-target").length === 4);
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

// --- 10. Die Bezahlnutzung ist aus den Einstellungen raus ----------------

pruefe("keine Bezahl-Spalte in der Kopfzeile", document.querySelector(".col-paid") === null);
pruefe("keine Bezahl-Kästchen in den Routen",
  document.querySelectorAll("#harness-config-list .harness-paid-chk").length === 0);
pruefe("pro Route bleibt nur das Aktiv-Kästchen",
  [...document.querySelectorAll("#harness-config-list .harness-row")]
    .every((row) => row.querySelectorAll('input[type="checkbox"]').length === 1),
  document.querySelector("#harness-config-list .harness-row")?.innerHTML);

// --- 11. Tasks lassen sich archivieren -----------------------------------

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

// --- 12. Alter Auftrag anklicken: die Konsole übernimmt sein Ziel ----------
// Fortsetzen heißt: Das Feld erbt Ordner, Harness und Modell des alten Laufs — der
// neue Auftrag startet dort, wo der alte endete, und das alte Protokoll bleibt
// darüber stehen.

const altZeile = document.querySelector('.task-item[data-task-id="alt_lauf"]');
pruefe("der alte Auftrag steht in der Seitenleiste", altZeile !== null);

altZeile?.click();
await ruhen(6);
pruefe("Klick auf den Auftrag zeigt die Konsolen",
  document.querySelector("#dispatch-panel")?.classList.contains("hidden") === false);

const folgeSlot = [0, 1, 2, 3].find((i) => (konsole(i)?.textContent || "").includes("ALTE AUSGABE"));
pruefe("das alte Protokoll ist in einer Konsole sichtbar", folgeSlot !== undefined);
const folge = konsole(folgeSlot);
pruefe("das Feld nennt den alten Auftrag",
  /Alter Auftrag/.test(folge?.querySelector(".run-pane-title")?.textContent || ""),
  folge?.querySelector(".run-pane-title")?.textContent);
// Harness und Modell sind die Art des Laufs — sie stehen als Marke daneben, damit
// zwei Konsolen desselben Harness trotzdem unterscheidbar bleiben.
pruefe("die Marke nennt den alten Harness",
  /Cline · plan-free/.test(folge?.querySelector(".run-pane-harness")?.title || ""),
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

// Eine bewusste Wahl im Routing-Feld schlägt die Fortsetzung: der Screenshot
// zeigte CodeBuddy unten, gelaufen ist trotzdem Cline — die alte Logik nahm
// immer den Harness des alten Laufs.
const routing = (slot, wert) => {
  const feld = konsole(slot).querySelector(".run-pane-routing");
  if (![...feld.options].some((o) => o.value === wert)) {
    const opt = document.createElement("option");
    opt.value = wert;
    opt.textContent = wert;
    feld.appendChild(opt);
  }
  feld.value = wert;
  feld.dispatchEvent(new window.Event("change", { bubbles: true }));
};
routing(folgeSlot, "CodeBuddy");
frames.length = 0;
tippe(folgeSlot, "Bewusst anderer Harness im selben Ordner");
enter(folgeSlot);
await ruhen(4);
const bewusst = sendungen()[0];
pruefe("eine bewusste Routing-Wahl schlägt die Fortsetzung",
  bewusst?.harnessOverride === "CodeBuddy" && bewusst?.projectPath === "/tmp/proj-b",
  JSON.stringify(bewusst));
pruefe("bei bewusst anderem Harness geht das alte Modell nicht mit",
  bewusst?.modelOverride === undefined, JSON.stringify(bewusst));
routing(folgeSlot, "auto");

// Der Folgauftrag zieht in sein Feld zurück, auch wenn das andere Feld gerade
// einen Platz frei hätte — das Protokoll soll nicht allein stehen bleiben.
sag({ type: "done", taskId: "task_c" });
await ruhen(3);
const zweiteZeile = document.querySelector('.task-item[data-task-id="alt_lauf2"]');
pruefe("der zweite alte Auftrag steht in der Seitenleiste", zweiteZeile !== null);
zweiteZeile?.click();
await ruhen(4);
const zweiterSlot = [0, 1, 2, 3].find((i) => /ZWEITE ALTE AUSGABE/.test(konsole(i)?.textContent || ""));
pruefe("der zweite alte Auftrag zieht in ein anderes Feld",
  zweiterSlot !== undefined && zweiterSlot !== folgeSlot,
  String(zweiterSlot));
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
frames.length = 0;
document.querySelector('.project-node[data-path="/tmp/proj-c"] .add-task-btn')?.click();
await ruhen(3);
pruefe("＋ öffnet die Konsole",
  document.querySelector("#dispatch-panel")?.classList.contains("hidden") === false);
const aktiverSlot = [0, 1, 2, 3].find((i) => konsole(i).querySelector(".run-pane-input") === document.activeElement);
pruefe("＋ stellt ein Feld mit dem Zielordner bereit",
  aktiverSlot !== undefined && konsole(aktiverSlot).querySelector(".run-pane-target").value === "/tmp/proj-c",
  String(aktiverSlot));
tippe(aktiverSlot, "Frischer Auftrag im alten Ordner");
enter(aktiverSlot);
await ruhen(4);
pruefe("＋ im selben Ordner ist ein Anfang statt einer Fortsetzung",
  sendungen()[0]?.harnessOverride === "auto", JSON.stringify(sendungen()[0]));

// --- 13. Die Konsole schichtet: Gedanke, Werkzeug, Antwort ---------------
// Die Formen kommen aus den echten Protokollen in studio-tasks.json: Claude schreibt
// eine &lt;think&gt;-Region, die erst nach zwei freien Zeilen endet; cline schreibt
// [thinking], [run_commands], ⎿-Folgezeilen und Tokens-Zeilen. Alles vorher
// ungeordnet in einer Textwüste.

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
const slotVon = (marker) => [0, 1, 2, 3].find((i) => (konsole(i)?.textContent || "").includes(marker)) ?? 0;
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
pruefe("die [thinking]-Zeile kommt in die Gedankenschicht",
  [...(body()?.querySelectorAll(".ko-denke") || [])].some((d) => /Analysing build config/.test(d.textContent)),
  [...(body()?.querySelectorAll(".ko-denke") || [])].map((d) => d.textContent).join(" | "));
pruefe("Tokens-Zeile wird Randnotiz",
  /Tokens: 4,090/.test(body()?.querySelector(".ko-notiz")?.textContent || ""),
  body()?.querySelector(".ko-notiz")?.textContent);
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

sag({ type: "output", taskId: "task_l", html: `<div data-console-layer="werkzeug">Werkzeug: shell
⎿ erste Zeile
zweite Zeile</div>\n` });
await ruhen(4);
const activeTool = [...body().querySelectorAll("details.ko-werkzeug")].at(-1);
pruefe("Aktueller Werkzeugbereich ist offen und enthält das vollständige Ergebnis", activeTool.open && /zweite Zeile/.test(activeTool.textContent));
activeTool.open = false;
activeTool.dispatchEvent(new window.Event("toggle"));
await ruhen(2);
activeTool.open = true;
activeTool.dispatchEvent(new window.Event("toggle"));
await ruhen(2);
sag({ type: "output", taskId: "task_l", html: "FERTIGE-ANTWORT<br/>" });
await ruhen(4);
pruefe("Neue Antwort klappt den zuvor manuell geöffneten Werkzeugbereich zu", ![...body().querySelectorAll("details.ko-werkzeug")].at(-1).open);
const finishedTool = [...body().querySelectorAll("details.ko-werkzeug")].at(-1);
finishedTool.open = true;
finishedTool.dispatchEvent(new window.Event("toggle"));
await ruhen(2);
sag({ type: "output", taskId: "task_l", html: "Weitere Antwort<br/>" });
await ruhen(4);
pruefe("Nach der Antwort erneut geöffnete Werkzeuge bleiben offen", [...body().querySelectorAll("details.ko-werkzeug")].at(-1).open);

// Ein Denkordner, der noch mitten im Lauf wächst, meldet das — sonst wirkt die
// Konsole leer, obwohl der Harness gerade denkt.
sag({ type: "output", taskId: "task_l", html: "&lt;think&gt;offener Gedanke ohne Ende<br/>" });
await ruhen(4);
pruefe("ein wachsender Gedankengang ist als lebendig markiert",
  body()?.querySelector(".ko-denke.ko-wachsend") !== null,
  [...(body()?.querySelectorAll("details") || [])].map((d) => d.className).join(" | "));
sag({ type: "done", taskId: "task_l", exitCode: 0, message: "Fertig" });
await ruhen(4);
pruefe("nach dem Lauf ist nichts mehr lebendig",
  body()?.querySelector(".ko-wachsend") === null);
pruefe("nach dem Lauf bleiben die Ordner zugeklappt, die der Nutzer nicht öffnete",
  [...(body()?.querySelectorAll("details") || [])].filter((d) => d.open).every(d => [ersterDenk.dataset.schluessel, finishedTool.dataset.schluessel].includes(d.dataset.schluessel)));

// --- 13b. Einzeiliges bleibt Zeile, die Ausgabe bekommt eine eigene Fläche ---
// Ein Ordner mit dem Zähler "1 Zeile" behauptet etwas, das er nicht hat: das
// Aufklappen zeigt genau die Zeile, die im Kopf schon steht.
sag({ type: "output", taskId: "task_l", html: `<div data-console-layer="werkzeug">Werkzeug: run_commands</div>\n` });
await ruhen(4);
const einzeilig = [...body().querySelectorAll(".ko-einzeln.ko-werkzeug")].at(-1);
pruefe("ein einzelner Werkzeugaufruf steht als Zeile, nicht als Ordner",
  Boolean(einzeilig) && /run_commands/.test(einzeilig.textContent),
  body()?.innerHTML?.slice(-300));
pruefe("der einzeilige Aufruf trägt keinen Zähler",
  Boolean(einzeilig) && einzeilig.querySelector(".ko-zaehler") === null);

sag({ type: "output", taskId: "task_l", html: `<div data-console-layer="ausgabe">pwd\n/tmp/projekt\ntotal 48</div>\n` });
await ruhen(4);
const ausgabeFeld = body()?.querySelector("details.ko-ausgabe");
pruefe("die Werkzeugausgabe bekommt einen eigenen Ordner",
  Boolean(ausgabeFeld) && /total 48/.test(ausgabeFeld.textContent),
  body()?.innerHTML?.slice(-300));
pruefe("die Ausgabe hängt nicht im Werkzeugaufruf",
  ![...body().querySelectorAll("details.ko-werkzeug")].some((d) => /total 48/.test(d.textContent)));

// --- 13c. Eine Rückfrage ist anklickbar ----------------------------------
// Ein Lauf ist headless: eine Antwort kann nicht in den laufenden Prozess zurück.
// Der Knopf übernimmt deshalb den Auftragstext in das Eingabefeld; gesendet wird
// erst mit Enter, damit ein Klick keinen Lauf startet, den niemand abgeschickt hat.
const FRAGE_KARTE = `<div class="ko-frage">` +
  `<div class="ko-frage-kopf"><span class="ko-art">Rückfrage</span>` +
  `<span class="ko-frage-hinweis">Antwort anklicken — sie landet im Eingabefeld</span></div>` +
  `<div class="ko-frage-text">Was soll ich bauen?</div>` +
  `<div class="ko-frage-optionen">` +
  `<button type="button" class="ko-frage-option" data-antwort="Antwort auf die Rückfrage „Was soll ich bauen?&quot;: Variante A — Der kleine Weg">` +
  `<span class="ko-frage-label">Variante A</span><span class="ko-frage-beschreibung">Der kleine Weg</span></button>` +
  `<button type="button" class="ko-frage-option" data-antwort="Antwort auf die Rückfrage „Was soll ich bauen?&quot;: Variante B">` +
  `<span class="ko-frage-label">Variante B</span></button>` +
  `</div></div>\n`;
sag({ type: "output", taskId: "task_l", html: FRAGE_KARTE });
await ruhen(4);
const karte = body()?.querySelector(".ko-frage");
pruefe("die Rückfrage steht als eigener Block", Boolean(karte), body()?.innerHTML?.slice(-300));
pruefe("die Frage steht im Klartext", /Was soll ich bauen\?/.test(karte?.textContent || ""));
pruefe("jede Option ist ein anklickbarer Knopf",
  karte?.querySelectorAll("button.ko-frage-option").length === 2);
pruefe("die Beschreibung der Option bleibt sichtbar", /Der kleine Weg/.test(karte?.textContent || ""));
pruefe("die Rückfrage wird nicht zu einem Ordner",
  ![...(body()?.querySelectorAll("details") || [])].some((d) => /Was soll ich bauen/.test(d.textContent)));

const feldEingabe = feld()?.querySelector(".run-pane-input");
if (feldEingabe) feldEingabe.value = "";
karte?.querySelectorAll("button.ko-frage-option")[0].click();
await ruhen(2);
pruefe("ein Klick übernimmt die Antwort in das Eingabefeld",
  /Variante A/.test(feldEingabe?.value || "") && /Der kleine Weg/.test(feldEingabe?.value || ""),
  feldEingabe?.value);
pruefe("die Antwort trägt die Frage mit, damit sie als Auftrag lesbar ist",
  /Was soll ich bauen\?/.test(feldEingabe?.value || ""), feldEingabe?.value);
pruefe("der Klick quittiert sich und sendet nicht selbst",
  /Enter sendet/.test(feld()?.querySelector(".run-pane-frage-hinweis")?.textContent || ""),
  feld()?.querySelector(".run-pane-frage-hinweis")?.textContent);

// --- 14. Ein Klick auf einen Auftrag zeigt sein Feld ---------------------
// Zwei Konsolen desselben Harness waren nicht zu unterscheiden: der Titel trug nur
// "harness · modell". Jetzt trägt das Feld den Auftrag, die Art steht als Marke
// daneben, und die Seitenleiste sagt, in welchem Feld der Lauf liegt.
const layerSlot = slotVon("LAYER-MARKER");
pruefe("das Feld trägt den Auftrag als Titel",
  /LAYER-MARKER/.test(konsole(layerSlot)?.querySelector(".run-pane-title")?.textContent || ""),
  konsole(layerSlot)?.querySelector(".run-pane-title")?.textContent);
pruefe("die Marke trägt Harness und Modell",
  /Claude Code · Standard/.test(konsole(layerSlot)?.querySelector(".run-pane-harness")?.title || ""),
  konsole(layerSlot)?.querySelector(".run-pane-harness")?.textContent);

const seitenItem = () => document.querySelector('.task-item[data-task-id="task_l"]');
pruefe("die Seitenleiste nennt kein Konsolenfeld mehr",
  document.querySelectorAll(".task-konsole").length === 0);
pruefe("die Seitenleiste zeigt keinen Token-Verbrauch mehr",
  document.querySelectorAll(".task-usage").length === 0);

seitenItem()?.click();
await ruhen(4);
const markiert = [0, 1, 2, 3].filter((i) => konsole(i)?.classList.contains("ist-fokus"));
pruefe("Klick markiert genau das Feld des Auftrags",
  markiert.length === 1 && markiert[0] === layerSlot, JSON.stringify(markiert));
pruefe("Klick auf einen liegenden Auftrag holt die Konsole wieder hervor",
  document.querySelector("#dispatch-panel")?.classList.contains("hidden") === false);

// Abschlussregression: der Exit-Code und der Status bestimmen die Anzeige.
for (const [id, type, status, code] of [
  ["review_failure", "error", "failed", 1],
  ["review_cancel", "cancelled", "cancelled", 130],
  ["review_partial", "error", "incomplete", 1]
]) {
  sag({ type: "task_created", task: auftrag(id, "proj-a", id) });
  sag({ type: "route_selected", taskId: id, harness: "Cline", model: "Standard" });
  if (type === "cancelled") {
    sag({ type: "abbruch_laeuft", taskId: id });
    pruefe("Abbruch wird sofort quittiert", [...document.querySelectorAll(".run-pane-cancel")].some((b) => b.disabled && b.getAttribute("aria-label") === "Bricht ab…" && b.querySelector("svg")));
  }
  sag({ type, taskId: id, status, exitCode: code, message: id });
  const item = document.querySelector(`.task-item[data-task-id="${id}"]`);
  pruefe(`${status} bekommt keinen grünen Erfolgsstatus`, Boolean(item) && !item.querySelector(".task-badge").textContent.startsWith("●"));
  pruefe(`${status} gibt das Konsolenfeld frei`, [...document.querySelectorAll(".run-pane")].filter((pane) => pane.querySelector(".run-pane-title").textContent === id).every((pane) => pane.querySelector(".run-pane-cancel").hidden));
}

// Beads-Zustand und ausdrückliche Fortsetzung ohne Projektgedächtnis.
// Die Bedienung liegt seit dem Umzug vollständig im Einstellungsdialog; im
// Arbeitsbereich bleibt keine Leiste stehen, die eine Zeile kostet und nur
// wiederholt, dass Beads läuft.
const arbeitsbereich = document.querySelector('#dispatch-panel');
pruefe('Der Arbeitsbereich trägt keine Beads-Leiste mehr',
  !document.querySelector('#dispatch-panel .project-memory, #dispatch-panel .memory-details')
  && !arbeitsbereich.querySelector('#memory-summary'));
pruefe('Beads ist zentral und aus beiden Eingaben entfernt', !document.querySelector('.run-pane .run-pane-context, .run-pane .run-pane-beads'));
pruefe('Der Einstellungsdialog hat einen eigenen Punkt für das Projektgedächtnis',
  Boolean(document.querySelector('.settings-nav-item[data-section="memory"]'))
  && Boolean(document.querySelector('#settings-sec-memory')));
pruefe('Alle vier Konsoleinträge liegen in diesem Bereich',
  document.querySelectorAll('#settings-sec-memory .memory-pane').length === 4
  && Boolean(document.querySelector('#settings-sec-memory .memory-pane .run-pane-memory-status')));
pruefe('Die zentrale Zustandszeile steht im Einstellungsbereich',
  document.querySelector('#settings-sec-memory #memory-summary') !== null);
// Ein Zustand, der nur in einem unerreichbaren Bereich steckt, ist keiner.
const memoryNav = document.querySelector('.settings-nav-item[data-section="memory"]');
memoryNav?.click();
await ruhen(2);
pruefe('Ein Klick auf den Punkt öffnet den Bereich',
  Boolean(memoryNav?.classList.contains('active'))
  && Boolean(document.querySelector('#settings-sec-memory')?.classList.contains('active'))
  && !document.querySelector('#settings-sec-workspace').classList.contains('active'));
const automaticPayload = window.promptPayload(0).payload;
pruefe('Normaler Auftrag braucht keine Beads-Auswahl oder Ausnahme', !automaticPayload.beadId && !automaticPayload.withoutBeads);
const memoryPane = document.querySelector('#run-pane-0');
const memoryDetails = document.querySelector('#memory-pane-0');
const memoryProject = memoryPane.querySelector('.run-pane-target').value;
sag({ type: 'context_status', taskId: 'memory-status', projectPath: memoryProject, state: 'ready', memoryCount: 12,
  backup: { local: 'verified', remote: 'pending' } });
pruefe('Beads zeigt geladene Erkenntnisse', memoryDetails.querySelector('.run-pane-memory-status').textContent.includes('12 Erkenntnisse'));
pruefe('NAS ausstehend wird nicht als bestätigt gezeigt', memoryDetails.querySelector('.run-pane-backup-status').textContent.includes('NAS ausstehend'));
sag({ type: 'backup_status', projectPath: memoryProject, backup: { local: 'verified', remote: 'verified' } });
pruefe('Sicherungsereignisse aktualisieren nur die Sicherung und erhalten den Wissensstand', memoryDetails.querySelector('.run-pane-backup-status').textContent.includes('NAS bestätigt') && memoryDetails.querySelector('.run-pane-memory-status').textContent.includes('12 Erkenntnisse'));
sag({ type: 'context_status', taskId: 'memory-status', projectPath: memoryProject, state: 'error', error: 'CLI nicht verfügbar' });
pruefe('Beads-Fehler erscheint in der zentralen Zusammenfassung', document.querySelector('#memory-summary').textContent.includes('Problem'));
pruefe('Beads-Fehler bleibt sichtbar', memoryDetails.querySelector('.run-pane-memory-status').textContent.includes('nicht verfügbar'));
pruefe('Ausdrückliche Fortsetzung ist im Fehlerfall verfügbar', !memoryDetails.querySelector('.run-pane-memory-recovery').hidden);
memoryDetails.querySelector('.run-pane-without-beads').checked = true;
memoryPane.querySelector('.run-pane-input').value = 'Ohne Beads prüfen';
memoryPane.querySelector('.run-pane-send').click();
pruefe('Nur bewusste Auswahl übermittelt withoutBeads', frames.some(frame => frame.type === 'dispatch' && frame.prompt === 'Ohne Beads prüfen' && frame.withoutBeads === true));
pruefe('Die Beads-Ausnahme gilt nur für den gerade gesendeten Auftrag', !memoryDetails.querySelector('.run-pane-without-beads').checked);

// Bild-Einsetzen: getrennte Konsolen, Entwurfserhalt und einmaliger Dispatch.
let uploadFails = true;
let uploads = 0;
const oldFetch = window.fetch;
window.fetch = async (url, options) => {
  if (url !== '/api/images') return oldFetch(url, options);
  uploads++;
  await ruhen(2);
  return {ok:!uploadFails,json:async () => uploadFails ? {error:'Upload fehlgeschlagen'} : {imagePath:'/state/uploads/image.png'}};
};
window.URL.createObjectURL = () => 'blob:preview';
window.URL.revokeObjectURL = () => {};
const imageInput = memoryPane.querySelector('.run-pane-input');
imageInput.focus();
const imageFile = new window.File([new Uint8Array([137,80,78,71])], 'test.png', {type:'image/png'});
function pasteImage() {
  const event = new window.Event('paste', {bubbles:true,cancelable:true});
  Object.defineProperty(event,'clipboardData',{value:{items:[{kind:'file',type:'image/png',getAsFile:() => imageFile}]}});
  imageInput.dispatchEvent(event);
  return event;
}
const textPaste = new window.Event('paste',{cancelable:true});
imageInput.dispatchEvent(textPaste);
pruefe('Text-Einsetzen bleibt unverändert', !textPaste.defaultPrevented);
pruefe('Bild-Einsetzen wird verarbeitet', pasteImage().defaultPrevented);
pruefe('Bildvorschau bleibt in ihrer Konsole', !memoryPane.querySelector('.run-pane-attachment').hidden && document.querySelector('#run-pane-1 .run-pane-attachment').hidden);
imageInput.value = 'Bild prüfen';
memoryPane.querySelector('.run-pane-image-remove').click();
pruefe('Bild entfernen erhält den Text', imageInput.value === 'Bild prüfen' && memoryPane.querySelector('.run-pane-attachment').hidden);
pasteImage();
const dispatchCount = frames.filter(frame => frame.type === 'dispatch').length;
memoryPane.querySelector('.run-pane-send').click();
await ruhen(8);
pruefe('Upload-Fehler erhält Bild und Text ohne Dispatch', imageInput.value === 'Bild prüfen' && !memoryPane.querySelector('.run-pane-attachment').hidden && frames.filter(frame => frame.type === 'dispatch').length === dispatchCount);
uploadFails = false;
imageInput.value = '';
memoryPane.querySelector('.run-pane-send').click();
memoryPane.querySelector('.run-pane-send').click();
await ruhen(8);
const imageDispatches = frames.filter(frame => frame.type === 'dispatch' && frame.imagePath);
pruefe('Bild allein startet genau einen Auftrag mit Bildpfad', imageDispatches.length === 1 && imageDispatches[0].imagePath === '/state/uploads/image.png' && imageDispatches[0].prompt === 'Analysiere das beigefügte Bild.' && uploads === 2);
pruefe('Erfolgreicher Dispatch leert die Vorschau', memoryPane.querySelector('.run-pane-attachment').hidden);
imageInput.focus();
pruefe('Mac-Brücke nimmt PNG bei fokussierter Auftragseingabe an', window.harnessPasteImage('data:image/png;base64,iVBORw==') && !memoryPane.querySelector('.run-pane-attachment').hidden);
memoryPane.querySelector('.run-pane-image-remove').click();
imageInput.blur();
pruefe('Mac-Brücke lässt andere Eingabefelder unverändert', window.harnessPasteImage('data:image/png;base64,iVBORw==') === false);

// Mobile Datei-Auswahl, Kontextvorschau und Neuladen der Nutzerkonfiguration.
window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
window.HTMLDialogElement.prototype.close = function () { this.open = false; };
const beforePreview = frames.filter(frame => frame.type === 'dispatch').length;
let previewRequest;
const previousFetch = window.fetch;
window.fetch = async (url, options) => {
  if (url === '/api/context/preview') {
    previewRequest = JSON.parse(options.body);
    return {ok:true,json:async()=>({context:'<script>Quelle</script>',characters:25,budget:64000,sources:[{path:'AGENTS.md'}],memories:2,omittedMemories:1,image:'foto.png'})};
  }
  if (url === '/api/user-environment/reload') return {ok:true,json:async()=>({names:['ANTHROPIC_MODEL']})};
  return previousFetch(url, options);
};
const fileInput = memoryPane.querySelector('.run-pane-image-file');
Object.defineProperty(fileInput, 'files', {value:[imageFile],configurable:true});
fileInput.dispatchEvent(new window.Event('change'));
pruefe('Dateiauswahl zeigt dasselbe Bild wie Einsetzen', !memoryPane.querySelector('.run-pane-attachment').hidden);
imageInput.value = 'Kontext prüfen';
memoryPane.querySelector('.run-pane-context-preview').click();
await ruhen(5);
pruefe('Kontextvorschau enthält den aktuellen Entwurf und Bildnamen', previewRequest.prompt === 'Kontext prüfen' && previewRequest.imageName === 'test.png');
pruefe('Kontextvorschau bleibt lesend und interpretiert Quellen nicht als HTML', frames.filter(frame=>frame.type==='dispatch').length === beforePreview && document.getElementById('context-preview-content').textContent === '<script>Quelle</script>' && !document.getElementById('context-preview-content').querySelector('script'));
pruefe('Vorschau zeigt Budget und ausgelassene Erinnerungen', document.getElementById('context-preview-summary').textContent.includes('64000') && document.getElementById('context-preview-summary').textContent.includes('ausgelassen'));
document.getElementById('context-preview-close').click();
pruefe('Kontextvorschau schließt ohne Entwurfsverlust', !document.getElementById('context-preview-dialog').open && imageInput.value === 'Kontext prüfen');
document.getElementById('user-config-reload').click();
await ruhen(5);
pruefe('Nutzerkonfiguration neu laden nennt ausschließlich die Anzahl', document.getElementById('user-config-status').textContent.includes('1 Einstellungen') && !document.getElementById('user-config-reload').disabled);

// Wiederhergestellte Seitenleiste: Zustand überlebt das nächste Laden.
window.toggleProjectExpand('/tmp/proj-b');
pruefe('Zugeklappte Ordner werden gespeichert und wieder geladen', window.loadCollapsedProjects().has('/tmp/proj-b'));
window.toggleProjectExpand('/tmp/proj-b');
pruefe('Aufgeklappte Ordner verschwinden aus der gespeicherten Wahl', !window.loadCollapsedProjects().has('/tmp/proj-b'));
window.localStorage.setItem('hrg_collapsed_projects', '{defekt');
pruefe('Defekter Ordnerspeicher blockiert den Start nicht', window.loadCollapsedProjects().size === 0);
window.localStorage.setItem('hrg_show_taskless_folders', 'false');
pruefe('Ordnerfilter wird für das nächste Laden erhalten', window.loadShowTasklessFolders() === false);
window.localStorage.removeItem('hrg_show_taskless_folders');
const agentsButton = document.querySelector('.project-agents-btn');
fetches.length = 0;
agentsButton.click();
await ruhen(5);
pruefe('AGENTS-Marke lädt Regeln genau für den angeklickten Projektordner', fetches.some(f => f.schluessel === 'GET /api/agents-md?project=%2Ftmp%2Fcliscade'));
pruefe('AGENTS-Marke öffnet den Projekteditor', document.querySelector('.agents-tab-btn[data-target="project"]')?.classList.contains('active'));

// Jeder abgeschlossene Zustand bietet Archivieren; laufende und wartende nicht.
for (const status of ['completed', 'done', 'failed', 'error', 'cancelled', 'incomplete', 'running', 'queued']) {
  const id = `archive-status-${status}`;
  sag({type:'task_created',taskId:id,task:{id,status,projectPath:'/tmp/cliscade',prompt:'Archivzustand',timestamp:'2026-10-11T12:00:00.000Z'}});
  await ruhen(2);
  const button = document.querySelector(`.task-item[data-task-id="${id}"] .task-archive-btn`);
  const terminal = !['running', 'queued'].includes(status);
  pruefe(`Archiv-Icon für ${status} korrekt`, terminal ? Boolean(button?.querySelector('svg')) : !button);
  if (terminal && button) {
    fetches.length = 0;
    button.click();
    await ruhen(4);
    pruefe(`Archiv-Icon für ${status} archiviert den passenden Task`, fetches.some(f => f.schluessel === 'POST /api/tasks/archive' && JSON.parse(f.body).taskId === id && JSON.parse(f.body).archived === true));
  }
}

for (const id of ['claude','codex','cline','opencode','antigravity','qoder','codebuddy','cursor','junie','kilo','copilot','kiro','vibe']) {
  const taskId = `logo-${id}`;
  sag({type:'task_created',taskId,task:{id:taskId,harnessId:id,harness:'Anzeigename',status:'completed',model:'Testmodell',projectPath:'/tmp/cliscade',prompt:'Icon prüfen',timestamp:'2026-10-11T12:00:00.000Z'}});
  await ruhen(2);
  const badge=document.querySelector(`.task-item[data-task-id="${taskId}"] .task-badge`);
  pruefe(`Task zeigt lokales CLI-Icon für ${id} und nur Modelltext`, badge?.querySelector('img')?.getAttribute('src')?.startsWith(`/harness-icons/${id}.`) && badge.textContent.includes('Testmodell') && !badge.textContent.includes('Anzeigename') && Boolean(badge.querySelector('img').alt));
}
pruefe('CLI-Icon folgt beim Fallback dem aktuellen Executable', typeof window.taskHarnessIcon === 'function' && window.taskHarnessIcon({command:'kiro-cli',harnessId:'codex'}).includes('/kiro.'));
pruefe('Unbekannte CLI bekommt ein sicheres neutrales Icon', typeof window.taskHarnessIcon === 'function' && !window.taskHarnessIcon({harness:'<script>test</script>'}).includes('<script>'));

const longModel = 'opencode/ling-3.1-flash-free';
const layoutTask = {id:'layout-long-model',status:'completed',harnessId:'opencode',harness:'opencode_cli',model:longModel,projectPath:'/tmp/cliscade',prompt:'Was können wir als Nächstes machen?',timestamp:'2026-10-11T21:08:00.000Z'};
sag({type:'task_created',taskId:layoutTask.id,task:layoutTask});
sag({type:'route_selected',taskId:layoutTask.id,harness:'opencode_cli',command:'opencode',model:longModel});
await ruhen(2);
const layoutRow = document.querySelector('.task-item[data-task-id="layout-long-model"]');
pruefe('Lange Task-Modelle haben eigene Modell- und Zeitfelder', layoutRow.querySelector('.task-model')?.title === longModel && Boolean(layoutRow.querySelector('.task-time')) && Boolean(layoutRow.querySelector('.task-status')));
layoutRow.click();
await ruhen(2);
const layoutPane = [...document.querySelectorAll('.run-pane')].find(p => p.querySelector('.run-pane-title').textContent === layoutTask.prompt);
pruefe('Konsolenkopf zeigt CLI-Icon und vollständiges Modell im Tooltip', layoutPane?.querySelector('.run-pane-harness img')?.getAttribute('src') === '/harness-icons/opencode.png' && layoutPane?.querySelector('.run-pane-model')?.title === longModel);

// Ein frisch beendeter Live-Lauf ist ohne Historienklick fortsetzbar.
sag({type:'done',taskId:layoutTask.id,exitCode:0});
await ruhen(2);
const liveSlot = [...document.querySelectorAll('.run-pane')].indexOf(layoutPane);
frames.length = 0;
tippe(liveSlot, 'Weiter am Live-Auftrag');
enter(liveSlot);
await ruhen(2);
const liveFollow = sendungen()[0];
pruefe('Live-Folgeprompt übernimmt CLI, Modell und Vorgänger', liveFollow?.harnessOverride === 'opencode_cli' && liveFollow?.modelOverride === longModel && liveFollow?.previousTaskId === layoutTask.id, JSON.stringify(liveFollow));
sag({type:'task_created',taskId:'live-follow',task:{...layoutTask,id:'live-follow',requestId:liveFollow.requestId,prompt:'Weiter am Live-Auftrag',status:'queued'}});
sag({type:'route_selected',taskId:'live-follow',harness:'opencode_cli',command:'opencode',model:longModel});
sag({type:'output',taskId:'live-follow',html:'LIVE-FOLGE-AUSGABE'});
await ruhen(2);
pruefe('Live-Folgeprompt bleibt in seiner Konsole', konsole(liveSlot).textContent.includes('LIVE-FOLGE-AUSGABE') && ![0,1,2,3].some((i) => i !== liveSlot && konsole(i).textContent.includes('LIVE-FOLGE-AUSGABE')));
sag({type:'done',taskId:'live-follow',exitCode:0});
await ruhen(2);
frames.length = 0;
tippe(liveSlot, 'Zweite Live-Fortsetzung');enter(liveSlot);await ruhen(2);
pruefe('Nächste Fortsetzung verweist auf den jüngsten Lauf', sendungen()[0]?.previousTaskId === 'live-follow');

// Doppelte Bestätigung, wartender Folgeprompt und verspätetes Ereignis.
const auditTask = {id:'audit-live',projectPath:'/tmp/proj-a',projectName:'proj-a',prompt:'Übergabe prüfen',status:'queued',timestamp:new Date().toISOString()};
sag({type:'task_created',taskId:auditTask.id,task:auditTask});
sag({type:'route_selected',taskId:auditTask.id,harness:'Cline',command:'cline',model:'plan-free'});
sag({type:'output',taskId:auditTask.id,html:'AUDIT-ERSTE-AUSGABE'});await ruhen(2);
const auditSlot = [0,1,2,3].find(i=>konsole(i).textContent.includes('AUDIT-ERSTE-AUSGABE'));
sag({type:'task_created',taskId:auditTask.id,task:auditTask});await ruhen(2);
pruefe('Doppelte Task-Bestätigung reiht den Lauf nicht hinter sich selbst ein', !konsole(auditSlot).querySelector('.run-wartende'));
sag({type:'done',taskId:auditTask.id,exitCode:0});await ruhen(2);
frames.length=0;tippe(auditSlot,'Audit-Fortsetzung');enter(auditSlot);await ruhen(2);
const auditFirst=sendungen()[0];
sag({type:'task_created',taskId:'audit-follow-1',task:{...auditTask,id:'audit-follow-1',prompt:auditFirst.prompt,requestId:auditFirst.requestId}});
sag({type:'route_selected',taskId:'audit-follow-1',harness:'Cline',command:'cline',model:'plan-free'});
sag({type:'output',taskId:'audit-follow-1',html:'AUDIT-ZWEITE-AUSGABE'});await ruhen(2);
frames.length=0;tippe(auditSlot,'Noch während des Laufs');enter(auditSlot);await ruhen(2);
const auditWaiting=sendungen()[0];
pruefe('Folgeprompt während eines Laufs verweist auf den aktuellen Vorgänger', auditWaiting.previousTaskId==='audit-follow-1');
sag({type:'task_created',taskId:'audit-follow-2',task:{...auditTask,id:'audit-follow-2',prompt:auditWaiting.prompt,requestId:auditWaiting.requestId}});
sag({type:'queued',taskId:'audit-follow-2',reason:'project',message:'Wartet auf Vorgänger'});await ruhen(2);
pruefe('Wartender Folgeprompt bleibt unter dem laufenden Auftrag', konsole(auditSlot).textContent.includes('AUDIT-ZWEITE-AUSGABE') && Boolean(konsole(auditSlot).querySelector('.run-wartende')));
sag({type:'done',taskId:'audit-follow-1',exitCode:0});
sag({type:'route_selected',taskId:'audit-follow-2',harness:'Cline',command:'cline',model:'plan-free',projectPath:'/tmp/proj-a'});
sag({type:'output',taskId:'audit-follow-2',html:'AUDIT-DRITTE-AUSGABE'});await ruhen(2);
pruefe('Warteschlangen-Übergabe erhält Zielordner und altes Protokoll', konsole(auditSlot).querySelector('.run-pane-target').value==='/tmp/proj-a' && konsole(auditSlot).textContent.includes('AUDIT-ZWEITE-AUSGABE') && konsole(auditSlot).textContent.includes('AUDIT-DRITTE-AUSGABE'));
const beforeLate=[0,1,2,3].map(i=>konsole(i).querySelector('.run-pane-title').textContent);
sag({type:'output',taskId:'audit-follow-1',html:'VERSPAETETER-CHUNK'});await ruhen(2);
pruefe('Spätes Ereignis öffnet keinen verdrängten Task erneut', [0,1,2,3].every(i=>konsole(i).querySelector('.run-pane-title').textContent===beforeLate[i]));
pruefe('Später Chunk verändert keine fremde sichtbare Ausgabe', ![0,1,2,3].some(i=>konsole(i).textContent.includes('VERSPAETETER-CHUNK')));
sag({type:'task_created',taskId:'audit-follow-3',task:{...auditTask,id:'audit-follow-3',prompt:'Weitere Warteschlange'}});await ruhen(2);
pruefe('Nach Warteschlangen-Übergabe gehört der nächste Auftrag weiterhin zum selben Feld', konsole(auditSlot).textContent.includes('AUDIT-DRITTE-AUSGABE') && konsole(auditSlot).querySelector('.run-wartende')?.textContent.includes('Weitere Warteschlange'));
// Ein bewusst neuer Task darf durch den Abschluss des alten Laufs nicht zur Fortsetzung werden.
konsole(auditSlot).querySelector('.run-pane-input').focus();
window.startNewTaskInProject('/tmp/proj-a');
sag({type:'done',taskId:'audit-follow-2',exitCode:0});await ruhen(2);
frames.length=0;tippe(auditSlot,'Bewusst neuer Task');enter(auditSlot);await ruhen(2);
pruefe('Neuer Task bleibt auch nach spätem Abschluss ohne Vorgänger', sendungen()[0]?.previousTaskId === undefined && sendungen()[0]?.harnessOverride === 'auto');
const oldPool = ANTWORTEN['GET /api/runs'];
ANTWORTEN['GET /api/runs'] = {running:[{taskId:'audit-follow-1',projectPath:'/tmp/proj-a'}],queued:[]};
const beforePool=[0,1,2,3].map(i=>konsole(i).querySelector('.run-pane-title').textContent);
await window.refreshRunPool();await ruhen(2);
pruefe('Pool-Abgleich öffnet einen bewusst verdrängten Lauf nicht erneut', [0,1,2,3].every(i=>konsole(i).querySelector('.run-pane-title').textContent===beforePool[i]));
ANTWORTEN['GET /api/runs'] = oldPool;

// --- 15. Konsolen schließen ---------------------------------------------
// Der ×-Knopf im Konsolenkopf blendet ein Feld aus. Läuft der Auftrag noch, wird
// gefragt; ohne Dialog (jsdom kennt showModal nicht) läuft er im Hintergrund weiter
// und wird nie abgebrochen.
pruefe("der Schließen-Dialog bietet beide Wege",
  document.querySelector("#pane-close-abort")?.textContent.includes("abbrechen")
  && document.querySelector("#pane-close-keep")?.textContent.includes("weiterlaufen"));

const schliessTask = auftrag("task_close", "proj-b", "Schließbarer Auftrag");
sag({ type: "task_created", taskId: schliessTask.id, task: schliessTask });
sag({ type: "route_selected", taskId: schliessTask.id, harness: "Cline", command: "cline", model: "plan-free" });
sag({ type: "output", taskId: schliessTask.id, html: "SCHLIESS-AUSGABE" });
await ruhen(3);
const schliessSlot = [0, 1, 2, 3].find((i) => konsole(i).textContent.includes("SCHLIESS-AUSGABE"));
pruefe("der schließbare Lauf sitzt in einem eigenen Feld", schliessSlot !== undefined);
pruefe("bei mehreren Konsolen ist der Schließen-Knopf sichtbar",
  konsole(schliessSlot)?.querySelector(".run-pane-close")?.hidden === false);

frames.length = 0;
konsole(schliessSlot)?.querySelector(".run-pane-close")?.click();
await ruhen(3);
pruefe("ein laufender Auftrag fragt vor dem Schließen nach",
  document.querySelector("#pane-close-dialog")?.open === true);
document.querySelector("#pane-close-dismiss")?.click();
await ruhen(2);
pruefe("„Nicht schließen“ lässt das Feld stehen", konsole(schliessSlot)?.hidden === false);

konsole(schliessSlot)?.querySelector(".run-pane-close")?.click();
await ruhen(2);
document.querySelector("#pane-close-keep")?.click();
await ruhen(3);
pruefe("„Im Hintergrund weiterlaufen“ blendet das Feld aus", konsole(schliessSlot)?.hidden === true);
pruefe("Weiterlaufen bricht den Auftrag nicht ab",
  !frames.some((f) => f.type === "cancel"), JSON.stringify(frames));
pruefe("das Raster zählt die sichtbaren Konsolen neu",
  Number(document.querySelector("#run-split").dataset.panes)
    === document.querySelectorAll("#run-split .run-pane:not([hidden])").length);

// Ein zweiter laufender Auftrag zeigt den Abbrechen-Weg.
const abbrechTask = auftrag("task_close2", "proj-c", "Abbrechbarer Auftrag");
sag({ type: "task_created", taskId: abbrechTask.id, task: abbrechTask });
sag({ type: "route_selected", taskId: abbrechTask.id, harness: "Cline", command: "cline", model: "plan-free" });
sag({ type: "output", taskId: abbrechTask.id, html: "ABBRECH-AUSGABE" });
await ruhen(3);
const abbrechSlot = [0, 1, 2, 3].find((i) => konsole(i).textContent.includes("ABBRECH-AUSGABE"));
konsole(abbrechSlot)?.querySelector(".run-pane-close")?.click();
await ruhen(2);
frames.length = 0;
document.querySelector("#pane-close-abort")?.click();
await ruhen(3);
pruefe("„Auftrag abbrechen“ schickt cancel und schließt das Feld",
  frames.some((f) => f.type === "cancel" && f.taskId === abbrechTask.id) && konsole(abbrechSlot)?.hidden === true,
  JSON.stringify(frames));

// --- 16. Dreier-Raster: dritte Konsole füllt die volle Breite ----------------
// Bei genau 3 sichtbaren Feldern zieht die dritte Konsole über beide Spalten (run-pane-wide).
[0, 1, 2].forEach((i) => { if (konsole(i)) konsole(i).hidden = false; });
if (konsole(3)) konsole(3).hidden = true;
window.layoutPanes();
await ruhen(2);
const dreiSichtbar = [0, 1, 2, 3].map((i) => konsole(i)).filter((k) => k && !k.hidden);
pruefe("bei genau 3 Konsolen ist dataset.panes auf 3",
  document.querySelector("#run-split")?.dataset.panes === "3");
pruefe("bei 3 Konsolen füllt das 3. Feld die volle Breite (run-pane-wide)",
  dreiSichtbar.length === 3 && dreiSichtbar[2]?.classList.contains("run-pane-wide")
  && !dreiSichtbar[0]?.classList.contains("run-pane-wide")
  && !dreiSichtbar[1]?.classList.contains("run-pane-wide"));

// Bei 4 Konsolen wird das 2x2-Quadrat genutzt und run-pane-wide entfernt.
if (konsole(3)) konsole(3).hidden = false;
window.layoutPanes();
await ruhen(2);
pruefe("bei 4 Konsolen verliert das 3. Feld die Sonderbreite",
  !konsole(2)?.classList.contains("run-pane-wide") && document.querySelector("#run-split")?.dataset.panes === "4");

// --- 17. Erscheinungsbild: hell und dunkel --------------------------------
// Ein Umschalter, ein Attribut am Wurzelelement, ein gemerkter Wert. Der
// Zustand muss an beiden Stellen gleich sein — in der Seitenleiste und in der
// mobilen Leiste —, sonst zeigt das Handy den falschen nächsten Schritt.
const themenKnoepfe = [...document.querySelectorAll('.theme-toggle')];
pruefe('Theme-Umschalter gibt es in Seitenleiste und mobiler Leiste',
  themenKnoepfe.length === 2, String(themenKnoepfe.length));
pruefe('Theme-Umschalter sind Knöpfe mit Beschriftung',
  themenKnoepfe.every((b) => b.tagName === 'BUTTON' && b.getAttribute('aria-label') && b.title));

const wurzel = document.documentElement;
pruefe('Beim Start steht ein Erscheinungsbild am Wurzelelement',
  wurzel.dataset.theme === 'light' || wurzel.dataset.theme === 'dark', String(wurzel.dataset.theme));

const vorher = wurzel.dataset.theme;
themenKnoepfe[0]?.click();
await ruhen(2);
const nachher = wurzel.dataset.theme;
pruefe('Ein Klick wechselt das Erscheinungsbild',
  nachher !== vorher && (nachher === 'light' || nachher === 'dark'),
  `${vorher} -> ${nachher}`);
pruefe('Der gewechselte Wert wird gemerkt',
  window.localStorage.getItem('cliscade_theme') === nachher,
  String(window.localStorage.getItem('cliscade_theme')));
pruefe('Der Umschalter nennt seinen Zustand und das nächste Erscheinungsbild',
  themenKnoepfe.every((b) => b.getAttribute('aria-pressed') === String(nachher === 'dark')));
pruefe('Beide Umschalter zeigen dasselbe Zeichen',
  themenKnoepfe.every((b) => b.getAttribute('data-icon') === themenKnoepfe[0].getAttribute('data-icon')));
pruefe('Die Farbe der Browserleiste folgt dem Erscheinungsbild',
  document.querySelector('meta[name="theme-color"]')?.getAttribute('content')
    === (nachher === 'dark' ? '#0c0d10' : '#f7f8fa'),
  document.querySelector('meta[name="theme-color"]')?.getAttribute('content'));

// Tastatur: T wechselt — aber nicht, während der Nutzer seinen Auftrag tippt.
const vorT = wurzel.dataset.theme;
window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 't', bubbles: true }));
await ruhen(2);
pruefe('T wechselt das Erscheinungsbild', wurzel.dataset.theme !== vorT, String(wurzel.dataset.theme));

const nachT = wurzel.dataset.theme;
const auftragsfeld = konsole(0)?.querySelector('.run-pane-input');
auftragsfeld.value = 'Text mit t';
auftragsfeld.dispatchEvent(new window.KeyboardEvent('keydown', { key: 't', bubbles: true }));
await ruhen(2);
pruefe('T im Auftragsfeld wechselt nichts', wurzel.dataset.theme === nachT, String(wurzel.dataset.theme));

// Zurück auf den gemerkten Wert: ein Neustart darf nicht anders aussehen.
window.localStorage.setItem('cliscade_theme', 'light');
pruefe('Ein gemerktes Erscheinungsbild wird gelesen',
  window.leseErscheinungsbild() === 'light' && window.setzeErscheinungsbild('light') === 'light');
pruefe('Ein unsinniger gemerkter Wert fällt auf die Systemvorgabe zurück',
  (window.localStorage.setItem('cliscade_theme', 'neon'), window.leseErscheinungsbild()) !== 'neon');

// --- 18. Kein AGENTS.md-Rest in der Seitenleiste ---------------------------
// Die Marke stand neben dem Root-Ordner und sagte wenig. Wer die Richtlinien
// öffnen will, geht über die Einstellungen. Der Test hält Oberfläche und
// Quelltext frei, damit die Referenz nicht als toter Griff zurückkommt.
const leiste = document.getElementById("sidebar");
pruefe("Der Kopf der Seitenleiste trägt keine AGENTS.md-Marke",
  document.getElementById("root-agents-badge") === null
  && document.querySelector(".workspace-agents-badge") === null);
pruefe("Der Text „AGENTS.md aktiv“ steht nicht mehr in der Seitenleiste",
  !leiste.textContent.includes("AGENTS.md"));
pruefe("Der Root-Ordner bleibt im Kopf der Seitenleiste",
  document.getElementById("root-dir-display") !== null
  && document.getElementById("refresh-tree-btn") !== null);

const quelltext = {
  "index.html": readFileSync(join(PUBLIC, "index.html"), "utf8"),
  "style.css": readFileSync(join(PUBLIC, "style.css"), "utf8"),
  "app.js": readFileSync(join(PUBLIC, "app.js"), "utf8"),
};
const reste = Object.entries(quelltext).flatMap(([datei, text]) =>
  ["root-agents-badge", "root-agents-text", "workspace-agents-badge", "rootAgentsBadge", "rootAgentsText"]
    .filter((spur) => text.includes(spur))
    .map((spur) => `${datei}:${spur}`));
pruefe("Keine Spur der Marke in HTML, Stil oder Skript", reste.length === 0, reste.join(", "));

// --- 19. Das Erscheinungsbild erreicht den Fensterrahmen -------------------
// Die Mac-App setzte im Fenster fest .darkAqua. Das legt auch prefers-color-scheme
// im WebView fest: der Hellmodus war nie zu sehen, die App sah aus wie vor der
// Überarbeitung. Jetzt meldet die Oberfläche ihre Wahl über die WebKit-Brücke,
// und das Fenster folgt ihr — solange keine eigene Wahl gemerkt ist, bleibt es
// beim System, damit ein Systemwechsel weiter durchkommt.
const gemeldet = [];
window.webkit = { messageHandlers: { erscheinungsbild: { postMessage: (wert) => gemeldet.push(wert) } } };
window.localStorage.removeItem('cliscade_theme');
window.setzeErscheinungsbild('dark', false);
await ruhen(2);
pruefe('Ohne eigene Wahl meldet die Oberfläche: es entscheidet das System',
  gemeldet.length === 1 && gemeldet[0].theme === 'dark' && gemeldet[0].folgtSystem === true,
  JSON.stringify(gemeldet[0]));
window.setzeErscheinungsbild('light');
await ruhen(2);
pruefe('Nach eigener Wahl meldet sie die Wahl selbst',
  gemeldet.length === 2 && gemeldet[1].theme === 'light' && gemeldet[1].folgtSystem === false,
  JSON.stringify(gemeldet[1]));

// Eine Brücke, die scheitert, darf den Wechsel nicht verhindern.
window.webkit = { messageHandlers: { erscheinungsbild: { postMessage: () => { throw new Error('kein Empfänger'); } } } };
const trotzBruecke = window.setzeErscheinungsbild('dark');
await ruhen(2);
pruefe('Eine fehlerhafte Brücke blockiert den Wechsel nicht',
  trotzBruecke === 'dark' && document.documentElement.dataset.theme === 'dark');

// Im Browser gibt es keine Brücke. Das darf weder werfen noch den Wechsel stören.
delete window.webkit;
const ohneBruecke = window.setzeErscheinungsbild('light');
await ruhen(2);
pruefe('Ohne Brücke bleibt der Wechsel folgenlos und fehlerfrei',
  ohneBruecke === 'light' && document.documentElement.dataset.theme === 'light');

console.log(`\n${bestanden.length} bestanden, ${gefallen.length} fehlgeschlagen`);
process.exitCode = gefallen.length === 0 ? 0 : 1;
