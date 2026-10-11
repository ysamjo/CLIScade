# Harness Router GUI

Browser-Oberfläche und Orchestrator, die mehrere KI-Coding-Harnesses (claude, codex, opencode, cline, codebuddy, qodercli, antigravity, cursor) parallel über die Projektordner eines Workspace dispatcht — inklusive Telegram-Relay.

## Projekt-Kontext

| Modul | Pfad | Beschreibung |
| :--- | :--- | :--- |
| **Services** | `services/` | Dispatch, transaktionaler TaskStore, ContextService, LAN-Zugang und optionaler Beads-Adapter |
| **Server** | `server.js` | Express 5 + `ws`: `/api/*`, Run-Pool, Dispatch-Queue, Scheduler, Telegram, Einstellungen, Task-Historie |
| **Entscheidung** | `routing.js` | Reine Logik ohne IO: `dispatchSlotDecision`, `knownBrokenBlocker`, `armIdleWatchdog`, `startupRefusal`, `gatewayEnvFromShell` |
| **Runtime** | `runtime/` | Feste Harness-Registry, gemeinsamer Process Runner, `runHarness()`, Ereignisse, Fehlerklassen, Sessions und CLI-Adapter |
| **Oberfläche** | `public/` | Vanilla JS ohne Bundler: `app.js` (Zustand + Rendering), `konsole-schichten.js` (Leseschichten der Konsole, reiner Text ohne DOM), `index.html`, `style.css`, `icons.js`, `sw.js` |
| **Tests** | `test/` | `ui-smoke.mjs` (jsdom), `runtime/*.test.js` (Adapter, Runner, Sessions, Kind-Umgebung, Sicherheit), `routing.test.js` (Entscheidungen), `dispatch_chain.test.js` (echte Kind-Prozesse gegen Stub-CLIs), `sw.test.js`, `konsole_queue.test.js`, `konsole_schichten.test.js` |

**Laufzeitumgebung**: Node-Prozess auf Port `3000`, bindet `0.0.0.0` (im LAN sichtbar).
Zustand liegt **außerhalb** des Repos unter `~/.harness-dispatch/` — `config.yaml`
(Prioritätskette, Modelle, Kappe), `studio.sqlite` (Aufträge, Request-IDs, Versuche und Ereignisse inkl. `archived`; einmalige Migration von `studio-tasks.json`),
`AGENTS.md` (globaler Richtlinientext), `studio.log`.

## Konventionen
- **Entscheidungen gehören nach `routing.js`**, `server.js` verdrahtet nur. Ein Gate, das sich nicht
  ohne Kind-Prozess testen lässt, ist an der falschen Stelle.
- **CLI-Wissen gehört nach `runtime/`**. `server.js` darf keine harness-spezifischen Argumentlisten,
  Ausgabeparser oder Resume-Regeln enthalten. Jeder Lauf geht ausschließlich über `runHarness()`.
  Konfiguration speichert `harnessId`, nie ein frei gewähltes Executable.
- **Test zuerst schreiben und scheitern lassen.** `ui-smoke.mjs` zählt `pruefe()`-Behauptungen und am
  Ende aus; die Ketten-Tests fahren einen echten Server in eigenem `HOME` mit Stub-CLIs.
- `public/` wirkt nach einem Browser-Reload, `server.js` und `routing.js` erst nach einem
  **Prozess-Neustart** — kein Build-Schritt, keine Bundler-Dateien anlegen.
- Deutsch für UI-Texte, Kommentare, Meldungen und Commit-Messages; englische Code-Bezeichner.
- Erscheinung: kurze Zeilen, Gruppen, Zähler statt Erklärtext, kein Anbieter-Jargon.
  UI-Varianten **bauen und screenshoten** statt sie zu beschreiben.
- **Ein Lauf endet in `done`, `error` oder `cancelled`** — nie als `done` mit Fehlercode.
  `cancelled` ist ein eigener Meldungstyp (Exit-Code 130), damit die Oberfläche ihn nicht grün
  malt und der Baum ihn nicht als Erfolg führt; ein Abbruch wird zweistufig gemeldet
  (`abbruch_laeuft` quittiert, `cancelled` schließt ab). Wer einen terminalen Zustand auswertet
  — Queue, Wartezelle, Feldwahl, Test-Helfer —, muss alle drei kennen.
- Browser-Prüfungen über Ego Lite (`ego-browser`), siehe globale `Developer/AGENTS.md` §2.

## Commands

```bash
npm start                        # Server auf http://localhost:3000, hängt an dieser Shell
HOST=127.0.0.1 npm start         # nur lokal erreichbar, nicht im LAN
python3 tools/start-detached.py  # Dauerbetrieb: setsid + gesäuberte Umgebung
node test/ui-smoke.mjs           # Oberfläche im jsdom (Struktur + Verhalten)
node test/konsole_schichten.test.js
                                 # 34 Behauptungen: Schichten aus echten Protokollen
npm run test:routing             # Node-Tests inklusive runtime/ und Dispatch-Ketten
npm test                         # Gesamtsuite inklusive UI-Smoke

# Wegwerf-Instanz für Browser-Prüfungen — NIE die Instanz auf 3000 anfassen:
mkdir -p /tmp/hrg/bin && printf '#!/bin/sh\necho stub\n' > /tmp/hrg/bin/stub-run && chmod +x /tmp/hrg/bin/*
HOME=/tmp/hrg PATH=/tmp/hrg/bin:/usr/bin:/bin PORT=3921 node server.js
```

## Grenzen & Sicherheitsregeln
- **Port 3000 gehört dem Nutzer.** Dort läuft sein Server. Vor jedem Neustart zählen:
  `pgrep -P $(lsof -nP -iTCP:3000 -sTCP:LISTEN -t)` — ein laufender Agent-Task wird sonst mitgetötet.
- **Dauerbetrieb nur über `tools/start-detached.py`, nie aus der Agent-Shell.** Aus einer
  WorkBuddy-Session geerbt kommt `NODE_OPTIONS=--require=…/node-language-shim.cjs` mit, das
  `node-brokered-fs-shim.cjs` lädt und **jeden** `fs`-Aufruf über den Sandbox-Broker der App
  schickt. Endet der Agenten-Zug, wirft der nächste Dateizugriff `Connection refused` als
  unbehandelte Ausnahme — der Server stirbt mitten im Betrieb, auch beim Ausliefern einer
  statischen Datei. Im Log sieht das aus wie `ENOSPC: no space left on device` oder
  `Brokered file token refused`. Ebenso zu entfernen: `BASH_ENV`, `PYTHONPATH`, `CODEBUDDY_*`,
  `WORKBUDDY_*`, `SANDBOX_CENTER_*`, `SERVER__PORT`/`SERVER__HOST` und die Shim-Einträge in
  `PATH` (`cli/vendor/shim`). Der Launcher filtert das und warnt, wenn noch etwas durchkommt.
- **Zwei Ebenen gegen App-Gerüst in der Umgebung.** `SERVER__PORT` benennt den Web-UI-Server der
  aufrufenden WorkBuddy-App. Erbt ihn ein Lauf, bindet der Harness denselben Port und stirbt vor
  dem ersten Token mit `listen EADDRINUSE: address already in use 127.0.0.1:54968`. Deshalb filtert
  der Launcher den Start des Servers **und** `runtime/harness-runtime.js` jeden Spawn
  (`childEnv()`), damit auch ein von Hand gestarteter Server sauber dispatcht.
- **Neustart nur ohne `QODER_*`-Umgebung.** Der Launcher erledigt das per Präfix; von Hand
  scrubben als Array (`env "${scrub[@]}" node server.js`) — eine per `$(...)` gebaute
  Zeichenkette zerlegt zsh **nicht**, der Server läuft dann trotzdem und vergiftet jedes
  `qodercli` mit `sdk_invalid_args`. Nachprüfen:
  `ps eww -p <PID> | tr ' ' '\n' | grep -cE '^(QODER|CODEBUDDY|WORKBUDDY|NODE_OPTIONS)'` muss `0` sein.
- **Service Worker:** `public/sw.js` arbeitet network-first und hält `harness-studio-v<N>` als
  Rückfall. Ändern sich `index.html`, `app.js` oder `style.css`, die Nummer hochziehen — sonst
  kann bei totem Server die alte Fassung erscheinen, und die Seite sieht heil aus, obwohl sie
  mit einem toten Backend spricht.
- **LAN-offen**: jeder Spawn-Pfad bleibt über die feste `HARNESS_REGISTRY` beziehungsweise deren
  `TESTABLE_COMMANDS` auf eingetragene CLIs beschränkt.
  **Modell-Tests** laufen in einem Wegwerfverzeichnis (`harness-modeltest-…` unter `/tmp`),
  **Dispatches arbeiten direkt im gewählten Projektordner** — dort gibt es keine
  Isolation, der Auftrag schreibt im Original.
- **Secrets nie ausgeben oder übertragen**: der `ANTHROPIC_API_KEY`-Wert in `~/.zshrc`. Von der
  Gateway-Umbiegung dürfen nur Variablen**namen** geloggt werden.
- `.workbuddy-ai/` ist das Gedächtnis eines anderen Agenten — untracked lassen, nie committen.
- `origin` ist das **private** GitHub-Repo (`github.com/ysamjo/harness-router-gui`). Vor einem Push
  prüfen, was mitgeht (`git status --short`), und keine Schlüssel aus dem Laufzeitverzeichnis.
- Das GUI dispatchet auch in dieses Repo: vor `git checkout`/`reset`/Neustart prüfen, ob ein zweiter
  Agent gerade am Arbeitsbaum schreibt.

## Architekturvertrag seit 11. Oktober 2026

- Node.js mindestens 22.13 für `node:sqlite`. Keine neue Datenbankbibliothek und kein Bundler.
- SQLite ist die Quelle für Aufträge; die alte JSON-Datei wird einmalig gesichert und importiert. Beschädigte Daten nicht als leere Historie behandeln. Request-ID-Deduplizierung gilt auch nach Neustart.
- `public/task-state.js` definiert Abschlussmeldungen für Server und UI: `done` nur für `completed`, `error` für `failed`/`incomplete`, `cancelled` für Abbruch mit 130. `abbruch_laeuft` quittiert den Abbruch sofort.
- Jeder Start und jede Konsensphase verwendet den ContextService. Regeln und Bildhinweise bleiben bei Fallback erhalten; Agentenaussagen sind unbestätigter Arbeitsstand. Keine automatische Änderung von AGENTS-Regeln.
- LAN-Zugang ist angemeldet, lokaler Zugriff mit gültigem Host/Origin bleibt möglich. `lan-access-code` niemals ausgeben oder committen. API-Antworten nicht cachen. Keine lokale Identität aus Forwarded-Headern ableiten.
- Codex-Sandbox ist standardmäßig `workspace-write`; nur `execution.codexUnsafe === true` erlaubt den bestehenden Bypass. Die anderen Adapter behalten ihre bestehenden Berechtigungen.
- Beads ist optional und liest vorhandene Aufgaben über feste `bd`-Argumente. Keine automatische Initialisierung, Übernahme oder Schließung; ein erfolgreicher Lauf ist kein fachlicher Prüfbeleg.
- Skills-Inventar bleibt lesend; nur ausdrückliche Synchronisierung/Installation erzeugt Links.
- Vor einem Restart aktive Prozesse und `/api/runs` prüfen. Unterbrochene Aufgaben benötigen ausdrückliche Fortsetzung; niemals automatisch erneut dispatchen.
