// Drei Leseschichten für die Konsole: Antwort, Gedankengang, Werkzeug, Randnotiz.
// Der Stream ist reiner Text; die Schichten stecken in den Markern, die die Harnesses
// selbst schreiben. Formen aus den echten Protokollen in ~/.harness-dispatch:
//   Claude   - &lt;think&gt; öffnet eine Region, die erst nach zwei freien Zeilen endet
//   cline    - [thinking], [read_files], [run_commands], Folgezeilen mit ⎿, (+1 more)
//   weitere  - [status] provider error — retrying, Tokens: 4,090 (...)
//
// Kein DOM, kein Server: der Formatierer kennt nur Text, damit die Oberfläche beim
// Malen dumm bleibt und sich die Schichten ohne Browser prüfen lassen.

// Denkfaden:  tags die Region, [thinking]/[think] ist eine einzelne Zeile.
const DENKE_OFFEN = /(?:<|&lt;)think(?:>|&gt;)/i;
const DENKE_ZU = /(?:<|&lt;)\/think(?:>|&gt;)/i;
const DENKE_MARKER = /^\[(?:thinking|think)\]/i;
const DENKE_KOPF = /<\/?think>/gi;
// Werkzeug: eckige Kleinbuchstaben-Namen und die Folgeeilen darunter.
const WERKZEUG_MARKER = /^\[[a-z][a-z0-9_]{2,}\]/;
const WERKZEUG_FOLGE = /^(?:[⎿│└─├\u2300-\u259F]|\(\+\d+ more\))/;
// Ein Harness verteilt seinen JSON-Aufruf über mehrere Zeilen: { "pfad": … ], }
// allein ist kein Satz, also gehört die Folge unter den Aufruf darüber.
const JSON_FORTSETZUNG = /^\s*(?:[[\]{}]|}[,\]]?|"(?:[^"\\]|\\.)*"\s*:)/;
// Randnotizen: Zahlen, Protokollkopf, Neustart- und Warntexte in Klammern.
const NOTIZ_MARKER = new RegExp([
  "^\\[(?:status|error|warning|info|unterbrochen|abgebrochen|fertig|start|fehler)",
  "^\\[[a-z0-9_-]+:[a-z0-9_-]+\\]",
  "^tokens?\\s*[:\\d(]",
  "^(?:model|approval|reasoning effort|session id|workdir)\\s*:",
  "^>\\s*\\S+\\s·\\s",
  "^[-=_*·—–\\s]{3,}$",
  "^to continue this session\\b"
].join("|"), "i");
const LEER = /^[\s|]*$/;
const UMBRUCH = /(?:<br\s*\/?>|\n)/;
const BLOCK_AN = /^\s*<(?:div|section)\b/i;
const BLOCK_ZAEHLEN = /<(?:div|section)\b[^>]*>/gi;
const BLOCK_ZU = /<\/(?:div|section)>/gi;

function textLesen(html) {
  return String(html == null ? "" : html)
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&apos;/gi, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (m, hex) => {
      const code = parseInt(hex, 16);
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    })
    .replace(/&#(\d+);/g, (m, code) => {
      const n = Number(code);
      return n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : m;
    })
    .replace(/&amp;/g, "&")
    .trim();
}

// Schicht einer Zeile nach ihrem sichtbaren Text.
function zeileKlassifizieren(text) {
  if (LEER.test(text)) return "leer";
  if (DENKE_MARKER.test(text)) return "denke";
  if (NOTIZ_MARKER.test(text)) return "notiz";
  if (WERKZEUG_MARKER.test(text)) return "werkzeug";
  if (WERKZEUG_FOLGE.test(text)) return "werkzeug";
  if (JSON_FORTSETZUNG.test(text)) return "werkzeug";
  return "antwort";
}

// Puffer → Zeilen. HTML-Blöcke (Banner, Phasen, Notizen des Servers) tragen eigene
// Klassen und dürfen nicht zerhackt werden, also wandern ihre Bruchstücke in ein
// Element zurück. Harness-Text schreibt keine echten spitzen Klammern — der
// Konverter escapeXML-iert — darum ist ein Block am Zeilenanfang immer unseres.
function inZeilen(html) {
  const teile = String(html || "").split(UMBRUCH);
  const zeilen = [];
  let sammel = null;
  let tiefe = 0;
  const waege = (text) =>
    (text.match(BLOCK_ZAEHLEN) || []).length - (text.match(BLOCK_ZU) || []).length;
  const nimmBlock = (inhalt) =>
    zeilen.push({ schicht: "block", html: inhalt, text: textLesen(inhalt) });

  for (const teil of teile) {
    if (sammel !== null) {
      sammel += "\n" + teil;
      tiefe += waege(teil);
      if (tiefe <= 0) { nimmBlock(sammel); sammel = null; tiefe = 0; }
      continue;
    }
    if (BLOCK_AN.test(teil)) {
      sammel = teil;
      tiefe = waege(teil);
      if (tiefe <= 0) { nimmBlock(sammel); sammel = null; }
      continue;
    }
    const text = textLesen(teil);
    if (!text) {
      if (!teil.trim()) zeilen.push({ schicht: "leer", html: "", text: "" });
      else zeilen.push({ schicht: zeileKlassifizieren(text), html: teil, text });
      continue;
    }
    zeilen.push({ schicht: zeileKlassifizieren(text), html: teil, text });
  }
  if (sammel !== null) nimmBlock(sammel);
  return zeilen;
}

// Zeilen → Blöcke derselben Schicht. Eine Denkregion überlebt einzelne freie Zeilen
// und endet erst vor zwei freien Zeilen (Claude schreibt keine Schlussmarke) oder an
// </think> . Andere Schichten brechen an jeder freien Zeile ab.
function zeilenSchieben(zeilen) {
  const bloecke = [];
  let lauf = null;
  let region = null;
  let freie = 0;

  const anhaengen = (block, zeile) => {
    block.zeilen.push(zeile);
    block.text += (block.text ? "\n" : "") + zeile.text;
  };
  const gruppe = (schicht, zeile) => {
    if (!lauf || lauf.schicht !== schicht) {
      lauf = { schicht, zeilen: [], text: "", geschlossen: true };
      bloecke.push(lauf);
    }
    anhaengen(lauf, zeile);
  };

  for (const zeile of zeilen) {
    if (zeile.schicht === "block") {
      region = null;
      lauf = null;
      bloecke.push({ schicht: "block", zeilen: [zeile], text: zeile.text, geschlossen: true });
      freie = 0;
      continue;
    }

    if (zeile.schicht === "leer") {
      if (region) {
        freie += 1;
        if (freie >= 2) { region.geschlossen = true; region = null; lauf = null; freie = 0; }
      } else {
        lauf = null;
      }
      continue;
    }
    freie = 0;

    if (region) {
      if (DENKE_ZU.test(zeile.html)) {
        anhaengen(region, zeile);
        region.geschlossen = true;
        region = null;
        lauf = null;
        continue;
      }
      anhaengen(region, zeile);
      continue;
    }

    // Region offen: der Kopf steht am Anfang der Zeile, der Rest bleibt in ihr.
    if (DENKE_OFFEN.test(zeile.html)) {
      const kopf = {
        schicht: "denke",
        html: zeile.html,
        text: zeile.text.replace(DENKE_KOPF, "").trim()
      };
      region = { schicht: "denke", zeilen: [kopf], text: kopf.text, geschlossen: false };
      bloecke.push(region);
      if (DENKE_ZU.test(zeile.html)) { region.geschlossen = true; region = null; }
      lauf = null;
      continue;
    }

    if (DENKE_MARKER.test(zeile.text)) { gruppe("denke", zeile); continue; }
    gruppe(zeile.schicht, zeile);
  }
  return bloecke;
}

function kürzen(text, laenge) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  return t.length > laenge ? `${t.slice(0, laenge - 1)}…` : t;
}

const ART = {
  denke: { titel: "Gedankengang", ordner: true },
  werkzeug: { titel: "Werkzeug", ordner: true },
  notiz: { titel: "Randnotiz", ordner: true },
  antwort: { titel: "", ordner: false },
  block: { titel: "", ordner: false }
};

class KonsoleFormatierer {
  constructor() {
    this.bloecke = [];
    this.blocks = [];
  }

  neu() {
    this.bloecke = [];
    this.blocks = [];
    return this;
  }

  // mal() zerlegt den Puffer. `offen` sind die Wünsche des Nutzers: ein Objekt mit
  // Schluessel → wahr/falsch, oder eine Liste nur-geöffneter Schluessel. Ohne Wunsch
  // gilt die Regel: ein wachsender Denkthread bleibt auf, alles andere zu.
  mal({ html = "", lebt = false, offen = null } = {}) {
    const gesichert = Array.isArray(offen) ? new Set(offen) : offen;
    const wunsch = (schluessel) => {
      if (!gesichert) return undefined;
      if (gesichert.has) return gesichert.has(schluessel) ? true : undefined;
      return schluessel in gesichert ? Boolean(gesichert[schluessel]) : undefined;
    };

    this.bloecke = zeilenSchieben(inZeilen(html)).map((block, idx) => {
      const schluessel = `${block.schicht}:${idx}`;
      const art = ART[block.schicht];
      const wachsend = block.schicht === "denke" && !block.geschlossen && lebt;
      const zeilenHtml = block.zeilen.filter((z) => z.html && z.html.trim()).map((z) => z.html);
      return {
        idx,
        schicht: block.schicht,
        schluessel,
        wachsend,
        zusammenfaltbar: art.ordner,
        offen: art.ordner ? (wunsch(schluessel) ?? wachsend) : true,
        gezaehlt: art.ordner,
        zeilen: zeilenHtml,
        text: block.text,
        titel: art.titel,
        zaehler: art.ordner ? `${zeilenHtml.length} ${zeilenHtml.length === 1 ? "Zeile" : "Zeilen"}` : "",
        kurz: art.ordner ? kürzen(block.text.replace(DENKE_KOPF, "").replace(DENKE_MARKER, "").replace(/^\[[a-z_]+\]\s*/, "").trim(), 90) : ""
      };
    });
    this.blocks = this.bloecke.filter((b) => b.zusammenfaltbar);
    return this;
  }

  // HTML für die Konsole. Zugeklappte Ordner tragen den Schluessel als Datenwert,
  // damit die Oberflaeche den Zustand des Nutzers ueber die naechsten Chunks halten kann.
  HTML(optionen) {
    this.mal(optionen);
    return this.bloecke.map((block) => {
      if (block.schicht === "block") return block.zeilen[0] || "";
      const inhalt = block.zeilen.map((z) => `<div class="ko-zeile">${z}</div>`).join("");
      if (!block.zusammenfaltbar) return `<div class="ko-antwort">${inhalt}</div>`;
      return `<details class="ko-block ko-${block.schicht}${block.wachsend ? " ko-wachsend" : ""}"` +
        ` data-schluessel="${block.schluessel}"${block.offen ? " open" : ""}>` +
        `<summary class="ko-kopf"><span class="ko-art">${block.titel}</span>` +
        `<span class="ko-zaehler">${block.zaehler}</span>` +
        `<span class="ko-kurztitel">${escapeText(block.kurz)}</span></summary>` +
        `<div class="ko-inhalt">${inhalt}</div></details>`;
    }).join("");
  }
}

function escapeText(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Kein Bundler hier: die Oberfläche ist klassische Skripte, also hängt sich der
// Formatierer selbst an das Fenster, damit app.js ihn vor dem ersten Chunk hat.
const KonsoleSchichten = { KonsoleFormatierer, inZeilen, zeilenSchieben, zeileKlassifizieren, textLesen };
if (typeof globalThis !== "undefined") globalThis.KonsoleSchichten = KonsoleSchichten;
