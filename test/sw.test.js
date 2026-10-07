// Der Service Worker hält die Oberfläche am Leben, wenn der Server schweigt.
// Genau das wurde zum Fehler: die frische Antwort landete nie im Cache, also
// zeigte der Fallback eine Oberfläche, die Wochen alt war — während im Repo
// die Palette längst eine andere war.
//
// Die Umgebung liefert statische Ausdateien standardmäßig aus; netz = null
// heißt: der Origin antwortet nicht mehr.
//
// Aufruf: node --test test/sw.test.js

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const HIER = dirname(fileURLToPath(import.meta.url));
const QUELLE = readFileSync(join(HIER, "..", "public", "sw.js"), "utf8");
const BASIS = "http://localhost:3000";
const pfad = (req) => new URL(typeof req === "string" ? req : req.url, `${BASIS}/`).pathname;

function environment(netz) {
  const open = new Map();
  const handler = {};
  const zuerufe = [];
  let name = null;
  let ursprung = netz;

  const fetch = async (req) => {
    const p = pfad(req);
    zuerufe.push(p);
    if (ursprung === null) throw new TypeError("connection refused");
    const antwort = ursprung[p] ?? { body: `STANDARD ${p}` };
    return new Response(antwort.body, {
      status: antwort.status ?? 200,
      headers: { "content-type": "text/plain" }
    });
  };

  const cache = (abruf) => {
    const eintraege = new Map();
    return {
      async addAll(urls) {
        const antworten = await Promise.all(urls.map(abruf));
        antworten.forEach((a, i) => eintraege.set(pfad(urls[i]), a));
      },
      async match(req) {
        return eintraege.get(pfad(req)) ?? null;
      },
      async put(req, res) {
        eintraege.set(pfad(req), res.clone());
      }
    };
  };

  const scope = {
    addEventListener(type, fn) {
      handler[type] = fn;
    },
    skipWaiting() {},
    clients: { claim() {} }
  };

  const caches = {
    async open(n) {
      name = n;
      if (!open.has(n)) open.set(n, cache(fetch));
      return open.get(n);
    },
    async keys() {
      return [...open.keys()];
    },
    async delete(n) {
      return open.delete(n);
    },
    async match(req) {
      for (const c of open.values()) {
        const hit = await c.match(req);
        if (hit) return hit;
      }
      return null;
    }
  };

  new Function("self", "caches", "fetch", QUELLE)(scope, caches, fetch);

  const loslassen = async (type, request) => {
    const warten = [];
    const e = { request, respondWith: (p) => (e.antwort = p), waitUntil: (p) => warten.push(p) };
    handler[type](e);
    for (let i = 0; i < 5; i += 1) {
      const neue = warten.splice(0);
      if (neue.length === 0 && i > 0) break;
      await Promise.all(neue);
    }
    return e;
  };

  return {
    install: () => loslassen("install"),
    activate: () => loslassen("activate"),
    liefere(p, body) {
      if (ursprung) ursprung[p] = { body };
    },
    abschalten() {
      ursprung = null;
    },
    async abruf(url) {
      const e = await loslassen("fetch", { url, method: "GET" });
      if (!e.antwort) return null;
      const res = await e.antwort;
      return res ? await res.text() : null;
    },
    async geladen(p) {
      const hit = await open.get(name)?.match(p);
      return hit ? await hit.text() : null;
    },
    get cachenamen() {
      return [...open.keys()];
    },
    get aktuelleCacheName() {
      return name;
    },
    zuerufe
  };
}

test("Frische Antwort überschreibt den alten Cache-Eintrag", async () => {
  const env = environment({ "/style.css": { body: "--accent: alt" } });
  await env.install();
  assert.equal(await env.geladen("/style.css"), "--accent: alt", "precaching hält den Stand von damals");

  env.liefere("/style.css", "--accent: nüchtern");
  assert.equal(await env.abruf(`${BASIS}/style.css`), "--accent: nüchtern", "die Seite sieht das Frische");
  assert.equal(await env.geladen("/style.css"), "--accent: nüchtern", "der Cache hinkt nicht hinterher");
});

test("Ohne Server zeigt der Fallback den zuletzt geladenen Stand", async () => {
  const env = environment({ "/style.css": { body: "--accent: alt" } });
  await env.install();
  env.liefere("/style.css", "--accent: nüchtern");
  await env.abruf(`${BASIS}/style.css`);
  env.abschalten();

  assert.equal(await env.abruf(`${BASIS}/style.css`), "--accent: nüchtern",
    "der Fallback ist der Stand, den der Nutzer zuletzt sah");
});

test("Der neue Worker räumt den alten Cache weg", async () => {
  const env = environment({});
  await env.install();
  await env.activate();
  assert.deepEqual(env.cachenamen, [env.aktuelleCacheName], "nur der Cache der aktuellen Instanz bleibt");
});

test("API-Anfragen lässt der Worker ungefragt vorbei", async () => {
  const env = environment({});
  await env.install();
  const stand = env.zuerufe.length;
  assert.equal(await env.abruf(`${BASIS}/api/status`), null, "/api/ wird nicht beantwortet");
  assert.equal(env.zuerufe.length, stand, "nach dem Precaching berührt der Worker das Netz nicht");
});
