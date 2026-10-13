// Erscheinungsbild: hell und dunkel aus derselben Palette.
//
// Warum das existiert: die Oberfläche war ausschließlich dunkel. Ein heller
// Modus scheitert nicht an den Variablen, sondern an den Stellen, die ihre
// Farbe direkt hinschreiben — ein `rgba(0,0,0,.25)` als Fläche, ein `#ffffff`
// als Schrift, ein schwarzer Schatten. Im dunklen Modus fällt das nicht auf,
// im hellen ist die Fläche plötzlich schwarz und die Schrift unlesbar.
//
// Deshalb zwei Regeln, die dieser Test festhält:
//   1. Beide Modi definieren dieselben Variablen. Fehlt eine im hellen Modus,
//      fällt sie still auf den Wert des anderen zurück.
//   2. Farbe steht ausschließlich in den beiden Variablenblöcken. Außerhalb
//      darf kein Farbwert stehen — weder hex noch rgb() noch rgba().
//
// Aufruf: node --test test/theme.test.js

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const HIER = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(HIER, "..", "public", "style.css"), "utf8");
const HTML = readFileSync(join(HIER, "..", "public", "index.html"), "utf8");

// Der Rumpf eines Regelblocks, Klammern mitgezählt.
function block(css, kopf) {
  const start = css.indexOf(kopf);
  if (start === -1) return null;
  const auf = css.indexOf("{", start);
  let tiefe = 0;
  for (let i = auf; i < css.length; i += 1) {
    if (css[i] === "{") tiefe += 1;
    else if (css[i] === "}") {
      tiefe -= 1;
      if (tiefe === 0) return css.slice(auf + 1, i);
    }
  }
  return null;
}

function variablen(rumpf) {
  const namen = new Set();
  for (const treffer of rumpf.matchAll(/(--[a-z0-9-]+)\s*:/g)) namen.add(treffer[1]);
  return namen;
}

// Alles außerhalb der Variablenblöcke: dort darf keine Farbe stehen.
function aeusseres(css) {
  let rest = css;
  let stelle = rest.indexOf(":root");
  while (stelle !== -1) {
    const auf = rest.indexOf("{", stelle);
    if (auf === -1) break;
    let tiefe = 0;
    let ende = -1;
    for (let i = auf; i < rest.length; i += 1) {
      if (rest[i] === "{") tiefe += 1;
      else if (rest[i] === "}") {
        tiefe -= 1;
        if (tiefe === 0) { ende = i; break; }
      }
    }
    if (ende === -1) break;
    rest = rest.slice(0, stelle) + rest.slice(ende + 1);
    stelle = rest.indexOf(":root");
  }
  // Kommentare mischen keine Farben ein.
  return rest.replace(/\/\*[\s\S]*?\*\//g, "");
}

const hell = block(CSS, ':root[data-theme="light"]');
const dunkel = block(CSS, ':root[data-theme="dark"]');

test("beide Erscheinungsbilder definieren ihre Farben", () => {
  assert.ok(hell, ':root[data-theme="light"] fehlt in public/style.css');
  assert.ok(dunkel, ':root[data-theme="dark"] fehlt in public/style.css');
  // color-scheme steuert, wie der Browser Formularelemente und Rollbalken malt.
  // Ohne die Angabe bleibt der Rollbalken im hellen Modus dunkel.
  assert.match(dunkel, /color-scheme\s*:\s*dark/, "dem dunklen Modus fehlt color-scheme: dark");
  assert.match(hell, /color-scheme\s*:\s*light/, "dem hellen Modus fehlt color-scheme: light");
  assert.match(CSS, /:root\s*,\s*:root\[data-theme="dark"\]\s*\{/,
    "die dunkle Palette muss auch ohne data-theme gelten — sonst ist die Oberfläche ohne JavaScript farblos");
});

test("heller und dunkler Modus definieren dieselben Variablen", () => {
  const h = variablen(hell);
  const d = variablen(dunkel);
  const nurHell = [...h].filter((n) => !d.has(n));
  const nurDunkel = [...d].filter((n) => !h.has(n));
  assert.deepEqual(nurHell, [], `nur im hellen Modus definiert: ${nurHell.join(", ")}`);
  assert.deepEqual(nurDunkel, [], `nur im dunklen Modus definiert: ${nurDunkel.join(", ")}`);
  assert.ok(h.size >= 20, `zu wenige Variablen: ${h.size}`);
});

test("Farbe steht ausschließlich in den Variablenblöcken", () => {
  const rest = aeusseres(CSS);
  const treffer = [...rest.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g)].map((t) => t[0]);
  assert.deepEqual(treffer, [],
    `Farbwerte außerhalb der Variablenblöcke: ${treffer.join(", ")}`);
});

test("die Oberfläche kennt beide Erscheinungsbilder", () => {
  assert.match(HTML, /data-theme/, "index.html setzt kein Erscheinungsbild am Wurzelelement");
  assert.match(HTML, /class="[^"]*theme-toggle/,
    "kein Umschalter (.theme-toggle) in index.html");
  assert.match(HTML, /name="theme-color"/,
    "meta[theme-color] fehlt — die Browserleiste bleibt in beiden Modi schwarz");
});

test("der Cache-Buster folgt der Service-Worker-Nummer", () => {
  const sw = readFileSync(join(HIER, "..", "public", "sw.js"), "utf8");
  const nummer = sw.match(/cliscade-v(\d+)/)?.[1];
  assert.ok(nummer, "CACHE_NAME in public/sw.js nennt keine Nummer");
  assert.match(HTML, new RegExp(`style\\.css\\?v=${nummer}\\b`),
    `style.css?v=${nummer} fehlt in index.html — sonst liefert der Browser die alte Palette`);
});
