# CLIScade – Architektur und nächste Schritte

Stand: 11. Oktober 2026. Die Oberfläche bleibt Vanilla JS ohne Bundler; Ausführung bleibt auf die feste Harness-Registry beschränkt.

## Umgesetzte Grundlage

| Modul | Verantwortung |
| --- | --- |
| `services/dispatch-service.js` | Auftragsannahme, dauerhafte Request-Deduplizierung, Queue, Projekt-Lock und Abbruch |
| `services/task-store.js` | SQLite-Transaktionen, Aufgaben, einzelne Versuche und strukturierte Ereignisse |
| `services/context-service.js` | Richtlinien, Aufgabe, Bild, Git-Stand und belegter beziehungsweise unbestätigter Zwischenstand |
| `services/access-control.js` | LAN-Anmeldung, Origin-/Host-Prüfung und HTTP-/WebSocket-Zugang |
| `services/beads-adapter.js` | Automatischer Projektkontext und optionale Aufgabenwahl; pro Projekt serialisiert |
| `services/project-memory.js` | Strukturierte Erkenntnisse, Quellen, Prüfnachweise und Relevanzauswahl |
| `services/beads-backup.js` | Native versionierte Sicherungen, echte Wiederherstellungsprobe ohne automatische NAS-Übertragung |
| `public/task-state.js` | Gemeinsamer Vertrag für Erfolg, Fehler, Abbruch und unvollständige Ausführung |
| `runtime/` | Feste Programme, CLI-Argumente, Prozesssteuerung, normalisierte Ereignisse und native Sessions |
| `routing.js` | Reine Routing- und Scheduler-Entscheidungen |

## Kontext und Beads

Eine fachliche Aufgabe kann mehrere Harness-Versuche haben. Der Router speichert diese Versuche samt Ereignissen lokal. Beim Fallback oder einer Fortsetzung übergibt er Regeln, Auftrag, Bildhinweis, Git-Stand und den letzten gespeicherten Arbeitsstand. Agentenaussagen sind keine unabhängig verifizierten Fakten und ersetzen keine Richtlinien.

In eingerichteten Beads-Projekten lädt jeder Auftrag automatisch Workflow, getrennte Erinnerungen und verfügbare Aufgaben. Eine optionale Aufgabenwahl ergänzt Details. Das gemeinsame Kontextbudget beträgt 64.000 Zeichen und übernimmt ganze relevante Einträge. Ladefehler erscheinen in der Konsole; eine bewusste Fortsetzung ohne Beads ist möglich.

Strukturierte Abschlussberichte speichern Entscheidungen und offene Schritte mit stabilen Schlüsseln, Quellen und Prüfstatus zurück nach Beads. Werkzeugereignisse liefern tatsächliche Test-Exit-Codes samt Zeit und Git-Stand; Agentenbehauptungen bleiben unbestätigt. Ein Auftrag wird erst nach seinem Speicher-Versuch abgeschlossen. Fachliche Aufgaben und AGENTS-Regeln werden nicht automatisch geändert.

Native Beads-Sicherungen entstehen täglich und nach neuen Erkenntnissen. Jede neue Version wird in einer Wegwerf-Datenbank wiederhergestellt und mit allen Aufgaben sowie Erinnerungen verglichen. Die Sicherungen bleiben lokal; es erfolgt keine automatische NAS-Übertragung. Einzelheiten und manuelle Befehle stehen in der README.

## Nächste begrenzte Erweiterungen

1. Werkzeugbelege auch für Harnesses ergänzen, die derzeit keine strukturierten Exit-Codes liefern.
2. Umgesetzt: lesende Kontextvorschau mit Quellen, Bildhinweis und Zeichenbudget vor dem Start.
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
