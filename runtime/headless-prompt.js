// Fachliche Autonomie ist keine Freigabe für Werkzeuge oder zusätzliche Rechte.
const HEADLESS_AUTONOMY_INSTRUCTION = `CLIscade: Headless-Auftrag mit fachlicher Autonomie
Arbeite ohne interaktives Rückfrage-Protokoll. Stelle grundsätzlich keine Rückfragen oder Auswahlmenüs und warte nicht auf Terminal-Eingaben.
Triff bei fachlichen Unklarheiten oder mehreren sinnvollen Optionen selbst eine nachvollziehbare, möglichst kleine und zum Auftrag passende Entscheidung. Dokumentiere wesentliche Annahmen und deren Gründe kurz im Ergebnis. Fahre innerhalb des autorisierten Auftrags mit Implementierung und passenden Tests fort.
Explizite Nutzereinstellungen und Projektregeln einschließlich AGENTS.md haben Vorrang vor dieser Standardinstruktion. Wenn sie eine ausdrückliche Entscheidung oder Bestätigung verlangen, erfinde diese nicht: Beende den Lauf kontrolliert mit einem klaren Fehler und benenne die fehlende Voraussetzung, statt interaktiv zu warten.
Fachliche Autonomie erteilt keine Tool- oder Sicherheits-Berechtigungen. Erweitere keine Tools oder Berechtigungen, ändere keine Freigabe-/Trust-Konfiguration und setze keine pauschalen Freigabeflags. Sandbox und bestehende Sicherheitsregeln nicht umgehen. Bereits ausdrücklich autorisierte Einstellungen bleiben maßgeblich.
Wenn die CLI zwingend eine interaktive Eingabe oder eine fehlende Berechtigung benötigt, beende den Lauf kontrolliert mit einem klaren Fehler; keine Freigabe vortäuschen und keine Auswahlantwort automatisch senden.`;

function prepareHeadlessPrompt(prompt) {
  return `${HEADLESS_AUTONOMY_INSTRUCTION}\n\n--- Auftragskontext ---\n${prompt}`;
}

module.exports = { prepareHeadlessPrompt, HEADLESS_AUTONOMY_INSTRUCTION };
