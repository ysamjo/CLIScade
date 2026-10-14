const EVENT_TYPES = new Set(['start', 'text', 'thinking', 'tool_start', 'tool_result', 'question', 'warning', 'result', 'error', 'session_lost']);

// Letzte Schranke vor der Konsole. Ein Adapter darf kein Objekt als Text
// durchreichen: die Oberfläche macht daraus "[object Object]" und der Inhalt ist
// verloren — genau das ist clines Werkzeugergebnis passiert. Statt den Platzhalter
// zu zeigen, überlebt der Inhalt hier als JSON. Ein Adapter, der seine Form kennt,
// soll sie trotzdem selbst lesbar machen; das hier ist nur das Netz darunter.
function alsText(wert) {
  if (wert == null) return '';
  if (typeof wert === 'string') return wert;
  if (typeof wert === 'object') {
    try { return JSON.stringify(wert); } catch { return String(wert); }
  }
  return String(wert);
}

function canonicalEvent(event, harnessId) {
  if (!event || !EVENT_TYPES.has(event.type)) return null;
  const sauber = { ...event };
  if ('text' in sauber) sauber.text = alsText(sauber.text);
  if ('message' in sauber) sauber.message = alsText(sauber.message);
  if ('question' in sauber) sauber.question = alsText(sauber.question);
  // Eine Frage trägt ihre Optionen immer als Liste, auch wenn die CLI keine schickt:
  // die Oberfläche soll nicht bei jeder Anzeige prüfen müssen, ob es sie gibt.
  if (sauber.type === 'question' || 'options' in sauber) sauber.options = alsOptionen(sauber.options);
  return { ...sauber, harnessId, at: Date.now() };
}

// Die Optionen einer Auswahlabfrage sind Daten, kein Text: die Oberfläche baut daraus
// Knöpfe. Hier wird nur die Form vereinheitlicht, damit die Anzeige nicht raten muss.
function alsOptionen(wert) {
  if (!Array.isArray(wert)) return [];
  return wert.map((option) => {
    if (option && typeof option === 'object') {
      return { label: alsText(option.label), description: alsText(option.description) };
    }
    return { label: alsText(option), description: '' };
  }).filter((option) => option.label !== '');
}

module.exports = { canonicalEvent, alsText, alsOptionen };
