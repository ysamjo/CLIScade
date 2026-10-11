# Harness Router GUI – Architektur und nächste Schritte

Stand: 11. Oktober 2026. Die Oberfläche bleibt Vanilla JS ohne Bundler; Ausführung bleibt auf die feste Harness-Registry beschränkt.

## Umgesetzte Grundlage

| Modul | Verantwortung |
| --- | --- |
| `services/dispatch-service.js` | Auftragsannahme, dauerhafte Request-Deduplizierung, Queue, Projekt-Lock und Abbruch |
| `services/task-store.js` | SQLite-Transaktionen, Aufgaben, einzelne Versuche und strukturierte Ereignisse |
| `services/context-service.js` | Richtlinien, Aufgabe, Bild, Git-Stand und belegter beziehungsweise unbestätigter Zwischenstand |
| `services/access-control.js` | LAN-Anmeldung, Origin-/Host-Prüfung und HTTP-/WebSocket-Zugang |
| `services/beads-adapter.js` | Optionale, pro Projekt serialisierte Zugriffe auf vorhandene Beads-Aufgaben |
| `public/task-state.js` | Gemeinsamer Vertrag für Erfolg, Fehler, Abbruch und unvollständige Ausführung |
| `runtime/` | Feste Programme, CLI-Argumente, Prozesssteuerung, normalisierte Ereignisse und native Sessions |
| `routing.js` | Reine Routing- und Scheduler-Entscheidungen |

## Kontext und Beads

Eine fachliche Aufgabe kann mehrere Harness-Versuche haben. Der Router speichert diese Versuche samt Ereignissen lokal. Beim Fallback oder einer Fortsetzung übergibt er Regeln, Auftrag, Bildhinweis, Git-Stand und den letzten gespeicherten Arbeitsstand. Agentenaussagen sind keine unabhängig verifizierten Fakten und ersetzen keine Richtlinien.

Beads ist eine optionale Anbindung an das externe `bd`-Projekt, kein selbstgebauter Name für Laufstatistiken. In bereits eingerichteten Projektordnern mit `.beads/` zeigt der Composer verfügbare Aufgaben aus `bd ready --json`. Eine gewählte ID wird vor der Ausführung mit `bd show <id> --json` gelesen und dem Kontext hinzugefügt. Der Router initialisiert keine Beads-Datenbanken, übernimmt keine Aufgabe automatisch und schließt sie nicht nach einem CLI-Exit. Beads bleibt für fachlichen Aufgabenstatus und Abhängigkeiten zuständig, der Router für Ausführungsstatus und Protokoll. Die aktuelle Anbindung liest Aufgaben; `bd prime`, dauerhafte Fakten und explizite Übernahme sind mögliche spätere Erweiterungen.

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
- Normale Aufträge bleiben ohne Beads nutzbar. Die Beads-Anbindung wird mit Stub-CLI getestet; echte Beads-Datenbanken benötigen zusätzlich einen Integrationstest.
