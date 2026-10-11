# Harness Router GUI

Browser-Oberfläche für KI-Coding-Harnesses im lokalen Workspace. Die Oberfläche verwaltet Projektordner, Aufgaben, Auto-Route mit Fallback und Kontextübergabe, Konsensläufe, Zeitpläne und Telegram. Normale Aufträge arbeiten direkt im gewählten Projektordner.

## Ausführung

- **Claude Code, Codex, Cline, OpenCode, Qoder, Antigravity, CodeBuddy und Cursor** laufen headless über `runHarness()` und einen gemeinsamen Process Runner. Die vier erstgenannten Harnesses liefern strukturierte Ereignisse; die anderen Adapter verarbeiten ihre Textausgabe.
- `runtime/registry.js` ist die feste Liste der ausführbaren Programme und Fähigkeiten. In `config.yaml` stehen Routen mit `harnessId`, Name, Modell und Aktivierung. Alte bekannte `command`-Routen werden beim Laden migriert; davor entsteht einmalig `config.yaml.before-harness-migration` als Sicherung. Frei angegebene Programme werden nicht ausgeführt.
- `runtime/adapters/` baut die CLI-Aufrufe und normalisiert Ausgaben. `runtime/process-runner.js` verwaltet Prozessgruppen, Abbruch und Zeitlimits. `runtime/session-store.js` prüft native Sessions vor Resume und verhindert parallele Turns derselben Session. `routing.js` trifft reine Routing- und Scheduler-Entscheidungen; `server.js` führt Queue, HTTP, WebSocket und Integrationen zusammen. Jeder Spawn erhält eine bereinigte Umgebung: das Gerüst der aufrufenden App (`SERVER__PORT`, `SERVER__HOST`) wird entfernt, sonst bindet der Harness deren belegten Web-UI-Port und bricht mit `EADDRINUSE` ab.

Die Adapterstruktur orientiert sich an den [Runner-Mustern von HarnessRouter](https://github.com/HarnessRouter/harnessrouter). Dieses Projekt nutzt dessen Server oder Container nicht als Abhängigkeit.

## Start und Zustand

```bash
# Node.js ab 22.13 (integriertes SQLite)
npm install
npm start
```

Der Server lauscht standardmäßig auf `0.0.0.0:3000`; `PORT` überschreibt den Port. Für lokalen Zugriff ohne LAN-Freigabe kann `HOST=127.0.0.1` gesetzt werden. Die Oberfläche liegt unter `http://localhost:3000`. LAN-Zugriff erfordert einen Zugangscode; HTTP und WebSocket prüfen zusätzlich Host und Origin. Lokal über localhost ist keine Anmeldung nötig. Nur die fest registrierten Programme sind startbar. Dispatch und Modelltest verwenden den gewählten Ordner innerhalb des konfigurierten Workspace-Roots. Ungültige oder über Symlinks ausbrechende Pfade werden abgelehnt.

Laufzeitdaten liegen außerhalb des Repos in `~/.harness-dispatch/`: `config.yaml`, `studio.sqlite` (mit WAL/SHM während des Betriebs), `schedules.json`, `AGENTS.md`, `lan-access-code`, `studio.log` und Uploads. Eine vorhandene `studio-tasks.json` wird einmalig mit Sicherung unter `studio-tasks.json.before-sqlite` übernommen. Bei einer beschädigten alten Historie bricht der Start mit einem Fehler ab, statt Daten zu überschreiben. Das Bot-Token bleibt dort; `GET /api/config` liefert es nicht zurück. Telegram-Zugriff erfordert explizit eingetragene Nutzer-IDs.

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

## Abbruch

Ein Abbruch ist ein eigener Abschluss, kein `done` mit Exit-Code 130. Der Server meldet ihn zweistufig:

- `abbruch_laeuft` quittiert den Wunsch sofort — der Prozess stirbt nicht im selben Moment. Die Oberfläche sperrt den Knopf und beschriftet ihn mit „Bricht ab…", damit ein Abbruch, der nicht greift, sichtbar bleibt.
- `cancelled` meldet das Ergebnis (Exit-Code 130). Der Auftrag steht danach als `cancelled` im Baum (⊘ statt ●), die Meldung ist gelb statt grün, und der Abbrechen-Knopf verschwindet.

Ein abgebrochener Lauf hält keinen Platz mehr: sein Feld ist für den nächsten Auftrag frei, und ein Auftrag im selben Ordner wartet nicht mehr dahinter. Wartet ein Auftrag unter einem laufenden, trägt seine ⏳-Zeile ein eigenes ✕ — der Abbrechen-Knopf im Kopf gilt dem laufenden. Bricht der *wartende* Auftrag ab, verschwindet seine Zeile; bricht der *laufende* ab, rückt der wartende in dasselbe Feld nach, und die Naht nennt den Grund („übernommen, weil der vorige Auftrag abgebrochen wurde").

## Zugang und Ausführungsrechte

Der LAN-Zugangscode liegt nur lokal unter `~/.harness-dispatch/lan-access-code` (Dateirechte 600). Auf dem Mac die Datei öffnen und den Code auf dem anderen Gerät im Anmeldedialog eingeben. Die Anmeldung gilt zwölf Stunden und wird als HttpOnly-/SameSite-Cookie gespeichert. Andere Origins und nicht zum Rechner gehörende Hostnamen werden abgelehnt. Reverse-Proxies und eigene DNS-Namen benötigen eine gesonderte Zugangskonfiguration; Forwarded-Header werden nicht als lokale Identität akzeptiert.

Codex schreibt standardmäßig innerhalb der `workspace-write`-Sandbox. In den Routing-Einstellungen kann ausdrücklich „Codex ohne Sandbox ausführen“ aktiviert werden; die Freigabe wird als `execution.codexUnsafe` gespeichert und gilt für alle Codex-Aufträge. Andere Harnesses behalten ihre bestehenden CLI-Berechtigungen; der Router verspricht keine gemeinsame Sandbox für alle Programme.

## Aufträge, Wiederaufnahme und Kontext

`services/dispatch-service.js` nimmt Aufträge an und verwaltet Queue und Projekt-Lock. `services/task-store.js` speichert Aufgaben, Request-IDs und einzelne Harness-Versuche samt Ereignissen transaktional in SQLite. `GET /api/tasks/:id/attempts` liefert deren Ereignisse. HTML ist die kompatible Anzeigeprojektion; strukturierte Ereignisse und Zwischenstände bleiben separat gespeichert.

Nach einem Server-Neustart stehen zuvor laufende oder wartende Aufgaben als `incomplete` in der Historie. Sie starten nicht automatisch: Aufgabe anklicken und eine Fortsetzung in der Konsole senden. Dabei werden Ziel, Regeln, Bildhinweis, letzter Arbeitsstand und aktueller Git-Stand erneut zusammengestellt. Eine fehlende native Session verliert dadurch nicht den gespeicherten Router-Kontext. Zwischenstände aus Agentenausgaben sind ausdrücklich nicht unabhängig verifiziert. Regeln werden nicht automatisch aus solchen Aussagen erzeugt.

Zum Sichern von `studio.sqlite` den Server zuerst ohne aktive Aufträge beenden und danach die Datenbank kopieren; eine einzelne Dateikopie während des WAL-Betriebs ist kein vollständiges Backup. Die alte JSON-Datei ist nach der Migration nur noch Sicherung, kein aktiver Speicher. Niemals bei laufendem Server durch eine JSON-Datei ersetzen.

## Optionale Beads-Aufgaben

Das externe Beads-CLI `bd` muss separat installiert und im jeweiligen Projekt eingerichtet sein. Der Router verändert dabei weder `AGENTS.md` noch die Beads-Konfiguration. Bei vorhandener `.beads/`-Ablage erscheint im Composer eine Aufgabenwahl aus `bd ready --json`; die gewählte Aufgabe wird mit `bd show <id> --json` in den Kontext geladen. Zugriffe des Routers sind pro Projekt serialisiert. Ohne Beads bleibt die normale Eingabe unverändert verfügbar. Fehler beim Laden einer ausdrücklich gewählten Beads-Aufgabe stoppen diesen Auftrag sichtbar.

Eine Beads-Aufgabe kann mehrere Router-Ausführungen besitzen. Der Router liest den fachlichen Status, übernimmt und schließt Beads-Aufgaben aber nicht automatisch. Abhängigkeiten und Projektwissen verwaltet Beads; Ausführungsfehler, Abbrüche und Prüfprotokolle verwaltet der Router. Aktuell angebunden sind Aufgabenwahl und Kontext, keine automatische Wissensextraktion. Siehe [ROADMAP.md](ROADMAP.md).

Das Skills-Inventar (`GET /api/skills`) liest nur. Verlinken geschieht ausdrücklich über Synchronisierung oder Installation.
