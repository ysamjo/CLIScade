// Dichte: wie viel Fläche das Gerüst belegt, bevor Inhalt kommt.
//
// Warum das existiert: die Oberfläche war luftig — 45 px Konsolenkopf, ein
// Eingabekasten von 113 px für einen leeren Auftrag, 37 px je Aufgabenzeile,
// 10 px Rand um die Arbeitsfläche. Jede einzelne Zahl ist für sich vertretbar;
// zusammen schieben sie den Inhalt aus dem Bild. Und weil dieselben Selektoren
// in `style.css` mehrfach vorkommen (der jüngste Block gewinnt), sieht man beim
// Lesen einer einzelnen Stelle nicht, was am Ende gilt.
//
// Dieser Test liest deshalb das Blatt als Text, sammelt **alle** Regeln zu einem
// Selektoren in Quellreihenfolge — der letzte Treffer außerhalb einer
// Medienabfrage ist der wirksame — und hält Obergrenzen fest. Wer die Werte
// wieder aufbläst, bekommt hier eine rote Zeile statt einer stillen Rückkehr.
//
// Aufruf: node --test test/dichte.test.js

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const HIER = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(HIER, "..", "public", "style.css"), "utf8");
const HTML = readFileSync(join(HIER, "..", "public", "index.html"), "utf8");

// Alle Regeln in Quellreihenfolge. Regeln innerhalb einer Medienabfrage tragen
// deren Kopf mit, damit sie nicht als wirksamer Wert der Normalansicht zählen.
function regeln(css, medien = null) {
  const quelle = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const liste = [];
  let i = 0;
  while (i < quelle.length) {
    const auf = quelle.indexOf("{", i);
    if (auf === -1) break;
    const kopf = quelle.slice(i, auf).trim();
    let tiefe = 0;
    let ende = auf;
    for (; ende < quelle.length; ende += 1) {
      if (quelle[ende] === "{") tiefe += 1;
      else if (quelle[ende] === "}") {
        tiefe -= 1;
        if (tiefe === 0) break;
      }
    }
    const rumpf = quelle.slice(auf + 1, ende);
    if (kopf.startsWith("@")) {
      if (/^@(media|supports)/.test(kopf)) liste.push(...regeln(rumpf, kopf));
    } else {
      liste.push({ kopf, rumpf, medien });
    }
    i = ende + 1;
  }
  return liste;
}

const ALLE = regeln(CSS);

// Der wirksame Wert: letzte Regel außerhalb einer Medienabfrage, deren
// Selektorliste den Selektor genau enthält.
function wert(selektor, eigenschaft, { medien = false } = {}) {
  let treffer = null;
  for (const regel of ALLE) {
    if (Boolean(regel.medien) !== medien) continue;
    const selek = regel.kopf.split(",").map((s) => s.trim());
    if (!selek.includes(selektor)) continue;
    const muster = new RegExp(`(?:^|;)\\s*${eigenschaft}\\s*:\\s*([^;]+)`, "i");
    const gefunden = regel.rumpf.match(muster);
    if (gefunden) treffer = gefunden[1].trim();
  }
  return treffer;
}

function zahl(wert, selektor, eigenschaft) {
  assert.ok(wert !== null, `${selektor} setzt ${eigenschaft} nicht`);
  const erste = wert.match(/-?\d+(?:\.\d+)?/);
  assert.ok(erste, `${selektor}: ${eigenschaft} ist keine Zahl (${wert})`);
  return Number.parseFloat(erste[0]);
}

// Höchstwerte des Gerüsts. Alle Zahlen in px.
const OBEN = [
  [".sidebar", "width", 232],
  [".studio-container", "padding", 6],
  [".run-pane-head", "min-height", 34],
  [".run-pane-head", "padding", 4],
  [".run-pane-body", "min-height", 0],
  [".terminal-body", "padding", 8],
  [".run-pane-composer", "padding", 5],
  [".run-pane-composer", "margin", 4],
  [".run-pane-composer textarea", "min-height", 40],
  [".run-pane-composer textarea", "line-height", 1.4],
  [".run-pane-tool", "width", 26],
  [".run-pane-tool", "height", 26],
  [".sidebar-header", "padding", 6],
  [".sidebar-workspace-bar", "padding", 3],
  [".sidebar-footer", "padding", 4],
  [".sidebar-settings-btn", "min-height", 24],
  [".project-header", "min-height", 20],
  [".task-item", "padding", 2],
  [".add-task-btn", "height", 20],
  [".project-title", "line-height", 1.2],
  [".task-prompt", "line-height", 1.25],
];

test("Gerüst hält die Höchstwerte der Dichte ein", () => {
  const verstoesse = [];
  for (const [selektor, eigenschaft, grenze] of OBEN) {
    const gefunden = wert(selektor, eigenschaft);
    if (gefunden === null) {
      verstoesse.push(`${selektor} ${eigenschaft}: nicht gesetzt`);
      continue;
    }
    const ist = zahl(gefunden, selektor, eigenschaft);
    if (ist > grenze) verstoesse.push(`${selektor} ${eigenschaft}: ${ist} > ${grenze}`);
  }
  assert.deepEqual(verstoesse, []);
});

test("Die Seitenleiste lässt mehr Zeilen zu als vorher", () => {
  // 244 px war der alte Wert; die Ordnerzeile ist bei 22 px gedeckelt.
  const breite = zahl(wert(".sidebar", "width"), ".sidebar", "width");
  assert.ok(breite <= 232, `Seitenleiste ist ${breite} px breit`);
  assert.ok(breite >= 200, `Seitenleiste ist mit ${breite} px zu schmal für Projektnamen`);
});

test("Der Auftragskasten bleibt ein Feld, kein Block", () => {
  // Zwei Zeilen statt drei: das Feld wächst beim Tippen von selbst nach.
  const hoehe = zahl(wert(".run-pane-composer textarea", "min-height"), ".run-pane-composer textarea", "min-height");
  assert.ok(hoehe <= 40, `Eingabefeld startet mit ${hoehe} px`);
  assert.ok(hoehe >= 30, `Eingabefeld ist mit ${hoehe} px zu flach zum Treffen`);
  const zeilen = [...HTML.matchAll(/class="run-pane-input"[^>]*rows="(\d+)"/g)].map((m) => Number(m[1]));
  assert.ok(zeilen.length >= 4, `nur ${zeilen.length} Auftragsfelder gefunden`);
  assert.ok(zeilen.every((n) => n <= 2), `Zeilen im Markup: ${zeilen.join(", ")}`);
});

test("Am Telefon bleibt das Feld groß genug gegen das Hineinzoomen", () => {
  // iOS zoomt beim Tippen hinein, wenn die Schrift unter 16 px liegt. Die
  // Dichte darf hier nicht durchschlagen — die Höhe darf es.
  const groesse = wert(".run-pane-composer textarea", "font-size", { medien: true });
  assert.equal(groesse, "16px", `mobile Schriftgröße ist ${groesse}`);
  const hoehe = zahl(wert(".run-pane-composer textarea", "min-height", { medien: true }),
    ".run-pane-composer textarea", "min-height");
  assert.ok(hoehe <= 48, `mobiles Eingabefeld startet mit ${hoehe} px`);
});

test("Am Telefon bleibt der Plus-Knopf greifbar", () => {
  // Er gibt die Höhe der Projektzeile vor. Flach ist er richtig am Zeiger,
  // am Finger wäre er nicht mehr zu treffen.
  const hoehe = zahl(wert(".add-task-btn", "height", { medien: true }), ".add-task-btn", "height");
  assert.ok(hoehe >= 24, `Der Plus-Knopf ist am Finger nur ${hoehe} px hoch`);
});

test("Der leere Konsolenkörper beginnt oben statt in der Mitte", () => {
  const ausrichtung = wert(".terminal-placeholder", "justify-content");
  assert.equal(ausrichtung, "flex-start",
    `Der Platzhalter steht auf ${ausrichtung}; mittig lässt der leere Bereich noch leerer wirken`);
});
