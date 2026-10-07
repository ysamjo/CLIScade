// Ein Ordner gehört zu einer Konsole: Der zweite Auftrag darin wartet unter dem
// laufenden — er zieht nicht in das andere Feld und verdrängt dort nichts.
//
// Warum das hier steht: die Aufteilung der zwei Felder ist der einzige Beweis, den der
// Nutzer im Browser sieht. Der Test fährt dazu die echte Oberfläche in jsdom.
// Läuft mit: npm run test:routing

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const PUBLIC = process.env.PUBLIC_DIR || path.join(__dirname, '..', 'public');
const JSDOM_PFAD = path.join(
  os.homedir(), '.workbuddy-ai', 'binaries', 'node', 'workspace', 'node_modules', 'jsdom', 'lib', 'api.js'
);
const { JSDOM } = require(process.env.JSDOM_MODULE || JSDOM_PFAD);

const ruhen = async (n = 10) => {
  for (let i = 0; i < n; i += 1) await new Promise((r) => setTimeout(r, 0));
};

const CLIS = [
  { name: 'Cline', cmd: 'cline', available: true, version: '1.0' },
  { name: 'Qoder', cmd: 'qoder', available: true, version: '2.0' }
];

const ANTWORTEN = {
  'GET /api/status': { health: CLIS, clis: CLIS, dispatch: { max_concurrent: 0 } },
  'GET /api/workspace': {
    projects: [
      { name: 'proj-q', path: '/tmp/proj-q' },
      { name: 'proj-r', path: '/tmp/proj-r' }
    ],
    tasks: []
  },
  'GET /api/model-presets': {},
  'GET /api/agents-md': {},
  'GET /api/skills': [],
  'GET /api/usage': {},
  'GET /api/remote': {},
  'GET /api/schedules': [],
  'GET /api/installer/status': {},
  'GET /api/runs': { running: [], queued: [], maxConcurrent: 0 }
};

class TerminalStub {
  constructor() { this.cols = 100; this.rows = 30; }
  open() {}
  loadAddon() {}
  onData() {}
  write() {}
  reset() {}
  clear() {}
  focus() {}
  dispose() {}
}

// Die echte Seite mit dem echten Skript; der WebSocket zeichnet nur auf.
async function oberflaeche() {
  let socket = null;
  class WebSocketStub {
    static CONNECTING = 0;
    static OPEN = 1;
    constructor() {
      this.readyState = WebSocketStub.CONNECTING;
      this.sent = [];
      socket = this;
    }
    send(rohtext) { this.sent.push(JSON.parse(rohtext)); }
    close() { this.readyState = 3; }
  }

  const dom = new JSDOM(fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8'), {
    url: 'http://localhost:3000/',
    runScripts: 'outside-only',
    // setStudioMode misst das Terminal in requestAnimationFrame — ohne diese Option
    // liefert jsdom sie nicht und der Bootstrap bricht ab.
    pretendToBeVisual: true
  });
  const { window } = dom;
  const { document } = window;

  window.onerror = () => {};
  window.alert = () => {};
  window.confirm = () => true;
  window.open = () => null;
  window.WebSocket = WebSocketStub;
  window.Terminal = TerminalStub;
  window.FitAddon = { FitAddon: class { fit() {} } };
  window.fetch = async (pfad, optionen = {}) => ({
    ok: true,
    status: 200,
    json: async () => ANTWORTEN[`${optionen.method || 'GET'} ${pfad}`] ?? ANTWORTEN[pfad] ?? {}
  });

  window.eval(fs.readFileSync(path.join(PUBLIC, 'icons.js'), 'utf8'));
  window.eval(fs.readFileSync(path.join(PUBLIC, 'app.js'), 'utf8'));
  if (document.readyState !== 'loading') document.dispatchEvent(new window.Event('DOMContentLoaded'));
  await ruhen(12);

  socket.readyState = WebSocketStub.OPEN;
  socket.onopen();
  await ruhen(6);

  const sag = (json) => socket.onmessage({ data: JSON.stringify(json) });
  const konsole = (i) => document.querySelector(`#run-split .run-pane:nth-child(${i + 1})`);
  const text = (i) => konsole(i)?.textContent || '';
  const titel = (i) => (konsole(i)?.querySelector('.run-pane-title')?.textContent || '').trim();
  // Welches Feld einen Lauf zeigt, verrät nur seine Ausgabe.
  const feldMit = (suchtext) => [0, 1].find((i) => text(i).includes(suchtext));

  return { sag, text, titel, feldMit };
}

const auftrag = (id, ordner, titelText) => ({
  id, prompt: titelText, projectPath: `/tmp/${ordner}`, projectName: ordner,
  harness: 'Cline', model: 'plan-free', status: 'queued', outputHtml: ''
});

// Erster Auftrag läuft, zweiter im selben Ordner ist eingereicht.
async function zweiImOrdnerQ() {
  const seite = await oberflaeche();
  seite.sag({ type: 'task_created', taskId: 'p1', task: auftrag('p1', 'proj-q', 'Erster in Ordner Q') });
  seite.sag({ type: 'route_selected', taskId: 'p1', harness: 'Cline', command: 'cline', model: 'plan-free' });
  seite.sag({ type: 'output', taskId: 'p1', html: 'P1-AUSGABE' });
  await ruhen(4);

  const feld = seite.feldMit('P1-AUSGABE');
  assert.notStrictEqual(feld, undefined, 'der erste Auftrag muss ein Feld haben');
  const vorher = seite.titel(1 - feld);
  seite.sag({ type: 'task_created', taskId: 'p2', task: auftrag('p2', 'proj-q', 'Zweiter in Ordner Q') });
  await ruhen(4);
  return { ...seite, feld, vorher };
}

test('wartet der zweite Auftrag im selben Ordner unter dem ersten', async () => {
  const q = await zweiImOrdnerQ();

  assert.strictEqual(q.titel(1 - q.feld), q.vorher,
    'das andere Feld darf den wartenden Auftrag nicht übernehmen');
  assert.match(q.text(q.feld), /⏳/);
  assert.match(q.text(q.feld), /Zweiter in Ordner Q/,
    'der wartende Auftrag muss in der Konsole seines Ordners stehen');
  assert.match(q.text(q.feld), /P1-AUSGABE/, 'das laufende Protokoll bleibt darüber stehen');

  q.sag({
    type: 'queued', taskId: 'p2', reason: 'project', blockerTaskId: 'p1',
    message: 'Warteschlange: in proj-q arbeitet bereits ein Auftrag'
  });
  await ruhen(4);
  assert.match(q.text(q.feld), /Warteschlange: in proj-q/, 'der Grund gehört zum wartenden Eintrag');
  assert.strictEqual(q.titel(1 - q.feld), q.vorher, 'das andere Feld bleibt von der Warteschlange unberührt');
});

test('zieht der wartende Auftrag bei der Übergabe in dasselbe Feld', async () => {
  const q = await zweiImOrdnerQ();

  q.sag({ type: 'done', taskId: 'p1', exitCode: 0, message: 'Fertig' });
  await ruhen(4);
  q.sag({ type: 'route_selected', taskId: 'p2', harness: 'Cline', command: 'cline', model: 'plan-free' });
  q.sag({ type: 'output', taskId: 'p2', html: 'P2-AUSGABE' });
  await ruhen(6);

  assert.match(q.text(q.feld), /P2-AUSGABE/, 'der übergebene Auftrag startet im Feld seines Ordners');
  assert.match(q.text(q.feld), /P1-AUSGABE/, 'das alte Protokoll bleibt über der Naht stehen');
  assert.match(q.text(q.feld), /aus der Warteschlange/);
  assert.doesNotMatch(q.text(q.feld), /⏳/, 'der Eintrag ist Übergabe, nicht mehr wartend');
  assert.strictEqual(q.titel(1 - q.feld), q.vorher, 'das andere Feld hat die ganze Zeit unverändert gestanden');
  assert.doesNotMatch(q.text(1 - q.feld), /P2-AUSGABE/);
});

test('bekommt ein Auftrag in einem anderen Ordner weiter das freie Feld', async () => {
  const q = await oberflaeche();
  q.sag({ type: 'task_created', taskId: 'p1', task: auftrag('p1', 'proj-q', 'Erster in Ordner Q') });
  q.sag({ type: 'route_selected', taskId: 'p1', harness: 'Cline', command: 'cline', model: 'plan-free' });
  q.sag({ type: 'output', taskId: 'p1', html: 'P1-AUSGABE' });
  await ruhen(4);
  const feld = q.feldMit('P1-AUSGABE');

  q.sag({ type: 'task_created', taskId: 'r1', task: auftrag('r1', 'proj-r', 'Auftrag in Ordner R') });
  q.sag({ type: 'route_selected', taskId: 'r1', harness: 'Qoder', command: 'qoder', model: 'auto' });
  q.sag({ type: 'output', taskId: 'r1', html: 'R1-AUSGABE' });
  await ruhen(6);

  assert.strictEqual(q.feldMit('R1-AUSGABE'), 1 - feld, 'ein anderer Ordner ist ein zweites Feld wert');
  assert.doesNotMatch(q.text(1 - feld), /⏳/);
});
