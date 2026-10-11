# HarnessCascade macOS App

Schlanke, native macOS-Desktop-Anwendung für den HarnessCascade.

## Merkmale

- **100% Native WebKit-Einbettung (Swift + WKWebView)**: Kein Electron, kein Chromium-Ballast, sofort startklar und unter 1 MB Binärgröße.
- **Automatischer Server-Lifecycle**:
  - Prüft beim Start, ob der Hintergrund-Server auf Port `3000` bereits aktiv ist.
  - Startet den Server bei Bedarf automatisch im Hintergrund via `tools/start-detached.py` (mit sauber bereinigter Umgebung gemäß `AGENTS.md`).
  - Beendet den Server beim Schließen der App sauber, sofern keine aktiven Tasks laufen.
  - **Aufgaben-Schutz**: Laufen noch KI-Dispatches in der Queue oder im Pool, erscheint eine Sicherheitsabfrage mit Wahlmöglichkeit (*Abbrechen*, *Trotzdem beenden* oder *Im Hintergrund weiterlaufen lassen*).
- **macOS-Integration**:
  - Eigenes App-Icon (automatisch aus `public/icon.svg` als hochauflösendes `.icns` mit Retina-Auflösungen bis 1024x1024 gerendert).
  - Native Menüleiste mit Shortcuts (`Cmd+R` für Reload, `Cmd+Option+I` für DevTools, `Cmd+,` für Einstellungen, `Cmd+Shift+B` für Standard-Browser).
  - Dunkles Design passend zur Web-Oberfläche mit nativem Lade- und Fehlerstatus.

## Bauen & Installieren

```bash
# Bauen nach build/HarnessCascade.app
npm run build:mac

# Bauen und direkt nach /Applications installieren
npm run install:mac

# Gebaute App starten
npm run open:mac
```

Bilder und Screenshots mit **⌘V** in die Auftragseingabe einsetzen. Die App wandelt native TIFF-Bilder in PNG um; Vorschau und Entfernen erfolgen direkt in der jeweiligen Konsole. Node.js mindestens 22.13 und Python werden lokal vorausgesetzt.
