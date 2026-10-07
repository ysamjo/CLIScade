# Harness Router GUI

Browser-Oberfläche und Orchestrator, die mehrere KI-Coding-Harnesses (claude, codex, opencode, cline, codebuddy, qodercli, antigravity, freebuff, cursor) parallel über die Projektordner eines Workspace dispatcht — inklusive interaktivem PTY-Terminal und Telegram-Relay.

## Projekt-Kontext

| Modul | Pfad | Beschreibung |
| :--- | :--- | :--- |
| **Server** | `server.js` | Express 5 + `ws`: `/api/*`, Run-Pool, Dispatch-Queue, PTY, Einstellungen, Task-Historie |
| **Entscheidung** | `routing.js` | Reine Logik ohne IO: `dispatchSlotDecision`, `busyHarnessBlocker`, `knownBrokenBlocker`, `armIdleWatchdog`, `ptyOwnershipBlocker`, `startupRefusal`, `gatewayEnvFromShell` |
| **Oberfläche** | `public/` | Vanilla JS ohne Bundler: `app.js` (Zustand + Rendering), `index.html`, `style.css`, `icons.js`, `sw.js` |
| **Tests** | `test/` | `ui-smoke.mjs` (jsdom), `routing.test.js` (Entscheidungen), `dispatch_chain.test.js` (echte Kind-Prozesse gegen Stub-CLIs) |

**Laufzeitumgebung**: Node-Prozess auf Port `3000`, bindet `0.0.0.0` (im LAN sichtbar).
Zustand liegt **außerhalb** des Repos unter `~/.harness-dispatch/` — `config.yaml`
(Prioritätskette, Modelle, Kappe), `studio-tasks.json` (Auftragshistorie inkl. `archived`),
`AGENTS.md` (globaler Richtlinientext), `studio.log`.

## Konventionen
- **Entscheidungen gehören nach `routing.js`**, `server.js` verdrahtet nur. Ein Gate, das sich nicht
  ohne Kind-Prozess testen lässt, ist an der falschen Stelle.
- **Test zuerst schreiben und scheitern lassen.** `ui-smoke.mjs` zählt `pruefe()`-Behauptungen und am
  Ende aus; die Ketten-Tests fahren einen echten Server in eigenem `HOME` mit Stub-CLIs.
- `public/` wirkt nach einem Browser-Reload, `server.js` und `routing.js` erst nach einem
  **Prozess-Neustart** — kein Build-Schritt, keine Bundler-Dateien anlegen.
- Deutsch für UI-Texte, Kommentare, Meldungen und Commit-Messages; englische Code-Bezeichner.
- Erscheinung: kurze Zeilen, Gruppen, Zähler statt Erklärtext, kein Anbieter-Jargon.
  UI-Varianten **bauen und screenshoten** statt sie zu beschreiben.
- Browser-Prüfungen über Ego Lite (`ego-browser`), siehe globale `Developer/AGENTS.md` §2.

## Commands

```bash
npm start                        # Server auf http://localhost:3000
node test/ui-smoke.mjs           # 84 Prüfungen im jsdom (Struktur + Verhalten)
npm run test:routing             # 44 Tests: 25 Entscheidungen + 19 Dispatch-Ketten
npm test                         # alter Konsens-Test (test_consensus.js)

# Wegwerf-Instanz für Browser-Prüfungen — NIE die Instanz auf 3000 anfassen:
mkdir -p /tmp/hrg/bin && printf '#!/bin/sh\necho stub\n' > /tmp/hrg/bin/stub-run && chmod +x /tmp/hrg/bin/*
HOME=/tmp/hrg PATH=/tmp/hrg/bin:/usr/bin:/bin PORT=3921 node server.js
```

## Grenzen & Sicherheitsregeln
- **Port 3000 gehört dem Nutzer.** Dort läuft sein interaktives Terminal. Vor jedem Neustart zählen:
  `pgrep -P $(lsof -nP -iTCP:3000 -sTCP:LISTEN -t)` — ein laufender Agent-Task wird sonst mitgetötet,
  und bei freebuff kostet das die einzige aktive Session des Kontos (HTTP 409 `session_superseded`).
- **Neustart nur ohne `QODER_*`-Umgebung.** Scrubben als Array (`env "${scrub[@]}" node server.js`);
  eine per `$(...)` gebaute Zeichenkette zerlegt zsh **nicht**, der Server läuft dann trotzdem und
  vergiftet jedes `qodercli` mit `sdk_invalid_args`. Nachprüfen:
  `ps eww -p <PID> | tr ' ' '\n' | grep -cE '^QODER'` muss `0` sein.
- **LAN-offen**: jeder Spawn-Pfad bleibt über `PTY_ALLOWED_COMMANDS` / `TESTABLE_COMMANDS`
  (beide aus `CLI_INSTALL_REGISTRY` abgeleitet) auf die eingetragenen CLIs beschränkt.
  **Modell-Tests** laufen in einem Wegwerfverzeichnis (`harness-modeltest-…` unter `/tmp`),
  **Dispatches und PTY arbeiten direkt im gewählten Projektordner** — dort gibt es keine
  Isolation, der Auftrag schreibt im Original.
- **Secrets nie ausgeben oder übertragen**: `~/.config/manicode/credentials.json`,
  `~/.config/manicode/device-key.json`, der `ANTHROPIC_API_KEY`-Wert in `~/.zshrc`. Von der
  Gateway-Umbiegung dürfen nur Variablen**namen** geloggt werden.
- `.workbuddy-ai/` ist das Gedächtnis eines anderen Agenten — untracked lassen, nie committen.
- `origin` ist das **private** GitHub-Repo (`github.com/ysamjo/harness-router-gui`). Vor einem Push
  prüfen, was mitgeht (`git status --short`), und keine Schlüssel aus dem Laufzeitverzeichnis.
- Das GUI dispatchet auch in dieses Repo: vor `git checkout`/`reset`/Neustart prüfen, ob ein zweiter
  Agent gerade am Arbeitsbaum schreibt.
