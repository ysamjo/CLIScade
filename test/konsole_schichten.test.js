// Konsolen-Schichten: Antwort, Gedankengang, Werkzeug, Randnotiz.
//
// Die Formen sind den echten Protokollen nachgebaut (~/.harness-dispatch/studio-tasks.json):
// Claude schreibt eine &lt;think&gt;-Region, die erst nach zwei freien Zeilen endet;
// cline und andere schreiben [thinking], [read_files], ⎿-Folgezeilen, [status] und
// Tokens-Zeilen. Vorher lag das ungeordnet in einer Textwüste.
//
// Aufruf:  node test/konsole_schichten.test.js

const tests = [];
const pruefe = (name, bedingung, zusatz = "") => {
  tests.push({ name, ok: Boolean(bedingung) });
  console.log(`  ${bedingung ? "ok   " : "FEHL "} ${name}${bedingung ? "" : "  -> " + zusatz}`);
};

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Wie in sw.test.js: das Skript ist ein klassisches Datei-Skript, also fährt der Test
// es in einer eigenen Welt und holt den Formatierer von dort zurück.
const QUELLE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "public", "konsole-schichten.js"), "utf8");
const welt = {};
new Function("globalThis", QUELLE)(welt);
const { KonsoleFormatierer, zeileKlassifizieren, textLesen } = welt.KonsoleSchichten;

const BANNER = '<div class="route-banner" style=""><span class="badge badge-accent">Prioritaet #1</span>' +
  '<span><strong>Harness:</strong> Claude Code (claude)</span>' +
  '<span><strong>Projekt:</strong> antigravity-remote-android</span>\n    </div>\n\n';
const CLAUDE = BANNER +
  "&lt;think&gt;Der Nutzer fragt nach RAM.<br/><br/>Ich schaue ins Portfolio." +
  "<br/><br/><br/>ANTWORT: 2 GB RAM<br/><br/>Fertig.<br/>";
const CLINE =
  "Verstanden, ich schaue nach.<br/>" +
  '<span style="color:#7fa3ad">[read_files]</span> {&quot;files&quot;:[{&quot;path&quot;:&quot;/tmp/x&quot;}&]}<br/>' +
  '<span style="color:#555">&#x23BF; </span>1 | # bricklink-mobile   2 | (+1 more)<br/>' +
  "[run_commands] ls -la /tmp | head -n 100<br/>" +
  "&#x23BF; total 496 drwxr-xr-x<br/>" +
  "Test-Anfrage erhalten, ich pruefe den Stand.<br/>" +
  "[status] provider error — retrying (attempt 1/3)<br/>" +
  "Tokens: 4,090 (2,446 Prompt / 1,644 Antwort)<br/>";

// --- 1. Claude: Denkregion bis zwei freie Zeilen -------------------------

let f = new KonsoleFormatierer().mal({ html: CLAUDE, lebt: false });
pruefe("Denkregion wird ein Ordner", f.blocks.length === 1 && f.blocks[0].schicht === "denke",
  JSON.stringify(f.blocks.map((b) => [b.schicht, b.text])));
pruefe("beide Gedankenzeilen haengen im Ordner",
  /fragt nach RAM/.test(f.blocks[0]?.text || "") && /Portfolio/.test(f.blocks[0]?.text || ""),
  f.blocks[0]?.text);
pruefe("die Region endet vor der Antwort",
  !/ANTWORT/.test(f.blocks[0]?.text || ""), f.blocks[0]?.text);
pruefe("die Antwort liegt ausserhalb jedes Ordners",
  f.bloecke.some((b) => b.schicht === "antwort" && /ANTWORT: 2 GB RAM/.test(b.text)),
  JSON.stringify(f.bloecke.map((b) => [b.schicht, b.text])));
pruefe("Denken und Antworten sind verschiedene Schichten",
  f.bloecke.some((b) => b.schicht === "denke") && f.bloecke.some((b) => b.schicht === "antwort"),
  JSON.stringify(f.bloecke.map((b) => b.schicht)));
pruefe("der Ordner ist zueroest zugeklappt", f.blocks[0]?.offen === false);
pruefe("der Ordner zaehlt zwei Zeilen",
  f.blocks[0]?.zaehler === "2 Zeilen" && f.blocks[0]?.zeilen.length === 2,
  f.blocks[0]?.zaehler);
const bannerBlock = f.bloecke.find((b) => b.schicht === "block");
pruefe("das Routing-Banner bleibt ein ganzes Element",
  bannerBlock && /^<div class="route-banner/.test(bannerBlock.zeilen[0]) &&
  /<span class="badge/.test(bannerBlock.zeilen[0]) &&
  /antigravity-remote-android/.test(bannerBlock.text),
  JSON.stringify(bannerBlock));

// --- 2. cline: Werkzeug, Gedanke, Notiz ---------------------------------

f = new KonsoleFormatierer().mal({ html: CLINE, lebt: false });
const schichten = f.bloecke.map((b) => b.schicht);
pruefe("cline schreibt keinen Gedanken, wo keiner steht", !schichten.includes("denke"),
  JSON.stringify(schichten));
pruefe("Werkzeugzeilen sammeln sich in einem Ordner",
  f.blocks.filter((b) => b.schicht === "werkzeug").length === 1,
  JSON.stringify(f.blocks.map((b) => [b.schicht, b.zeilen.length])));
const werkzeug = f.bloecke.find((b) => b.schicht === "werkzeug");
pruefe("der Werkzeugordner haelt Aufruf, Folgezeile und (+1 more)",
  werkzeug && /\[read_files\]/.test(werkzeug.text) && /\[run_commands\]/.test(werkzeug.text) &&
  werkzeug.zeilen.length === 4, werkzeug && werkzeug.zeilen.length);
pruefe("der Werkzeugordner ist zu", werkzeug && werkzeug.offen === false);
pruefe("Zwischentexte bleiben Antwortschicht",
  f.bloecke.filter((b) => b.schicht === "antwort").map((b) => b.text).join(" ").includes("Verstanden") &&
  f.bloecke.filter((b) => b.schicht === "antwort").map((b) => b.text).join(" ").includes("pruefe den Stand"),
  JSON.stringify(f.bloecke.filter((b) => b.schicht === "antwort").map((b) => b.text)));
pruefe("[status] und Tokens werden Randnotizen",
  f.bloecke.filter((b) => b.schicht === "notiz").map((b) => b.text).join(" ").includes("[status] provider error") &&
  f.bloecke.some((b) => b.schicht === "notiz" && /Tokens: 4,090/.test(b.text)),
  JSON.stringify(f.bloecke.filter((b) => b.schicht === "notiz").map((b) => b.text)));

const DENKER = "[thinking] Pruefe den Build.<br/>[thinking] Suche die Tests.<br/>fertig<br/>";
f = new KonsoleFormatierer().mal({ html: DENKER, lebt: false });
pruefe("[thinking] wird Gedankengang",
  f.blocks.length === 1 && f.blocks[0].schicht === "denke" && f.blocks[0].zeilen.length === 2,
  JSON.stringify(f.blocks.map((b) => [b.schicht, b.zeilen.length])));
pruefe("die Antwort nach dem Gedanken bleibt sichtbar",
  f.bloecke.some((b) => b.schicht === "antwort" && /fertig/.test(b.text)),
  JSON.stringify(f.bloecke.map((b) => b.schicht)));

// --- 2b. Ein Element über mehrere Zeilen bleibt ein Block -----------------
// Auf der echten Seite gebaut: die Oberfläche schreibt ihr usage-Banner über vier
// Zeilen, und ein Harness verteilt seinen JSON-Aufruf übers Element. Ein Umbruch
// INNERHALB eines Elements ist kein Zeilenende — sonst zerfällt der Block.
const BANNER_MEHRZEILIG = '<div class="usage-summary-banner">\n' +
  '  <span class="badge">📊 Usage</span>\n' +
  '  <span><strong>Tokens:</strong> 10,822 (2,235 Prompt / 8,587 Antwort)</span>\n' +
  '</div>\n';
f = new KonsoleFormatierer().mal({ html: "TEXT<br/>" + BANNER_MEHRZEILIG });
pruefe("ein mehrzeiliges Element bleibt ein Block",
  f.bloecke.length === 2 && f.bloecke[1].schicht === "block" && /Tokens:/.test(f.bloecke[1].text),
  JSON.stringify(f.bloecke.map((b) => [b.schicht, b.text.slice(0, 26)])));
pruefe("kein Bruchstück des Banners landet in einer anderen Schicht",
  f.bloecke.slice(0, 2).every((b) => !/📊/.test(b.text) || b.schicht === "block") &&
    !f.bloecke.some((b) => b.schicht === "notiz" && /Usage/.test(b.text)),
  JSON.stringify(f.bloecke.map((b) => [b.schicht, b.text.slice(0, 20)])));

const WERKZEUG_MEHRZEILIG = '[read_files] {\n  "files": [\n    { "path": "/tmp/x" }\n  ]\n}<br/>\n';
f = new KonsoleFormatierer().mal({ html: WERKZEUG_MEHRZEILIG });
pruefe("ein Werkzeug über mehrere Zeilen bleibt ein Ordner",
  f.blocks.length === 1 && f.blocks[0].schicht === "werkzeug" && /path/.test(f.blocks[0].text),
  JSON.stringify(f.bloecke.map((b) => [b.schicht, b.text])));

// --- 3. Klappen: wachsender Ordner offen, fertiger zu --------------------

f = new KonsoleFormatierer().mal({ html: "TEXT<br/>&lt;think&gt;ein Gedanke", lebt: true });
pruefe("ein Denkordner im Lauf bleibt offen",
  f.blocks[0]?.offen === true && f.blocks[0]?.wachsend === true, JSON.stringify(f.blocks[0]));
pruefe("ein fertiger Denkordner schliesst",
  new KonsoleFormatierer().mal({ html: "TEXT<br/>&lt;think&gt;G1<br/><br/><br/>ANS", lebt: false })
    .blocks[0]?.offen === false);
pruefe("Antworten werden nie zugeklappt",
  f.bloecke.filter((b) => b.schicht === "antwort").every((b) => b.zusammenfaltbar === false),
  JSON.stringify(f.bloecke.map((b) => [b.schicht, b.zusammenfaltbar])));
// Der Wunsch des Nutzers steht über der Regel: wer einem wachsenden Faden zustimmt
// oder ihn zudrückt, entscheidet — das bloße Melden eines offenen Ordners nicht.
f = new KonsoleFormatierer().mal({
  html: "TEXT<br/>&lt;think&gt;ein Gedanke", lebt: true, offen: { "denke:1": false }
});
pruefe("ein zugeknöpfter Wachsender bleibt zu",
  f.blocks[0]?.offen === false, JSON.stringify(f.blocks[0]));
f = new KonsoleFormatierer().mal({
  html: "TEXT<br/>&lt;think&gt;ein Gedanke", lebt: true, offen: { "denke:9": true }
});
pruefe("ein Wunsch für einen fremden Ordner schadet nicht",
  f.blocks[0]?.offen === true, JSON.stringify(f.blocks[0]));

// Wer einen Ordner aufmacht, darf ihn beim naechsten Chunk nicht verlieren.
const schluessel = new KonsoleFormatierer().mal({ html: CLAUDE, lebt: false }).blocks[0].schluessel;
f = new KonsoleFormatierer().mal({ html: CLAUDE, lebt: false, offen: [schluessel] });
pruefe("ein aufgeklappter Ordner bleibt offen", f.blocks[0]?.offen === true, f.blocks[0]?.schluessel);

// --- 4. Ohne Marker keine Ordner ----------------------------------------

f = new KonsoleFormatierer().mal({ html: "ganz normale Ausgabe<br/>noch eine Zeile<br/>", lebt: false });
pruefe("ohne Marker gibt es keinen Ordner", f.blocks.length === 0, JSON.stringify(f.blocks));
pruefe("beide Zeilen bleiben sichtbar",
  f.bloecke.length === 1 && /ganz normale Ausgabe/.test(f.bloecke[0].text),
  JSON.stringify(f.bloecke));

// --- 5. Schluessel halten ueber Chunks ----------------------------------

const EINS = "TEXT<br/>&lt;think&gt;G1";
const ZWEI = "TEXT<br/>&lt;think&gt;G1 und mehr Text";
const erster = new KonsoleFormatierer().mal({ html: EINS, lebt: true });
const zweiter = new KonsoleFormatierer().mal({ html: EINS, lebt: true });
const dritter = new KonsoleFormatierer().mal({ html: ZWEI, lebt: true });
pruefe("derselbe Ordner behaelt seinen Schluessel",
  erster.blocks[0].schluessel === zweiter.blocks[0].schluessel,
  JSON.stringify([erster.blocks, zweiter.blocks]));
pruefe("ein gewachsener Ordner bleibt derselbe",
  dritter.blocks.length === 1 && dritter.blocks[0].schluessel === erster.blocks[0].schluessel,
  JSON.stringify([erster.blocks, dritter.blocks]));

// --- 6. HTML: was die Oberflaeche einsetzt -------------------------------

const html = new KonsoleFormatierer().HTML({ html: CLAUDE, lebt: false });
pruefe("Der Ordner wird ein details-Element ohne open",
  /<details class="ko-block ko-denke" data-schluessel="denke:1">/.test(html), html.slice(0, 400));
pruefe("Antwort und Denkenschicht liegen in verschiedenencontainern",
  html.indexOf("ko-antwort") > html.indexOf("ko-denke") && /ko-zeile/.test(html),
  html.slice(-300));
pruefe("der Ordner zeigt Kurztext statt Ganzer Wueste",
  /ko-kurztitel">Der Nutzer fragt nach RAM/.test(html), html.slice(0, 600));

const wuestenText = textLesen(html);
pruefe("kein Denktext steht in der Antwortebene",
  !/Der Nutzer fragt nach RAM/.test(html.split("ko-antwort")[1] || ""), wuestenText.slice(0, 200));
pruefe("zeileKlassifizieren kennt die Marker",
  zeileKlassifizieren("[thinking] x") === "denke" &&
  zeileKlassifizieren("[run_commands] ls") === "werkzeug" &&
  zeileKlassifizieren("⎿ total 496") === "werkzeug" &&
  zeileKlassifizieren("Tokens: 4,090 (2,446 Prompt / 1,644 Antwort)") === "notiz" &&
  zeileKlassifizieren("Ich schreibe die Datei.") === "antwort");

const fehl = tests.filter((t) => !t.ok);
console.log(`\n${tests.length - fehl.length} bestanden, ${fehl.length} fehlgeschlagen`);
process.exitCode = fehl.length ? 1 : 0;
