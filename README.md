# Harness Router GUI ⚡

> **Multi-Agent Orchestrator, Live Studio & Remote Control für 8 Terminal-Coding-Agenten**

Harness Router GUI verbindet modernste KI-Entwicklungsagenten in einer intuitiven Web-Benutzeroberfläche und ermöglicht synchrones Multi-Model-Coding, vollautomatische Fallback-Routen, Konsens-Debatten zwischen zwei Modellen sowie Fernsteuerung von unterwegs via PWA, QR-Code und Telegram-Bot.

---

## 🚀 Unterstützte Harnesses (9 KI-Coding-Agenten)

1. **Claude Code (`claude`)**: Anthropics offizieller Terminal-Agent (Sonnet 3.7 & Opus 4.6).
2. **OpenAI Codex CLI (`codex`)**: Coding-CLI für OpenAI o3, o3-mini & GPT-4.5.
3. **Cline CLI (`cline`)**: Autonomer Open-Source Coding-Agent mit Diff-Editing.
4. **OpenCode (`opencode`)**: Terminal- und IDE-Workflow-Agent.
5. **Google Antigravity (`agy`)**: DeepMind Agentic Coding Framework.
6. **Qoder CLI (`qodercli`)**: Enterprise Coding CLI mit Qwen 3.8 Modellen.
7. **Freebuff (`freebuff`)**: Refactoring-Agent für Multi-Context & Space-Bunny-Modelle.
8. **CodeBuddy (`codebuddy`)**: Terminal-CLI für DeepSeek v3/v4 & Coding Assistants.
9. **Cursor CLI (`agent`)**: Cursor Agent im Terminal, Standard-Modell `auto`.

---

## 🌟 Hauptfunktionen

- **🖥️ Interaktives Terminal im Hauptfenster (neu):**
  - Das Hauptfenster startet die echten CLIs in einem Pseudo-Terminal (`node-pty` + `xterm.js`) – inklusive TUI, Farben und direkter Tastatureingabe.
  - **Freebuff, Claude Code, Codex, Cline, OpenCode, Antigravity, Qoder, CodeBuddy & Cursor** laufen damit als vollwertige Prozesse. Damit ist auch Freebuff (reines TUI-CLI ohne Headless-Modus) direkt nutzbar und liefert Live-Rückmeldung.
  - Zielordner = links ausgewähltes Projekt, CLI per Dropdown wählbar, `Starten` / `Beenden`.
  - Umschalter zwischen **Interaktives Terminal** (Standard) und **Auto-Route (KI-Dispatch)** – alle bisherigen Funktionen bleiben im Auto-Route-Modus erhalten.

- **🧭 Aufgeräumtes Layout:**
  - Linke Sidebar: alle Workspace-Ordner + Einstellungsbutton. Jeder Ordner ist **standardmäßig ausgeklappt**, der Task-Zähler steht direkt am Ordnernamen; Ordner ohne Tasks bleiben eine einzelne Zeile ohne leeren Platzhalter. Über `Nur Ordner mit Tasks zeigen` lässt sich die Sidebar auf relevante Projekte reduzieren.
  - **Der Chat/das Terminal steht im Mittelpunkt:** zentrierter Inhaltsbereich (max. 1120 px), kompakte Topbar, Toolbar und Sidebar.
  - Installations-Center, Usage, Skills, Scheduler & Co. liegen im Einstellungsdialog. Einstellungs- und Installer-Dialog sind auf `min(920px, 92vw)` bzw. `min(880px, 92vw)` begrenzt, unter 1200 px schaltet ein eigener Breakpoint auf kompakte Navigation um; Tabellen scrollen intern statt überzulaufen.

- **⚡ 1-Klick CLI-Installations-Center:**
  - Status-, Health- & Versionserkennung aller 9 CLIs in Echtzeit.
  - 1-Klick Einzelinstallation oder sequenzielle Batch-Installation (`🚀 Alle fehlenden CLIs installieren`).
  - Integrierte Live-Terminal-Konsole mit ANSI-Farben via WebSocket.

- **🔄 Automatisches Fallback-Weiter-Routing:**
  - Schlägt ein Harness fehl (z. B. CLI nicht im Pfad, API-Fehler, Auth-Problem), springt das System automatisch nahtlos zum nächsten konfigurierten Harness der Prioritätenliste.
  - Visuelle Fallback-Notizen im Terminal inklusive direktem `[⚡ 1-Klick Installieren]` Button.

- **🧠 Konsens-Modus (Dual-Engine Kooperation & Synthese):**
  - Sendet denselben Prompt an zwei unterschiedliche Engines (z. B. *Claude Code* & *Codex*).
  - Phase 1 & 2: Beide Engines erarbeiten unabhängig eine Lösung.
  - Phase 3: Ein Synthese-Agent führt eine kritische Gegenüberstellung durch und fusioniert beide Ansichten zur idealen Gesamtlösung.

- **📊 Live Usage & Kontingent-Dashboard:**
  - Anzeige verbleibender Token-Limits, Kontextfenster-Größen und Abrechnungsmodelle (Max Plan, Pay-per-Token, Free Tier) aller 9 Harnesses.

- **📱 Remote-App & Unterwegs-Steuerung:**
  - Responsive Mobile-Layout für Smartphones (Vollbild, Touch-optimiert, Slide-out Drawer).
  - PWA-Support (Progressive Web App, installierbar zum Homescreen).
  - QR-Code Scanner für sofortige LAN-Verbindung (`http://192.168.178.169:3000`).
  - Telegram-Bot Integration: Prompts von unterwegs senden, Aufgaben ausführen und Statusberichte empfangen.

- **🖼️ Multimodale Bild- & Screenshot-Anhänge:**
  - Drag & Drop, Zwischenablage (`Cmd+V` / Paste) oder Smartphone-Foto-Upload für UI-Bilder und Fehlermeldungen.

- **⏰ Geplante Tasks (Cron):**
  - Automatische Hintergrund-Jobs (stündlich, täglich, wöchentlich) mit Projektzuweisung und optionaler Telegram-Push-Benachrichtigung.

- **⚙️ Zentraler Einstellungsdialog:**
  - Workspace Root-Pfad & Projektbrowser.
  - Harness-Prioritäten & Modell-Zuweisung.
  - Integrierter `AGENTS.md` Regel-Editor (Global & Projekt-Level).
  - Skills & MCP-Plugin Übersicht.

---

## 🛠️ Schnellstart

### 1. Installation & Start

```bash
cd /Users/family/Developer/harness-router-gui
npm install
npm start
```

> `npm install` lädt neben Express/ws auch `node-pty` (nativer PTY-Treiber für das interaktive Terminal) und `@xterm/xterm` + `@xterm/addon-fit` (Terminal-Emulation im Browser). Beim Serverstart wird der `spawn-helper` von `node-pty` automatisch ausführbar gemacht, falls die Prebuild-Datei ohne Executable-Bit installiert wurde.

Der Server startet auf:
- **Lokal:** `http://localhost:3000`
- **Netzwerk (LAN):** `http://192.168.178.169:3000`

### 2. CLI-Befehl

Über den globalen Befehl starten:
```bash
harness-router-gui
# oder alias
harness-studio
```
