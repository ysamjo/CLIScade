# Harness Router GUI – Architektur und nächste Schritte

Stand: 11. Oktober 2026. Die Oberfläche bleibt Vanilla JS ohne Bundler; Ausführung bleibt auf die feste Harness-Registry beschränkt.

## Umgesetzte Grundlage

| Modul | Verantwortung |
| --- | --- |
| `services/dispatch-service.js` | Auftragsannahme, dauerhafte Request-Deduplizierung, Queue, Projekt-Lock und Abbruch |
| `services/task-store.js` | SQLite-Transaktionen, Aufgaben, einzelne Versuche und strukturierte Ereignisse |
| `services/context-service.js` | Richtlinien, Aufgabe, Bild, Git-Stand und belegter beziehungsweise unbestätigter Zwischenstand |
| `services/access-control.js` | LAN-Anmeldung, Origin-/Host-Prüfung und HTTP-/WebSocket-Zugang |
| `services/beads-adapter.js` | Automatischer Projektkontext und optionale Aufgabenwahl; pro Projekt serialisiert |
| `public/task-state.js` | Gemeinsamer Vertrag für Erfolg, Fehler, Abbruch und unvollständige Ausführung |
| `runtime/` | Feste Programme, CLI-Argumente, Prozesssteuerung, normalisierte Ereignisse und native Sessions |
| `routing.js` | Reine Routing- und Scheduler-Entscheidungen |

## Kontext und Beads

Eine fachliche Aufgabe kann mehrere Harness-Versuche haben. Der Router speichert diese Versuche samt Ereignissen lokal. Beim Fallback oder einer Fortsetzung übergibt er Regeln, Auftrag, Bildhinweis, Git-Stand und den letzten gespeicherten Arbeitsstand. Agentenaussagen sind keine unabhängig verifizierten Fakten und ersetzen keine Richtlinien.

In bereits eingerichteten Projektordnern mit `.beads/` lädt der Router bei jedem Auftrag automatisch Projektwissen und Workflow aus `bd prime --full --readonly` sowie verfügbare Aufgaben aus `bd ready --json --readonly`. Die Aufgabenwahl ist optional und ergänzt Details über `bd show <id> --json --readonly`. Fallback und Konsens erhalten denselben Kontextstand; eine Fortsetzung liest den Projektkontext frisch. Ladefehler werden vor dem Harness-Start sichtbar, Aufträge ohne Beads bleiben unverändert. Umfang und Ladezeit werden am Auftrag gespeichert.

Der Router initialisiert keine Beads-Datenbanken, übernimmt oder erstellt keine Aufgabe automatisch und schließt sie nicht nach einem CLI-Exit. Beads verwaltet fachlichen Status, Abhängigkeiten und ausdrücklich gespeichertes Projektwissen; der Router verwaltet Ausführungsstatus und Protokolle. Wissensextraktion und fachliche Abnahme sind keine automatischen Nebenwirkungen eines Laufs.

## Nächste begrenzte Erweiterungen

1. Prüfbelege strukturiert erfassen: Befehl, Ergebnis, Zeitpunkt und Git-Stand; separat von Agentenbehauptungen.
2. Kontextvorschau mit Quellen und Umfang anzeigen, bevor ein Auftrag startet.
3. Explizite Beads-Übernahme und Abschluss nach überprüften Abnahmekriterien ergänzen; keine doppelte Pflege des fachlichen Status.
4. Scheduler und Telegram bei Änderungen schrittweise als Integrationen herauslösen.
5. Versionsgebundene Skills mit klaren Fähigkeiten prüfen; Inventar bleibt lesend, Synchronisierung bleibt eine ausdrückliche Aktion.

## Bewusst zurückgestellt

Embeddings, automatische Harness-Umsortierung und automatisch erzeugte AGENTS-Regeln benötigen zuerst belastbare Prüfbelege und eine Relevanzbewertung. Ein erfolgreicher CLI-Exit ist keine Qualitätsmessung. Frei konfigurierbare Executables widersprechen der Sicherheitsgrenze der Registry. Ein Framework-Wechsel oder allgemeines TypeScript-Refactoring gehört nicht zum Kontext-MVP.

## Abnahme

- Fehler und Abbrüche erscheinen nicht grün und geben Queue beziehungsweise Konsolenfeld frei.
- Regeln und Zwischenstand bleiben bei Fallback, fehlender Session und Konsens-Synthese erhalten.
- Historie und Request-IDs überleben Neustarts; unterbrochene Arbeit startet erst auf ausdrückliche Fortsetzung.
- LAN-Clients benötigen Anmeldung; fremde Origins dürfen weder HTTP-Aktionen noch WebSocket-Dispatch starten.
- Normale Aufträge bleiben ohne Beads nutzbar. Automatischer Beads-Kontext wird ohne Auswahl bei Start, Fallback, Fortsetzung und Konsens mit Stub-CLI geprüft; zusätzlich wurde Beads 1.3.1 mit einer echten Wegwerf-Datenbank getestet.
