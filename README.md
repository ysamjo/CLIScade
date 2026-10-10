# Harness Router GUI

Browser-Oberfläche für KI-Coding-Harnesses im lokalen Workspace. Die Oberfläche verwaltet Projektordner, Aufgaben, Auto-Route mit Fallback und Kontextübergabe, Konsensläufe, Zeitpläne und Telegram. Normale Aufträge arbeiten direkt im gewählten Projektordner.

## Ausführung

- **Claude Code, Codex, Cline, OpenCode, Qoder, Antigravity, CodeBuddy und Cursor** laufen headless über `runHarness()` und einen gemeinsamen Process Runner. Die vier erstgenannten Harnesses liefern strukturierte Ereignisse; die anderen Adapter verarbeiten ihre Textausgabe.
- `runtime/registry.js` ist die feste Liste der ausführbaren Programme und Fähigkeiten. In `config.yaml` stehen Routen mit `harnessId`, Name, Modell und Aktivierung. Alte bekannte `command`-Routen werden beim Laden migriert; davor entsteht einmalig `config.yaml.before-harness-migration` als Sicherung. Frei angegebene Programme werden nicht ausgeführt.
- `runtime/adapters/` baut die CLI-Aufrufe und normalisiert Ausgaben. `runtime/process-runner.js` verwaltet Prozessgruppen, Abbruch und Zeitlimits. `runtime/session-store.js` prüft native Sessions vor Resume und verhindert parallele Turns derselben Session. `routing.js` trifft reine Routing- und Scheduler-Entscheidungen; `server.js` führt Queue, HTTP, WebSocket und Integrationen zusammen.

Die Adapterstruktur orientiert sich an den [Runner-Mustern von HarnessRouter](https://github.com/HarnessRouter/harnessrouter). Dieses Projekt nutzt dessen Server oder Container nicht als Abhängigkeit.

## Start und Zustand

```bash
npm install
npm start
```

Der Server lauscht standardmäßig auf `0.0.0.0:3000`; `PORT` überschreibt den Port. Für lokalen Zugriff ohne LAN-Freigabe kann `HOST=127.0.0.1` gesetzt werden. Die Oberfläche liegt unter `http://localhost:3000`. Bei LAN-Zugriff sind nur die fest registrierten Programme startbar. Dispatch und Modelltest verwenden den gewählten Ordner innerhalb des konfigurierten Workspace-Roots. Ungültige oder über Symlinks ausbrechende Pfade werden abgelehnt.

Laufzeitdaten liegen außerhalb des Repos in `~/.harness-dispatch/`: `config.yaml`, `studio-tasks.json`, `schedules.json`, `AGENTS.md`, `studio.log` und Uploads. Das Bot-Token bleibt dort; `GET /api/config` liefert es nicht zurück. Telegram-Zugriff erfordert explizit eingetragene Nutzer-IDs.

Der AGENTS-Editor schreibt nur `AGENTS.md` im Workspace-Root, im ausgewählten Projekt oder in `~/.harness-dispatch/`. Ein Auftrag übernimmt die Regeln aus Root und Projekt; die globale Datei dient als Fallback.

## Tests

```bash
npm test                         # Hermetische Laufzeit-, Routing-, API- und UI-Tests
npm run test:routing             # Node-Testdateien einschließlich runtime/
node test/ui-smoke.mjs           # Oberfläche in jsdom
```

Die Kettentests starten eigene Server auf 3911 und 3912 mit Wegwerf-`HOME` und Stub-CLIs. Sie berühren den Nutzer-Server auf Port 3000 nicht. Für eine manuelle Browser-Prüfung einen eigenen Server auf einem anderen Port und mit eigenem `HOME` starten. Änderungen an `server.js` oder `runtime/` werden erst nach dessen Neustart wirksam; Änderungen in `public/` nach einem Reload.

## Grenzen

Ein Headless-Auftrag kann Dateien im ausgewählten Projekt ändern. Ein Projekt-Lock verhindert parallele Dispatches in denselben Ordner; die native Session-Sperre verhindert zwei Turns in derselben Session. Fehlende Sessions beginnen einen neuen CLI-Thread mit expliziter Meldung. Abbruch wird als `cancelled` gespeichert. Konsens ist nur `completed`, wenn alle drei Phasen erfolgreich waren; bei einem ausgefallenen Ansatz lautet der Status `incomplete`.
