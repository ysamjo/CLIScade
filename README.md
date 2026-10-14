# CLIscade

Browser-Oberfläche für KI-Coding-Harnesses im lokalen Workspace. Die Oberfläche verwaltet Projektordner, Aufgaben, Auto-Route mit Fallback und Kontextübergabe, Konsensläufe, Zeitpläne und Telegram. Normale Aufträge arbeiten direkt im gewählten Projektordner.

## Schnellstart

Voraussetzungen: Node.js ab 22.13 und mindestens ein installiertes, angemeldetes Coding-Harness. Beads ist optional und wird nur in bereits eingerichteten Projekten verwendet.

```bash
git clone https://github.com/ysamjo/CLIScade.git
cd CLIScade
npm install
HOST=127.0.0.1 npm start
```

Öffne anschließend [localhost:3000](http://localhost:3000), wähle den Workspace und aktiviere die gewünschten Harnesses in den Einstellungen.

## Funktionen

- Priorisierte Harness-Kaskade mit automatischem Fallback und Kontextübergabe.
- Parallele Aufträge mit Warteschlange, Projekt-Sperre und gezieltem Abbruch.
- Dauerhafte Aufgabenhistorie, ausdrückliche Fortsetzung und Konsensläufe.
- Optionales Beads-Projektgedächtnis mit relevanten Erkenntnissen, Prüfbelegen und geprüften Sicherungen.
- Browser-Oberfläche, abgesicherter LAN-Zugang, Zeitpläne und Telegram-Steuerung.
- Die Seitenleiste merkt sich eingeklappte Ordner und den Filter für Ordner ohne Aufgaben; AGENTS-Marken öffnen den Projektregel-Editor. Archiv-Icons erscheinen am Desktop bei Hover oder Tastaturfokus und bleiben auf Touch-Geräten sichtbar.
- Nüchterne, dichte Oberfläche in **zwei Erscheinungsbildern**: dunkel und hell aus derselben Palette. Ohne eigene Wahl folgt sie dem System, der Umschalter im Seitenleisten-Fuß (am Telefon in der Kopfleiste) merkt die Entscheidung, `T` wechselt ebenfalls. Farbe steht ausschließlich in den beiden Variablenblöcken von `public/style.css` — `test/theme.test.js` hält das fest. Die Dichte ist Absicht: 228 px Seitenleiste, 20 px Projektzeile, 33 px Aufgabenzeile, 32 px Konsolenkopf, 36 px Eingabefeld (zwei Zeilen, wächst beim Tippen), 26 px Werkzeugknöpfe.
- Enge Zeilen statt Luft: die Seitenleiste ist 228 px breit und zeigt damit deutlich mehr Ordner und Aufträge gleichzeitig; auf Touch-Geräten bleiben Knöpfe und Eingabe groß genug. Die Zahlen hält `test/dichte.test.js` fest.
- Beads arbeitet in eingerichteten Projekten automatisch. Status, optionale Aufgabenbindung und bewusste Fehlerausnahme stehen ausschließlich im Einstellungsbereich **Projektgedächtnis**, je Konsole ein Eintrag. Der Arbeitsbereich trägt dafür keine Leiste; die Eingabe braucht keine Beads-Auswahl.
- Zu Beginn eine breite Konsole; erst ein zweiter geöffneter Auftrag oder neuer Task zeigt die zweite Konsole. Der auswählbare Projektordner ist der Konsolentitel, der Auftrag erscheint als Unterzeile.
- Task-Zeilen zeigen lokale Hersteller-Icons für alle 13 CLIs und daneben das Modell; der CLI-Name bleibt als Tooltip und Alternativtext erhalten.
- Abgeschlossene, fehlgeschlagene, abgebrochene und unterbrochene Tasks zeigen beim Hover die Archivaktion. Laufende und wartende Aufträge bleiben davon ausgenommen.
- Reasoning und Werkzeugausgaben bleiben während der Arbeit aufklappbar sichtbar und klappen beim Erscheinen der Antwort automatisch zu; anschließend lassen sie sich wieder öffnen. Aufgeklappt entfällt die doppelte Kopfzeile; ein kleiner Pfeil bleibt zum Zuklappen. Mehrzeilige strukturierte Ereignisse bleiben vollständig im passenden Bereich.
- Vier Leseschichten statt einer Textwüste: die **Antwort** ist Fließtext, der **Gedankengang** tritt gedämpft und kursiv zurück, der **Werkzeugaufruf** ist eine leise Zeile, und die **Ausgabe** bekommt eine eigene Fläche mit linker Kante und eigenem Grund — man sieht auf einen Blick, was der Agent gedacht hat und was tatsächlich passiert ist. Ein Block mit nur einer Zeile wird gar nicht erst eingeklappt: das Aufklappen zeigte genau die Zeile, die im Kopf schon steht.
- Erkennt ein Lauf eine **Rückfrage** mit Auswahlmöglichkeiten, steht sie als eigener Block mit anklickbaren Optionen samt Beschreibung da. Ein Klick übernimmt die vollständige Antwort (Frage + Option) in das Eingabefeld des Feldes; Enter schickt sie als Fortsetzung derselben Sitzung. Läufe sind headless — eine Antwort kann nicht in den laufenden Prozess zurück, deshalb dieser Weg statt eines Rückkanals.
- Die Konsole verhält sich wie eine Konsole: **solange der Prozess läuft, blinkt unten der Cursor**; das Ende trägt eine **Schlusszeile** mit Rückgabewert und Dauer (`Code 0 · 4,2 s`, bei Fehlschlag mit Grund); und wer während des Laufs hochscrollt, bekommt unten rechts eine **Sprungmarke ans Ende**, statt ziehen zu müssen. Der Verlauf wird dabei **nur dort neu gemalt, wo er sich ändert** — eine Textauswahl im Protokoll überlebt den nächsten Ausgabeschub.
- Mehrzeilige Auftragseingabe über die ganze Konsolenbreite; Kopieren, Abbrechen, Bildauswahl und Kontextvorschau unten als Icons mit Tooltip und Tastaturbedienung.


## Weitere Coding-CLIs

Die feste Registry umfasst weiterhin die acht bisherigen Harnesses und zusätzlich `junie`, `kilo`, `copilot`, `kiro` und `vibe`. Sie stehen in Routen-Auswahl, Installation/Erkennung, Modelltest, Fallback-Kaskade, Konsens, Scheduler und Telegram zur Verfügung. Bestehende Konfigurationen werden nicht um neue aktive Routen ergänzt. Unter **Einstellungen → Harnesses** eine Route hinzufügen, bei Bedarf die vom CLI unterstützte Modell-ID eingeben und **Test** ausführen.

| Harness / Executable | Offizieller Einmalmodus | Installation im Server-Benutzerkonto |
| --- | --- | --- |
| Junie / `junie` | `--task <Auftrag> --output-format text --project <Ordner>` | `curl -fsSL https://junie.jetbrains.com/install.sh | bash` |
| Kilo / `kilo` | `run --format json --thinking -- <Auftrag>` | `npm install -g @kilocode/cli` |
| Copilot / `copilot` | `-p <Auftrag> --no-ask-user --output-format json` | `npm install -g @github/copilot` |
| Kiro / `kiro-cli` | `chat --agent-engine v3 --no-interactive --output-format stream-json -- <Auftrag>` | `curl -fsSL https://cli.kiro.dev/install | bash` |
| Vibe / `vibe` | `--prompt <Auftrag> --output streaming` | `uv tool install mistral-vibe` (Python ≥3.12) |

Anmeldung erfolgt im jeweiligen CLI bzw. über dessen offizielle Umgebungsvariablen. Der Server lädt zusätzlich `JUNIE_API_KEY`, `KIRO_API_KEY`, `COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, `GITHUB_TOKEN`, `MISTRAL_API_KEY` und `VIBE_HOME` aus der Login-Shell; der Status nennt ausschließlich Variablennamen. Schlüssel werden nicht als CLI-Argumente übergeben. **Gefunden/installiert bedeutet nicht angemeldet oder kontingentberechtigt**; der Modelltest startet einen echten Modellaufruf in einem temporären Ordner und kann Kontingent verbrauchen.

`Standard` übernimmt die CLI-Modellauswahl. Junie, Kilo, Copilot und Kiro erhalten benutzerdefinierte Modelle über `--model`; Vibe über die nur für den Kindprozess gesetzte offizielle Variable `VIBE_ACTIVE_MODEL` (konfigurierter Vibe-Modellalias, kein erfundenes `--model`). Es werden keine freien Modellnamen oder Quoten aus Vermutungen vorbelegt.

**Berechtigungen:** Die neuen Adapter setzen weder `--auto`, `--allow-all*`, `--trust-all-tools`, `--auto-approve`, `--yolo`, `--trust` noch `--brave`. Werkzeugrechte müssen im jeweiligen CLI eingerichtet sein (Kilo-Berechtigungskonfiguration, Copilot-Werkzeug-/Pfadfreigaben, Kiro-V3-`permissions.yaml`, Vibe-Agentenregeln). Nicht genehmigte Werkzeuge können abgewiesen werden; erfasste Freigabefehler lösen Fallback aus, keine Eskalation. Die CLI-eigenen gespeicherten Regeln gelten weiterhin. **Junie vertraut nichtinteraktiven Projekten laut Hersteller automatisch**, einschließlich Projekt-MCP, Hooks und Skills; CLIscade meldet diese Grenze vor jedem Lauf und bietet hier keine zusätzliche Sandbox.

**Junie Lite:** Nach JetBrains-Anmeldung in `junie` über `/model` auswählen; CLIscade verwendet mit `Standard` die dort konfigurierte Auswahl. Die offizielle Referenz veröffentlicht keinen festen Lite-Headless-Alias, deshalb wird keiner erfunden. Junie Lite ist kein separates Executable; `Standard` garantiert allein keine kostenlose Modellauswahl. Der Anbieter veröffentlicht keine feste Lite-Quote. Die übrigen Freikontingente sind tarif-/accountabhängig; CLIscade garantiert keine kostenfreie Ausführung und berechnet keine fiktiven Restbudgets.

**Ausgabe und Fortsetzung:** Kilo-JSONL, Copilot-Session-Ereignisse, Kiro-ACP-Headless-Envelope und Vibe-Streaming-History werden normalisiert. Nur Kilo liefert hier dokumentierte Shell-Exit-Codes für gepaarte Werkzeugbelege; fehlende Codes bleiben `null`. Junie unterstützt zwar `json-stream`, aber die geprüfte offizielle Dokumentation enthält kein belastbares Ereignisschema: der Adapter nutzt Text, ohne native Session-ID oder Werkzeugbelege zu erfinden. Alle fünf beginnen bei Fortsetzung einen neuen CLI-Aufruf mit dem vorhandenen CLIscade-Auftrags-/Regel-/Fallback-Kontext; native Resume-Flags der Hersteller sind noch nicht an den SessionStore angebunden (`resumable: false`). Leere Antworten oder unbekannte strukturierte Ausgabe werden nicht als Erfolg gewertet. Anmeldung, Kontingent, Rate-Limit, Kontextlimit und fehlende Freigaben werden anhand erfasster Fehler klassifiziert; CLI-Versionen mit abweichendem Schema können einen sichtbaren Fehler liefern.

Dokumentationsstand: 11.10.2026. Grundlagen: [Junie Headless](https://junie.jetbrains.com/docs/junie-headless.html), [Junie Parameter](https://junie.jetbrains.com/docs/parameters.html), [Junie Lite](https://junie.jetbrains.com/docs/junie-lite.html), [Kilo CLI](https://kilo.ai/docs/code-with-ai/platforms/cli-reference), [Copilot programmatisch](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-programmatic-reference), [Copilot Ereignisse](https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/streaming-events), [Kiro Headless](https://kiro.dev/docs/cli/headless/), [Vibe Quellcode](https://github.com/mistralai/mistral-vibe). Kiro-Envelope mit installierter CLI 2.28.0 und einem echten werkzeugfreien `OK`-Modelltest bestätigt; Kilo-Parser gegen Run-Quellcode `6f08110`, Vibe-Parser gegen CLI-/History-Quellcode `4ae5c59` geprüft. Für Junie, Kilo, Copilot und Vibe sind die Server-/Kindprozessprüfungen Stub-Tests, keine authentifizierten Live-Modellläufe.

## Ausführung

- **Alle 13 Harnesses** laufen headless über `runHarness()` und einen gemeinsamen Process Runner. Claude Code, Codex, Cline, OpenCode, Kilo, Copilot, Kiro und Vibe liefern strukturierte Ereignisse; die anderen Adapter verarbeiten ihre Textausgabe.
- `runtime/registry.js` ist die feste Liste der ausführbaren Programme und Fähigkeiten. In `config.yaml` stehen Routen mit `harnessId`, Name, Modell und Aktivierung. Alte bekannte `command`-Routen werden beim Laden migriert; davor entsteht einmalig `config.yaml.before-harness-migration` als Sicherung. Frei angegebene Programme werden nicht ausgeführt.
- `runtime/adapters/` baut die CLI-Aufrufe und normalisiert Ausgaben. `runtime/process-runner.js` verwaltet Prozessgruppen, Abbruch und Zeitlimits. `runtime/session-store.js` prüft native Sessions vor Resume und verhindert parallele Turns derselben Session. `routing.js` trifft reine Routing- und Scheduler-Entscheidungen; `server.js` führt Queue, HTTP, WebSocket und Integrationen zusammen. Jeder Spawn erhält eine bereinigte Umgebung: das Gerüst der aufrufenden App (`SERVER__PORT`, `SERVER__HOST`) wird entfernt, sonst bindet der Harness deren belegten Web-UI-Port und bricht mit `EADDRINUSE` ab.

Die Adapterstruktur orientiert sich an den [Runner-Mustern von HarnessRouter](https://github.com/HarnessRouter/harnessrouter). Dieses Projekt nutzt dessen Server oder Container nicht als Abhängigkeit.

### Fachliche Autonomie ohne Rückfrage-Protokoll

`runtime/headless-prompt.js` stellt jedem Auftragskontext unmittelbar vor dem Adapter-Aufruf dieselbe Autonomieinstruktion voran. Sie gilt für alle 13 Harnesses, neue Aufträge, native Fortsetzungen, Fallback, Konsens, Scheduler, Telegram und Modelltests. Auftrag, Projektregeln und vorhandener Kontext bleiben vollständig erhalten; die feste Instruktion kommt zusätzlich zum ContextService-Budget hinzu.

Bei fachlichen Auswahlmöglichkeiten entscheiden die Agenten grundsätzlich selbst: keine Rückfragen oder Auswahlmenüs, keine Wartezeit auf Terminal-Eingaben. Sie wählen eine sinnvolle, möglichst kleine Lösung, dokumentieren wesentliche Annahmen samt Gründen kurz im Ergebnis und fahren mit Implementierung und passenden Tests fort. Explizite Nutzereinstellungen und Projekt-/AGENTS.md-Regeln haben Vorrang. Verlangen diese eine Bestätigung, darf der Agent sie nicht erfinden: Er soll die fehlende Voraussetzung als Fehler melden.

**Autonomie erweitert keine Werkzeugrechte.** Die Instruktion verbietet zusätzliche Tools/Rechte, Änderungen an Trust-/Freigabekonfigurationen, pauschale Freigabeflags und Sandbox-Umgehung. Die bestehenden Adapterflags und ausdrücklich gespeicherten Ausführungseinstellungen bleiben unverändert; insbesondere ist Codex weiterhin standardmäßig `workspace-write`. Bestehende pauschale Freigabe-/Trust-Flags älterer Adapter werden durch diese Änderung weder eingeführt noch entfernt. Das ist eine fachliche Arbeitsanweisung, keine zusätzliche technische Sandbox und keine Garantie für das Verhalten eines Modells.

STDIN bleibt geschlossen (`ignore`): Der Router sendet keine Auswahlantworten oder Freigaben. Erfasste Berechtigungsfehler sowie eindeutige CLI-Diagnosezeilen wie `Interactive mode is required`, `Cannot prompt in non-interactive mode` oder `stdin is not a TTY` enden kontrolliert mit Fallback, auch wenn die CLI dabei Exit-Code 0 liefert. Allgemeine Fragen oder zitierte Menütexte werden nicht heuristisch beantwortet. Blockiert eine CLI ohne verwertbare Fehlermeldung, gelten weiterhin 180 Sekunden ohne Ausgabe (`HARNESS_IDLE_TIMEOUT_MS` für Tests konfigurierbar) und 30 Minuten Gesamtzeit, auch bei wiederholt ausgegebenen Menüs. Anschließend SIGTERM, nach fünf Sekunden nötigenfalls SIGKILL; Benutzerabbruch bleibt `cancelled`. Ein einzelner oder letzter fehlgeschlagener Versuch endet als Fehler. Es gibt kein neues ACP-/WebSocket-Interaktionsprotokoll und keine UI-Rückfragen.

Die Tests `test/runtime/headless-prompt.test.js`, `test/runtime/process-runner.test.js`, `test/runtime/errors.test.js` und `test/new_clis_server.test.js` prüfen die Promptweitergabe an alle 13 Adapter, unveränderte Argumente/Berechtigungen, STDIN-EOF, native Fortsetzung, wiederholte Menüs mit Gesamtzeitlimit und Server-Fallback bei Berechtigungsfehlern, Interaktionsverweigerung und stillen Blockaden. Diese Prüfungen verwenden echte Kindprozesse mit Stub-CLIs; sie belegen keine autonome Entscheidung realer Anbietermodelle.

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

Die neuen CLI-Vertragstests (`test/runtime/new-clis.test.js`) prüfen Argumente, Ereignisse und Fehler mit echten Stub-Kindprozessen. `test/new_clis_server.test.js` prüft die fünf Modell-Endpunkte, Erkennung, Konfigurationspersistenz und die vollständige Quota-Kaskade einschließlich Regel-/Auftragskontext; sein Server verwendet einen freien Port.

`test/theme.test.js` liest `public/style.css` als Text und hält die Erscheinungsbilder zusammen: beide `:root`-Blöcke tragen denselben Variablensatz, außerhalb dieser Blöcke steht kein Farbliteral, und `index.html` verdrahtet `data-theme`, den Umschalter, `theme-color` und den Cache-Buster. Der Abschnitt „Erscheinungsbild: hell und dunkel" in `test/ui-smoke.mjs` prüft das Umschalten in jsdom.

`test/dichte.test.js` macht dasselbe für die Dichte: es sammelt alle Regeln zu einem Selektoren in Quellreihenfolge — der letzte Treffer außerhalb einer Medienabfrage ist der wirksame — und hält Obergrenzen für Seitenleiste, Zeilen, Konsolenkopf, Eingabefeld und Werkzeugknöpfe fest. Zwei Ausnahmen sind ausdrücklich geprüft: das Eingabefeld bleibt am Telefon bei 16 px Schrift (sonst zoomt iOS hinein) und der Plus-Knopf bei 24 px Höhe (sonst ist er mit dem Finger nicht zu treffen).

`test/runtime/events.test.js` prüft den Ereignis-Trichter: kein Adapter darf ein Objekt als Text durchreichen (sonst steht in der Konsole „[object Object]“), die Optionen einer Auswahlabfrage kommen immer als Liste aus `{label, description}` an, und ein Wagenrücklauf vor dem Umbruch verschwindet. `test/konsole_schichten.test.js` fährt die 58 Behauptungen der Leseschichten ohne Browser — darunter, dass ein einzeiliger Block kein Ordner wird, dass die Ausgabe eine eigene Schicht neben dem Werkzeugaufruf bildet, und dass beim Anhängen nur der letzte Block wächst (darauf ruht das teilweise Neuzeichnen). `test/new_clis_server.test.js` belegt mit echten Kindprozessen, dass der Server Aufruf und Ausgabe in getrennte Schichten legt und eine Rückfrage als anklickbare Karte malt; `test/ui-smoke.mjs` klickt eine Option an und prüft, dass der Auftragstext im Eingabefeld landet, ohne den Lauf zu starten — und hält dort fest, dass ein früherer Block beim nächsten Chunk **denselben DOM-Knoten** behält.

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

## Automatischer Beads-Projektkontext

Das externe Beads-CLI `bd` muss im Server-PATH installiert und im jeweiligen Projekt eingerichtet sein (geprüft mit Beads 1.3.1). Bei vorhandener `.beads/`-Ablage lädt der Router vor **jedem Auftrag automatisch** den Workflow über `bd prime --full --no-memories --readonly`, gespeichertes Projektwissen über `bd memories --json --readonly` und verfügbare Aufgaben über `bd ready --json --readonly`. Die Aufgabenwahl ist optional und ergänzt Details über `bd show <id> --json --readonly`. Fallback und Konsens erhalten denselben Kontextstand; eine Fortsetzung liest frisch.

1. **Projektwissen wächst automatisch:** Ein Abschlussblock `project-memory` liefert höchstens drei dauerhafte Entscheidungen und drei offene Punkte. Der Router speichert sie mit stabilen Schlüsseln, Auftrag, Git-Revision und Zeit über `bd remember … --key … --sandbox`. Wiederholungen erzeugen keine Duplikate; gleiche Schlüssel aktualisieren ältere Aussagen. Fortsetzungen ersetzen ihre offenen Punkte. Agentenaussagen bleiben unbestätigt; erkennbare Geheimnisse werden verworfen. Eine ältere Aussage anderer Schlüssel wird nicht automatisch als widerlegt erkannt. Fachliche Beads-Aufgaben und `AGENTS.md` werden nicht automatisch verändert.
2. **Prüfbelege bleiben getrennt:** Normalisierte Werkzeugereignisse liefern Befehl, Start/Ende, Exit-Code, Ergebnis, Git-Revision und damaligen Änderungsstand. Nur zugeordnete Werkzeugergebnisse mit tatsächlichem Exit-Code gelten als belegt; Text wie „Tests grün“ genügt nicht. Belege beschreiben diese Ausführung, keine allgemeine Abnahme des Projekts. Router-Aufträge und Checkpoints speichern die Belege; die letzten drei werden als Projektwissen übernommen.
3. **Kontext bleibt begrenzt:** Regeln, Auftrag und Bildhinweise bleiben vollständig. Insgesamt gelten 64.000 Zeichen; zu große Pflichtinhalte stoppen mit einer sichtbaren Meldung. Projektwissen wird nach Wortüberschneidung, Prüfstatus und Aktualität ausgewählt: höchstens zwölf ganze Einträge in 12.000 Zeichen. Bis zu zwanzig Aufgaben werden angezeigt. Optionale Abschnitte passen vollständig ins gemeinsame Budget oder werden mit einem Auslassungshinweis weggelassen.
4. **Status bleibt sichtbar:** Die Konsole zeigt aktive Erkenntnisse, Ladefehler und Sicherungsstand. Ein Beads-Ladefehler stoppt vor dem Harness-Start. Erst die ausdrückliche Auswahl **„Ohne Beads fortsetzen“** überspringt Lesen und Speichern für diesen Auftrag. Fehler beim Speichern ändern einen erfolgreichen Harness-Lauf nicht nachträglich in einen Fehler; der Wissensfehler bleibt sichtbar und am Auftrag gespeichert. Der Abschluss gibt das Projekt erst nach dem Speicher-Versuch frei.
5. **Sicherungen werden wiederhergestellt:** Bei Serverbetrieb prüft der Router alle 30 Minuten vorhandene Beads-Projekte im Workspace und einer Unterordnerebene. Ein neuer Stand entsteht mindestens täglich und nach neuen Erkenntnissen. Native Dolt-Sicherungen liegen versioniert unter `~/.harness-dispatch/beads-backups/`; sieben lokale Archive bleiben erhalten. Jedes neue Archiv wird in einem Wegwerfprojekt wiederhergestellt und mit Projektwissen sowie sämtlichen Aufgaben verglichen. Die Sicherungen bleiben ausschließlich lokal; es erfolgt keine automatische NAS-Übertragung.

Die native Backup-Konfiguration verwendet das lokale Sicherungsverzeichnis. `dolt-backup*.json` bleibt über `.git/info/exclude` aus Git herausgehalten. Die Sicherung umfasst Beads, nicht Router-SQLite oder Projektdateien.

```bash
node tools/backup-beads.js /Pfad/zum/Projekt       # einmalig sichern und Wiederherstellung prüfen
node tools/backup-beads.js --all /Users/family/Developer
                                                 # alle vorhandenen Beads-Projekte sichern
```

CLI-Zugriffe sind pro Projekt serialisiert und an dessen `.beads/` gebunden. Der Router richtet keine produktive Beads-Datenbank automatisch ein und übernimmt, erstellt oder schließt keine fachlichen Aufgaben. Projektregeln und aktueller Auftrag haben Vorrang vor Beads-Inhalten. Siehe [ROADMAP.md](ROADMAP.md).

Das Skills-Inventar (`GET /api/skills`) liest nur. Verlinken geschieht ausdrücklich über Synchronisierung oder Installation.

### Bilder aus der Zwischenablage

In die Auftragseingabe klicken und mit **⌘V** (Mac) oder **Strg+V** ein Bild einsetzen. Jede Konsole zeigt eine eigene Vorschau mit „Bild entfernen“. Unterstützt werden PNG, JPEG, GIF und WebP bis 10 MB. Erst beim Senden wird das Bild lokal hochgeladen und für den Agenten in den gewählten Projektordner kopiert. Ohne Text lautet der Auftrag „Analysiere das beigefügte Bild.“ Bei Übertragungsfehlern bleiben Bild und Text erhalten.

Die native Mac-App wandelt auch TIFF-Screenshots aus der Zwischenablage in PNG um. Bauen: `npm run build:mac`; installieren: `npm run install:mac`. Node.js ab 22.13 und Python müssen lokal verfügbar sein. Lokale Beads-Daten werden nicht in das App-Bundle aufgenommen.

Das Bündel enthält eine **eingefrorene Kopie** von `public/` und `server.js` (`Contents/Resources/app`, dorthin kopiert per `rsync`). Die App liest ausschließlich daraus. Änderungen an der Oberfläche erscheinen in der installierten App deshalb erst nach `npm run install:mac` — ein Reload genügt nicht, und `build/` ist von Git ausgenommen, sodass nichts von selbst nachzieht. Nachprüfen lässt sich der Stand der installierten App so:

```bash
grep -oE 'style.css\?v=[0-9]+' /Applications/CLIScade.app/Contents/Resources/app/public/index.html
```

Das Fenster folgt dem Erscheinungsbild der Oberfläche: ohne eigene Wahl dem System, danach der Wahl aus dem Umschalter. Die Oberfläche meldet sie über eine WebKit-Brücke. Ein festes dunkles Fenster ist der klassische Grund, warum der Hellmodus nie zu sehen ist — `window.appearance` legt auch `prefers-color-scheme` im WebView fest. Nach einem Neubau die App mit ⌘Q beenden und neu starten; das Schließen des Fensters blendet sie nur aus, die alte Seite bleibt dann stehen.

### Nutzerkonfiguration und portable Installation

CLIscade verwendet die Login-Shell des aktuellen Nutzers. Neben `ANTHROPIC_*` werden Claude-Provider-Schalter, `CLAUDE_CONFIG_DIR`, AWS-/Vertex-/Foundry-Einstellungen sowie Proxy- und Zertifikatseinstellungen übernommen. Bereits beim direkten Serverstart gesetzte Werte haben Vorrang. Der bereinigte Mac-Launcher entfernt Gateway-Werte der aufrufenden Agentensitzung; der Server liest danach die Nutzershell. Unter **Einstellungen → CLI-Diagnose → Terminal-Konfiguration neu laden** wird der Shell-Stand ohne Serverneustart erneuert. Neue Läufe verwenden ihn; laufende Aufträge behalten ihren Stand. Die Rückmeldung enthält nur eine Anzahl, keine Zugangsdaten. Shell-Aliase und Funktionen sind keine registrierten ausführbaren CLIs.

Node.js ab 22.13 wird über PATH und lokale nvm-Installationen erkannt; `HARNESS_NODE` erlaubt einen expliziten ausführbaren Pfad. Die Mac-App sucht Python 3 im Nutzer-PATH und üblichen Installationspfaden; `CLISCADE_PYTHON` erlaubt eine Vorgabe. Ohne passende Laufzeit erscheint eine konkrete Fehlermeldung. Der gebündelte Server und das aktuelle Nutzerverzeichnis ersetzen persönliche Entwicklerpfade.

### Mobile Bilder und Kontextvorschau

**Bild wählen** öffnet die Foto-/Dateiauswahl und verwendet dieselbe Vorschau und Größenprüfung wie Einsetzen. Pro Auftrag ein Bild: PNG, JPEG, GIF oder WebP bis 10 MB. Abbrechen der Auswahl erhält den bisherigen Entwurf.

Die Kontextvorschau ist optional; für normale Aufträge sind dort keine Einstellungen nötig. **Kontext ansehen** lädt Regeln und Beads frisch für den aktuellen Entwurf. Die Vorschau zeigt die tatsächliche Kontextzusammenstellung, Regelquellen, Erinnerungen, Bildhinweis, Git-Stand und Zeichenbudget; ausgelassene Inhalte bleiben erkennbar. Sie lädt Bilder nicht hoch, startet keinen Harness und schreibt keine Erinnerungen. Eine angekreuzte Fortsetzung ohne Beads gilt auch für die Vorschau. Beim späteren Start wird der Kontext erneut geladen; zwischenzeitliche Projektänderungen können ihn verändern.

- Lange Modellnamen: Task-Status, CLI-Icon, Modell und Uhrzeit bleiben in einer Zeile; das Modell wird bei Platzmangel gekürzt und ist im Tooltip vollständig lesbar. Im Konsolenkopf erhält die Ordnerauswahl die volle Breite, CLI-Icon und Modell stehen darunter. Desktop und Mobil mit zwei Konsolen prüfen.

- Folgeprompts nach einem Live-Lauf bleiben ohne Historienklick in derselben Konsole und übernehmen CLI, Modell und den jüngsten Vorgänger für den Kontext. Die Serverantwort wird über `requestId` zugeordnet; nur ältere Antworten ohne Anfrage-ID verwenden den Prompt als Rückfall. Ein bewusst neuer Task oder anderer Zielordner verwendet weiterhin die gewählte Route.

- Übergaben: doppelte Task-Bestätigungen sind idempotent. Wartende Folgeprompts bleiben beim laufenden Auftrag; beim Start werden Ordner und aktueller Vorgänger übernommen. Verdrängte Streams nehmen späte Ereignisse auf, dürfen aber Inhalt, Status, Tooltip oder Scrollposition eines anderen sichtbaren Tasks nicht ändern. Ein bewusst neuer Task bleibt auch bei nachträglichem Abschluss des alten Laufs ohne Vorgänger; bereits gesendete Anfragezuordnungen bleiben erhalten.

- Ruhige Detaildarstellung: Denk-/Werkzeugbereiche ohne gebogene farbige Seitenlinie oder Pillenrahmen; dezente horizontale Trennung. Aktive Navigation und Tasks verwenden die Hintergrundfläche statt einer seitlichen Akzentklammer. Klapppfeil, Fokus und automatische Faltung bleiben erhalten.
