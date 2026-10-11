const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFileSync, execSync, exec } = require('child_process');
const yaml = require('js-yaml');
const Convert = require('ansi-to-html');
const QRCode = require('qrcode');
const { TaskStore } = require('./services/task-store');
const { createDispatchService, DEFAULT_MAX_CONCURRENT } = require('./services/dispatch-service');
const { loadRules, gitState, checkpoint, buildContext } = require('./services/context-service');
const { BeadsBackupService, defaultNas } = require('./services/beads-backup');
const { recordToolEvidence } = require('./services/project-memory');
const { BeadsAdapter } = require('./services/beads-adapter');
const { createAccessControl } = require('./services/access-control');
const { terminalMessage } = require('./public/task-state');
const {
  knownBrokenBlocker,
  dispatchSlotDecision,
  gatewayEnvFromShell,
  isJobDue,
  RUN_IDLE_TIMEOUT_MS
} = require('./routing');

const ANSI_COLORS = {
  0: '#000000',
  1: '#c2625c',
  2: '#4f9d7f',
  3: '#b98a45',
  4: '#7d8ba5',
  5: '#9a8cc0',
  6: '#7fa3ad',
  7: '#d9dce3'
};

// ansi-to-html 0.7.2 haelt in stream:true plus den Zeilenzaehler zuruck: jeder weitere
// Umbruch bringt eine <br/>-Marke mehr. Ein tickender Haufen Output stapelt damit die
// Konsole voll Leerraum. Also Umbrüche literal durchlaufen lassen und selbst setzen.
// Der Konverter gehoert pro Lauf: zwei parallele Laeufe duerfen keinen Farbzustand teilen.
function makeChunkRenderer() {
  const converter = new Convert({ newline: false, escapeXML: true, stream: true, colors: ANSI_COLORS });
  return (text) => converter.toHtml(text).replace(/\n/g, '<br/>');
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const STATE_DIR = path.join(process.env.HOME, '.harness-dispatch');
const CONFIG_FILE = path.join(STATE_DIR, 'config.yaml');
const AGENTS_MD_FILE = path.join(STATE_DIR, 'AGENTS.md');
const TASKS_FILE = path.join(STATE_DIR, 'studio-tasks.json');
const HARNESS_HEALTH_FILE = path.join(STATE_DIR, 'harness-health.json');
const DEFAULT_ROOT_DIR = fs.existsSync(path.join(process.env.HOME, 'Developer')) 
  ? path.join(process.env.HOME, 'Developer') 
  : process.env.HOME;

// Ensure base dir exists
if (!fs.existsSync(STATE_DIR)) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

// Initial global AGENTS.md template if not present
if (!fs.existsSync(AGENTS_MD_FILE)) {
  fs.writeFileSync(AGENTS_MD_FILE, `# Globale Entwickler-Richtlinien
- Modularer, wartbarer und testbarer Code.
- Bestehende Kommentare und Typsignaturen beibehalten.
- Nicht-triviale Architekturentscheidungen präzise begründen.
- Sicherheits- und Umgebungsvariablen respektieren.
`, 'utf8');
}

const taskStore = new TaskStore(STATE_DIR, DEFAULT_ROOT_DIR);
const beads = new BeadsAdapter();
const backupService = new BeadsBackupService({ beads, stateDirectory: STATE_DIR,
  nas: defaultNas(),
  onChange: (projectPath, backup) => broadcastToClients({ type: 'backup_status', projectPath, backup }) });
const access = createAccessControl(STATE_DIR);

const UPLOADS_DIR = path.join(STATE_DIR, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const SCHEDULES_FILE = path.join(STATE_DIR, 'schedules.json');
if (!fs.existsSync(SCHEDULES_FILE)) {
  fs.writeFileSync(SCHEDULES_FILE, '[]', 'utf8');
}

app.use(express.json({ limit: '50mb' }));
access.install(app, server, wss);
require('./services/image-upload').installImageUpload(app, UPLOADS_DIR);
app.use(express.static(path.join(__dirname, 'public')));

// Model presets per harness (defaults + dynamic discovery)
const DEFAULT_MODEL_PRESETS = {
  claude_code: [
    { id: 'Standard', label: 'Standard / OmniRoute Default' },
    { id: 'claude-3-7-sonnet', label: 'Claude 3.7 Sonnet (Thinking & Code)' },
    { id: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet (Sehr stark)' },
    { id: 'claude-3-5-haiku', label: 'Claude 3.5 Haiku (Schnell & Günstig)' },
    { id: 'Claude Sonnet 5', label: 'Claude Sonnet 5 (OmniRoute)' },
    { id: 'Claude Opus 5', label: 'Claude Opus 5 (OmniRoute)' }
  ],
  codex: [
    { id: 'Standard', label: 'Standard / ChatGPT Plus/Pro' },
    { id: 'o3', label: 'o3 (High Reasoning)' },
    { id: 'o3-mini', label: 'o3-mini (Reasoning & Code)' },
    { id: 'o1', label: 'o1 (Reasoning)' },
    { id: 'gpt-4.5-preview', label: 'GPT-4.5 Preview' },
    { id: 'gpt-4o', label: 'GPT-4o' },
    { id: 'gpt-4o-mini', label: 'GPT-4o Mini (Schnell)' },
    { id: 'gpt-5', label: 'GPT-5' }
  ],
  cline: [
    { id: 'Standard', label: 'Standard' },
    { id: 'stealth/space-bunny-alpha', label: 'Space Bunny Alpha (Kostenlos)' },
    { id: 'claude-3-7-sonnet', label: 'Claude 3.7 Sonnet' },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { id: 'deepseek-v3', label: 'DeepSeek V3' },
    { id: 'gpt-4o', label: 'GPT-4o' }
  ],
  opencode: [
    { id: 'Standard', label: 'Standard (fledge-alpha-free)' },
    { id: 'opencode/fledge-alpha-free', label: 'Fledge Alpha (Free Tier)' },
    { id: 'opencode/ling-3.1-flash-free', label: 'Ling 3.1 Flash (Free Tier)' },
    { id: 'anthropic/claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
    { id: 'opencode/space-bunny-free', label: 'Space Bunny (Free Tier)' },
    { id: 'nvidia/deepseek-ai/deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash' }
  ],
  antigravity_cli: [
    { id: 'Standard', label: 'Standard (Google AI Studio)' },
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (Thinking)' },
    { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' }
  ],
  qoder: [
    { id: 'Standard', label: 'Standard / Default' },
    { id: 'Qwen3.8-Max', label: 'Qwen 3.8 Max' },
    { id: 'Qwen3.8-Flash', label: 'Qwen 3.8 Flash' }
  ],
  codebuddy: [
    { id: 'Standard', label: 'Standard (hy3)' },
    { id: 'hy3', label: 'Tencent Hunyuan 3 (hy3)' },
    { id: 'deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash' },
    { id: 'deepseek-v3', label: 'DeepSeek V3' },
    { id: 'fast-model', label: 'Fast Model (Schnell)' },
    { id: 'balanced-model', label: 'Balanced Model' },
    { id: 'deep-model', label: 'Deep Model (Tiefe Analyse)' }
  ],
  cursor: [
    { id: 'Standard', label: 'Standard (Cursor entscheidet)' },
    { id: 'auto', label: 'Auto' }
  ],
  junie: [{ id: 'Standard', label: 'Standard / konfigurierte CLI-Auswahl' }],
  kilo: [{ id: 'Standard', label: 'Standard / konfigurierte CLI-Auswahl' }],
  copilot: [{ id: 'Standard', label: 'Standard / konfigurierte CLI-Auswahl' }],
  kiro: [{ id: 'Standard', label: 'Standard / konfigurierte CLI-Auswahl' }],
  vibe: [{ id: 'Standard', label: 'Standard / konfigurierte CLI-Auswahl' }]
};

let cachedModelPresets = null;
let modelPresetsCachedAt = 0;

function parseTokenCount(s) {
  if (!s) return 0;
  s = String(s).replace(/,/g, '').trim();
  if (s.endsWith('M') || s.endsWith('m')) return Math.round(parseFloat(s) * 1000000);
  if (s.endsWith('K') || s.endsWith('k')) return Math.round(parseFloat(s) * 1000);
  return parseInt(s, 10) || 0;
}

function execAsync(cmd, timeoutMs = 4500) {
  return new Promise((resolve) => {
    exec(cmd, { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err) resolve('');
      else resolve(stdout || '');
    });
  });
}

async function fetchDynamicModelPresets() {
  const result = JSON.parse(JSON.stringify(DEFAULT_MODEL_PRESETS));

  // Run external CLI commands concurrently for maximum performance (OmniRoute uses presets)
  const [opencodeRaw, qoderRaw] = await Promise.all([
    execAsync('opencode api GET /api/model 2>/dev/null', 4000),
    execAsync('qodercli --list-models 2>/dev/null', 4500)
  ]);

  // 1. OpenCode: query live models
  try {
    if (opencodeRaw) {
      const json = JSON.parse(opencodeRaw);
      const models = Array.isArray(json) ? json : (json.data || []);
      if (models.length > 0) {
        const list = [{ id: 'Standard', label: 'Standard / OpenCode Free Default' }];
        models.forEach(m => {
          const id = m.id || m.modelID;
          if (!id) return;
          const name = m.name || id;
          const prov = (m.settings && m.settings.provider) || m.providerID || '';
          // opencode --model expects "provider/model". The bare id fails with
          // "Invalid model reference", and an id that already contains a slash is still
          // read as provider/model ("deepseek-ai/x" -> provider deepseek-ai -> unavailable).
          const ref = prov && !id.startsWith(`${prov}/`) ? `${prov}/${id}` : id;
          list.push({ id: ref, label: prov ? `${name} (${prov})` : name });
        });
        result.opencode = list;
      }
    }
  } catch (e) {}

  // 2. Qoder: query live models
  try {
    if (qoderRaw) {
      const lines = qoderRaw.split('\n').map(l => l.trim()).filter(l => l && l !== 'MODEL' && !l.startsWith('-'));
      if (lines.length > 0) {
        const list = [{ id: 'Standard', label: 'Standard / Account Default' }];
        lines.forEach(m => {
          list.push({ id: m, label: m });
        });
        if (!lines.includes('claude-3-7-sonnet')) list.push({ id: 'claude-3-7-sonnet', label: 'Claude 3.7 Sonnet' });
        if (!lines.includes('gpt-4o')) list.push({ id: 'gpt-4o', label: 'GPT-4o' });
        result.qoder = list;
      }
    }
  } catch (e) {}

  // 4. Codex: dynamically inspect ~/.codex/models_cache.json & ~/.codex/config.toml
  try {
    const codexCachePath = path.join(os.homedir(), '.codex', 'models_cache.json');
    const codexTomlPath = path.join(os.homedir(), '.codex', 'config.toml');
    const codexList = [{ id: 'Standard', label: 'Standard / ChatGPT Plus/Pro Default' }];
    
    let configuredModel = null;
    if (fs.existsSync(codexTomlPath)) {
      const tomlText = fs.readFileSync(codexTomlPath, 'utf8');
      const mMatch = tomlText.match(/model\s*=\s*["']([^"']+)["']/);
      if (mMatch) {
        configuredModel = mMatch[1];
        codexList.push({ id: configuredModel, label: `${configuredModel} (Aktiv in config.toml)` });
      }
    }

    if (fs.existsSync(codexCachePath)) {
      const cacheData = JSON.parse(fs.readFileSync(codexCachePath, 'utf8'));
      const models = Array.isArray(cacheData) ? cacheData : (cacheData.models || []);
      models.forEach(m => {
        const id = m.slug || m.id || m.model;
        if (!id || id === configuredModel) return;
        const name = m.display_name || m.name || id;
        const desc = m.description ? ` (${m.description.slice(0, 35)}...)` : '';
        codexList.push({ id, label: `${name}${desc}` });
      });
    }

    const coreOpenAi = ['o3', 'o3-mini', 'o1', 'gpt-4.5-preview', 'gpt-4o', 'gpt-4o-mini', 'gpt-5'];
    coreOpenAi.forEach(d => {
      if (!codexList.some(m => m.id === d)) {
        codexList.push({ id: d, label: d });
      }
    });
    result.codex = codexList;
  } catch (e) {}

  // 5. Cline: inspect configured model from ~/.cline/data/settings/providers.json
  try {
    const clineProvPath = path.join(os.homedir(), '.cline', 'data', 'settings', 'providers.json');
    if (fs.existsSync(clineProvPath)) {
      const pData = JSON.parse(fs.readFileSync(clineProvPath, 'utf8'));
      const activeModel = pData.providers && pData.providers.cline && pData.providers.cline.settings && pData.providers.cline.settings.model;
      if (activeModel && !result.cline.some(m => m.id === activeModel)) {
        result.cline.splice(1, 0, { id: activeModel, label: `${activeModel} (Aktiv in providers.json)` });
      }
    }
  } catch (e) {}

  // 6. Antigravity CLI: inspect Google AI Studio & Gemini live presets
  try {
    const agyList = [{ id: 'Standard', label: 'Standard (Google AI Studio Default)' }];
    const agyStatePath = path.join(os.homedir(), '.gemini', 'antigravity', 'antigravity_state.pbtxt');
    if (fs.existsSync(agyStatePath)) {
      const pbtxt = fs.readFileSync(agyStatePath, 'utf8');
      const match = pbtxt.match(/last_selected_agent_model:\s*([^\r\n]+)/);
      if (match && !match[1].includes('PLACEHOLDER')) {
        agyList.push({ id: match[1].trim(), label: `${match[1].trim()} (Aktiv im CLI State)` });
      }
    }
    const geminiModels = [
      { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (Thinking & Reasoning)' },
      { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro (Deep Code & Architecture)' },
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Schnell & Günstig)' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (Kompakt)' }
    ];
    geminiModels.forEach(gm => {
      if (!agyList.some(m => m.id === gm.id)) agyList.push(gm);
    });
    result.antigravity_cli = agyList;
  } catch (e) {}

  // 7. CodeBuddy: inspect configured model from ~/.codebuddy/settings.json
  try {
    const cbPath = path.join(os.homedir(), '.codebuddy', 'settings.json');
    if (fs.existsSync(cbPath)) {
      const cbData = JSON.parse(fs.readFileSync(cbPath, 'utf8'));
      if (cbData.model && !result.codebuddy.some(m => m.id === cbData.model)) {
        result.codebuddy.splice(1, 0, { id: cbData.model, label: `${cbData.model} (In settings.json konfiguriert)` });
      }
    }
  } catch (e) {}

  return result;
}

let pendingDynamicModelFetch = null;

// Lazy loader: ONLY queries CLIs when forceRefresh is true (e.g. user in settings tab)!
async function getCliModels(forceRefresh = false) {
  if (!cachedModelPresets) {
    cachedModelPresets = JSON.parse(JSON.stringify(DEFAULT_MODEL_PRESETS));
  }
  if (forceRefresh) {
    if (!pendingDynamicModelFetch) {
      pendingDynamicModelFetch = (async () => {
        try {
          const fresh = await fetchDynamicModelPresets();
          cachedModelPresets = fresh;
          modelPresetsCachedAt = Date.now();
          return fresh;
        } finally {
          pendingDynamicModelFetch = null;
        }
      })();
    }
    return await pendingDynamicModelFetch;
  }
  return cachedModelPresets;
}

// Helper: load config.yaml
function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    return { clis: [], remote: { telegram: { enabled: false, botToken: '', allowedUsers: [] } } };
  }
  try {
    const data = yaml.load(fs.readFileSync(CONFIG_FILE, 'utf8')) || {};
    if (!data.clis) data.clis = [];
    const normalized = normalizeRoutes(data.clis, { strict: false });
    if (JSON.stringify(data.clis) !== JSON.stringify(normalized)) {
      const backup = `${CONFIG_FILE}.before-harness-migration`;
      if (!fs.existsSync(backup)) fs.copyFileSync(CONFIG_FILE, backup);
      const rejected = data.clis.length - normalized.length;
      if (rejected) console.warn(`[Konfiguration] ${rejected} unbekannte Harness-Route(n) übersprungen; Original in ${backup}`);
      data.clis = normalized;
      fs.writeFileSync(CONFIG_FILE, yaml.dump(data, { lineWidth: -1 }), 'utf8');
    }
    data.clis = runtimeRoutes(normalized);
    if (!data.remote) data.remote = {};
    if (!data.dispatch) data.dispatch = { max_concurrent: DEFAULT_MAX_CONCURRENT };
    if (!data.remote.telegram) {
      data.remote.telegram = { enabled: false, botToken: '', allowedUsers: [] };
    }
    return data;
  } catch (err) {
    console.error("Fehler beim Lesen von config.yaml:", err);
    return { clis: [], remote: { telegram: { enabled: false, botToken: '', allowedUsers: [] } } };
  }
}

// Helper: save config.yaml
function saveConfig(configData) {
  const serialized = yaml.dump({ ...configData, clis: normalizeRoutes(configData.clis || []) }, { lineWidth: -1 });
  fs.writeFileSync(CONFIG_FILE, serialized, 'utf8');
}

// Measured harness failures, keyed by command. Only the harness test writes here,
// so a dispatch chain never re-discovers a broken login by burning minutes on it.
function loadHarnessHealthMarks() {
  try {
    return JSON.parse(fs.readFileSync(HARNESS_HEALTH_FILE, 'utf8')) || {};
  } catch {
    return {};
  }
}

function markHarnessHealth(command, errorKind, detail) {
  const marks = loadHarnessHealthMarks();
  marks[command] = { errorKind, detail: detail || '', at: Date.now() };
  try { fs.writeFileSync(HARNESS_HEALTH_FILE, JSON.stringify(marks, null, 2)); } catch {}
}

function clearHarnessHealthMark(command) {
  const marks = loadHarnessHealthMarks();
  if (!marks[command]) return;
  delete marks[command];
  try { fs.writeFileSync(HARNESS_HEALTH_FILE, JSON.stringify(marks, null, 2)); } catch {}
}

// Helper: load tasks & workspace data
function loadTasksData() { return taskStore.read(); }
function saveTasksData(data) { taskStore.write(data); }

function scanProjects(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  try {
    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => {
        const fullPath = path.join(rootDir, e.name);
        const hasAgentsMd = fs.existsSync(path.join(fullPath, 'AGENTS.md'));
        const hasGit = fs.existsSync(path.join(fullPath, '.git'));
        return {
          name: e.name,
          path: fullPath,
          hasAgentsMd,
          hasGit
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    console.error("Fehler beim Scannen der Verzeichnisse:", err);
    return [];
  }
}

// Comprehensive CLI Registry for 1-Click Installation & Health Check
const { HARNESS_REGISTRY, CLI_INSTALL_REGISTRY, resolveHarness, normalizeRoutes, runtimeRoutes } = require('./runtime/registry');
const { resolveWorkspaceDirectory, resolveAgentFile } = require('./runtime/workspace');
const { runHarness } = require('./runtime/harness-runtime');

let healthCache = null;
let healthCacheTime = 0;

function invalidateHarnessHealthCache() {
  healthCache = null;
  healthCacheTime = 0;
}

function checkSingleCliHealth(meta) {
  let available = false;
  let binaryPath = null;
  let version = null;
  try {
    const commands = [meta.cmd, meta.altCmd].filter(Boolean);
    const p = commands.map((command) => {
      try { return execFileSync('which', [command], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
      catch { return ''; }
    }).find(Boolean);
    if (p) {
      available = true;
      binaryPath = p;
      try {
        const vOut = execFileSync(p, ['--version'], { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        version = vOut.split('\n')[0].trim();
        if (version.length > 32) version = version.slice(0, 32);
      } catch {}
    }
  } catch {
    available = false;
  }
  return { ...meta, available, path: binaryPath, version };
}

// Harness health check with memory cache
function getHarnessHealth(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && healthCache && (now - healthCacheTime < 30000)) {
    return healthCache;
  }

  const results = Object.values(CLI_INSTALL_REGISTRY).map(checkSingleCliHealth);
  healthCache = results;
  healthCacheTime = now;
  return results;
}

// Harness Quota, Costs & Live Telemetry Check
let cachedCostsData = null;
let costsCachedAt = 0;

function fetchCliCostsAndUsage(forceRefresh = false) {
  const now = Date.now();
  if (cachedCostsData && !forceRefresh && (now - costsCachedAt < 25000)) {
    return cachedCostsData;
  }

  // 1. OmniRoute Costs & Tokens
  let omniCost = {
    available: false,
    totalCost: '$0.00',
    totalCostNum: 0,
    totalTokensIn: 0,
    totalTokensOut: 0,
    totalTokens: 0,
    totalTokensFormatted: '0 Tokens',
    totalReqs: 0,
    providers: []
  };

  try {
    const raw = execSync('omniroute cost --period all 2>/dev/null', { encoding: 'utf8', timeout: 4000 });
    const clean = raw.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
    let totalCostNum = 0;
    let totalTokensIn = 0;
    let totalTokensOut = 0;
    let totalReqs = 0;
    const providers = [];

    clean.split('\n').forEach(line => {
      if (!line.includes('|')) return;
      const parts = line.split('|').map(s => s.trim());
      if (parts.length >= 6 && parts[1] && parts[1] !== 'Group' && !parts[1].startsWith('-')) {
        const group = parts[1];
        const reqsStr = parts[2].replace(/,/g, '');
        const reqs = parseInt(reqsStr, 10) || 0;
        const tokIn = parseTokenCount(parts[3]);
        const tokOut = parseTokenCount(parts[4]);
        const costStr = parts[5];
        const costVal = parseFloat(costStr.replace('$', '')) || 0;

        totalReqs += reqs;
        totalTokensIn += tokIn;
        totalTokensOut += tokOut;
        totalCostNum += costVal;

        providers.push({
          group,
          reqs: parts[2],
          tokensIn: parts[3],
          tokensOut: parts[4],
          cost: costStr,
          costNum: costVal
        });
      }
    });

    const totalTokens = totalTokensIn + totalTokensOut;
    omniCost = {
      available: true,
      totalCost: `$${totalCostNum.toFixed(4)}`,
      totalCostNum,
      totalTokensIn,
      totalTokensOut,
      totalTokens,
      totalTokensFormatted: totalTokens > 1000000 ? `${(totalTokens / 1000000).toFixed(1)}M Tokens` : `${Math.round(totalTokens / 1000)}k Tokens`,
      totalReqs,
      providers
    };
  } catch (err) {}

  // 2. OpenCode Stats & Tokens
  let opencodeStats = {
    available: false,
    totalTokens: 0,
    totalTokensFormatted: '0 Tokens',
    inputTokens: 0,
    outputTokens: 0,
    cacheTokens: 0,
    sessions: 0,
    prompts: 0,
    cost: '$0.00',
    models: []
  };

  try {
    const raw = execSync('opencode stats --cost --json 2>/dev/null', { encoding: 'utf8', timeout: 3500 });
    const data = JSON.parse(raw);
    const inTok = (data.tokens && data.tokens.input) || 0;
    const outTok = (data.tokens && data.tokens.output) || 0;
    const cacheTok = (data.tokens && data.tokens.cache && data.tokens.cache.read) || 0;
    const total = inTok + outTok + cacheTok;

    opencodeStats = {
      available: true,
      totalTokens: total,
      totalTokensFormatted: total > 1000000 ? `${(total / 1000000).toFixed(1)}M Tokens` : `${Math.round(total / 1000)}k Tokens`,
      inputTokens: inTok,
      outputTokens: outTok,
      cacheTokens: cacheTok,
      sessions: data.sessions || 0,
      prompts: data.prompts || 0,
      cost: `$${data.cost || 0}`,
      models: data.models || []
    };
  } catch (err) {}

  // 3. Cline Config
  let clineModel = 'stealth/space-bunny-alpha';
  try {
    const clineProvPath = path.join(os.homedir(), '.cline', 'data', 'settings', 'providers.json');
    if (fs.existsSync(clineProvPath)) {
      const pData = JSON.parse(fs.readFileSync(clineProvPath, 'utf8'));
      if (pData.providers && pData.providers.cline && pData.providers.cline.settings && pData.providers.cline.settings.model) {
        clineModel = pData.providers.cline.settings.model;
      }
    }
  } catch (e) {}

  // 4. CodeBuddy Config
  let codebuddyModel = 'hy3';
  try {
    const cbPath = path.join(os.homedir(), '.codebuddy', 'settings.json');
    if (fs.existsSync(cbPath)) {
      const cbData = JSON.parse(fs.readFileSync(cbPath, 'utf8'));
      if (cbData.model) codebuddyModel = cbData.model;
    }
  } catch (e) {}

  const usage = {
    claude_code: {
      id: 'claude_code',
      name: 'Claude Code',
      command: 'claude',
      available: false,
      plan: 'OmniRoute Proxy (API Key)',
      contextWindow: 'Dynamisch (OmniRoute)',
      remaining: 'Pay-per-Token (Kein Budget-Limit)',
      cost: omniCost.available ? `${omniCost.totalCost} (OmniRoute gesamt)` : 'Pay-per-Token',
      tokensUsed: omniCost.totalTokens,
      tokensFormatted: omniCost.totalTokensFormatted,
      sessions: omniCost.totalReqs,
      badge: '🟢 OmniRoute aktiv',
      isOmniroute: true,
      omnirouteProviders: omniCost.providers
    },
    codex: {
      id: 'codex',
      name: 'Codex',
      command: 'codex',
      available: false,
      plan: 'ChatGPT Plus/Pro',
      contextWindow: '200.000 Tokens',
      remaining: 'ChatGPT Abonnement aktiv',
      cost: 'Im Abo enthalten',
      badge: 'ChatGPT Session'
    },
    opencode: {
      id: 'opencode',
      name: 'OpenCode',
      command: 'opencode',
      available: false,
      plan: 'Community Free Tier',
      contextWindow: '128.000 - 200.000 Tokens',
      remaining: opencodeStats.available ? `Unbegrenzt (${opencodeStats.totalTokensFormatted} genutzt)` : 'Unbegrenzt (Free Tier)',
      tokensUsed: opencodeStats.totalTokens,
      tokensFormatted: opencodeStats.totalTokensFormatted,
      inputTokens: opencodeStats.inputTokens,
      outputTokens: opencodeStats.outputTokens,
      cacheTokens: opencodeStats.cacheTokens,
      sessions: opencodeStats.sessions,
      prompts: opencodeStats.prompts,
      cost: '$0.00 (Free Tier)',
      badge: opencodeStats.available ? `Unbegrenzt (${opencodeStats.totalTokensFormatted} genutzt)` : 'Unbegrenzt',
      modelsUsed: opencodeStats.models
    },
    qoder: {
      id: 'qoder',
      name: 'Qoder',
      command: 'qodercli',
      available: false,
      plan: 'Account Credits',
      contextWindow: '128.000 Tokens',
      remaining: 'Credits aktiv (Qwen 3.8 Max/Flash)',
      cost: 'Credits inklusive',
      badge: 'Credits aktiv'
    },
    codebuddy: {
      id: 'codebuddy',
      name: 'CodeBuddy',
      command: 'codebuddy',
      available: false,
      plan: 'Tencent AI Free Tier',
      contextWindow: '128.000 Tokens',
      remaining: `Aktiv (${codebuddyModel} / DeepSeek)`,
      cost: '$0.00',
      badge: 'Aktiv'
    },
    cursor: {
      id: 'cursor',
      name: 'Cursor CLI',
      command: 'agent',
      available: false,
      plan: 'Cursor-Konto',
      contextWindow: 'Modellabhängig',
      remaining: 'Modell: Auto',
      cost: 'Abo-Kontingent',
      badge: 'Bereit'
    },
    antigravity_cli: {
      id: 'antigravity_cli',
      name: 'Antigravity',
      command: 'agy',
      available: false,
      plan: 'Google AI Studio',
      contextWindow: '1.000.000 Tokens',
      remaining: 'Developer Quota (15 RPM / 1M Kontext)',
      cost: 'Free Tier',
      badge: 'Gemini Quota'
    },
    cline: {
      id: 'cline',
      name: 'Cline',
      command: 'cline',
      available: false,
      plan: 'Local / BYOK',
      contextWindow: '200.000 Tokens',
      remaining: `Modell: ${clineModel}`,
      cost: 'Eigenes Modell',
      badge: 'Bereit'
    }
  };

  const health = getHarnessHealth();
  health.forEach(h => {
    let key = h.id;
    if (key === 'claude_code_cli') key = 'claude_code';
    if (key === 'codex_cli') key = 'codex';
    if (key === 'cline_cli') key = 'cline';
    if (key === 'opencode_cli') key = 'opencode';
    if (key === 'qoder_cli') key = 'qoder';
    if (key === 'codebuddy_cli') key = 'codebuddy';
    if (key === 'cursor_cli') key = 'cursor';

    if (usage[key]) {
      usage[key].available = h.available;
    }
  });

  cachedCostsData = {
    usage,
    omniroute: omniCost,
    opencode: opencodeStats,
    timestamp: now
  };
  costsCachedAt = now;

  return cachedCostsData;
}

function getHarnessUsage(forceRefresh = false) {
  const data = fetchCliCostsAndUsage(forceRefresh);
  return data.usage;
}

// --- REST API ENDPOINTS ---

app.get('/api/status', (req, res) => {
  const health = getHarnessHealth();
  const config = loadConfig();
  // Die Kappe gehört mit zum Status, sonst zeigen die Einstellungen einen alten Wert.
  res.json({ health, harnesses: Object.values(HARNESS_REGISTRY), clis: config.clis || [], dispatch: config.dispatch || { max_concurrent: DEFAULT_MAX_CONCURRENT }, execution: config.execution || { codexUnsafe: false } });
});

// 1-Click Installer Status API
app.get('/api/installer/status', (req, res) => {
  const force = req.query.refresh === 'true';
  const tools = getHarnessHealth(force);
  const installed = tools.filter(t => t.available).length;
  const missing = tools.length - installed;
  res.json({
    tools,
    total: tools.length,
    installed,
    missing
  });
});

// 1-Click Installer Execution Function
let activeInstallProcess = null;

function executeCliInstall(toolId, onOutput, onDone) {
  const meta = CLI_INSTALL_REGISTRY[toolId];
  if (!meta) {
    if (onDone) onDone(new Error(`Unbekannte CLI-ID: ${toolId}`));
    return;
  }

  const cmd = meta.installCmd;
  if (onOutput) onOutput(`[1-Klick Installer] Starte Installation für ${meta.name}...\nPaket: ${meta.package}\nBefehl: ${cmd}\n\n`);

  const child = spawn(cmd, [], {
    shell: true,
    env: {
      ...process.env,
      FORCE_COLOR: '1',
      PATH: `${process.env.HOME}/.local/bin:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}`
    }
  });

  activeInstallProcess = child;

  child.stdout.on('data', (d) => {
    if (onOutput) onOutput(d.toString());
  });

  child.stderr.on('data', (d) => {
    if (onOutput) onOutput(d.toString());
  });

  child.on('close', (code) => {
    activeInstallProcess = null;
    invalidateHarnessHealthCache();
    const updated = checkSingleCliHealth(meta);
    if (code === 0 && updated.available) {
      if (onOutput) onOutput(`\n[Erfolg] ${meta.name} erfolgreich installiert! (${updated.version || 'bereit'} in ${updated.path})\n`);
      if (onDone) onDone(null, updated);
    } else {
      if (onOutput) onOutput(`\n[Hinweis] Installation von ${meta.name} beendet mit Code ${code}.\n`);
      if (onDone) onDone(new Error(`Exit-Code ${code}`), updated);
    }
  });

  child.on('error', (err) => {
    activeInstallProcess = null;
    if (onOutput) onOutput(`\n✕ Fehler: ${err.message}\n`);
    if (onDone) onDone(err, null);
  });
}

// 1-Click Installer Execute Endpoint
app.post('/api/installer/install', (req, res) => {
  const { id, all } = req.body;

  if (all) {
    const current = getHarnessHealth(true);
    const missing = current.filter(t => !t.available);
    if (missing.length === 0) {
      return res.json({ success: true, message: 'Alle registrierten CLIs sind bereits installiert. Anmeldung und Modelle separat testen.' });
    }

    res.json({ success: true, message: `Installiere ${missing.length} fehlende CLIs im Hintergrund...` });

    let idx = 0;
    function runNext() {
      if (idx >= missing.length) {
        broadcastToClients({ type: 'install_all_done', message: 'Alle Installationen abgeschlossen!' });
        return;
      }
      const item = missing[idx++];
      broadcastToClients({ type: 'install_start', toolId: item.id, name: item.name });
      const renderChunk = makeChunkRenderer();
      executeCliInstall(
        item.id,
        (text) => broadcastToClients({ type: 'install_output', toolId: item.id, text, html: renderChunk(text) }),
        (err, updated) => {
          broadcastToClients({ type: 'install_done', toolId: item.id, err: err ? err.message : null, updated });
          setTimeout(runNext, 500);
        }
      );
    }
    runNext();
    return;
  }

  if (!id || !CLI_INSTALL_REGISTRY[id]) {
    return res.status(400).json({ error: 'Ungültige CLI-ID' });
  }

  const meta = CLI_INSTALL_REGISTRY[id];
  broadcastToClients({ type: 'install_start', toolId: id, name: meta.name });

  const renderInstallChunk = makeChunkRenderer();
  executeCliInstall(
    id,
    (text) => {
      broadcastToClients({ type: 'install_output', toolId: id, text, html: renderInstallChunk(text) });
    },
    (err, updated) => {
      broadcastToClients({
        type: 'install_done',
        toolId: id,
        err: err ? err.message : null,
        updated
      });
    }
  );

  res.json({ success: true, message: `Installation für ${meta.name} gestartet.` });
});

app.get('/api/usage', (req, res) => {
  const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
  res.json(getHarnessUsage(refresh));
});

app.get('/api/costs', (req, res) => {
  const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
  const data = fetchCliCostsAndUsage(refresh);
  res.json(data);
});

app.get('/api/model-presets', async (req, res) => {
  const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
  const models = await getCliModels(refresh);
  res.json(models);
});

app.get('/api/workspace', (req, res) => {
  const data = loadTasksData();
  const rootDir = resolveWorkspaceDirectory(data.rootDirectory || DEFAULT_ROOT_DIR, data.rootDirectory || DEFAULT_ROOT_DIR);
  const projects = scanProjects(rootDir);
  let active;
  try { active = resolveWorkspaceDirectory(data.activeProject, rootDir); }
  catch { active = projects[0] ? projects[0].path : rootDir; }
  data.activeProject = active;
  data.rootDirectory = rootDir;
  saveTasksData(data);

  res.json({
    rootDirectory: rootDir,
    activeProject: active,
    projects,
    tasks: data.tasks || []
  });
});

app.post('/api/workspace', (req, res) => {
  try {
    const { rootDirectory, activeProject } = req.body;
    const data = loadTasksData();

    if (rootDirectory) data.rootDirectory = resolveWorkspaceDirectory(rootDirectory, rootDirectory);
    if (activeProject) data.activeProject = resolveWorkspaceDirectory(activeProject, data.rootDirectory || DEFAULT_ROOT_DIR);
    else if (rootDirectory) data.activeProject = data.rootDirectory;

    saveTasksData(data);
    const projects = scanProjects(data.rootDirectory);
    res.json({
      rootDirectory: data.rootDirectory,
      activeProject: data.activeProject,
      projects,
      tasks: data.tasks || []
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/tasks', (req, res) => {
  const data = loadTasksData();
  res.json({ tasks: data.tasks || [] });
});

// Einpacken löscht nichts: die Ausgabe bleibt erhalten, nur die Seitenleiste wird
// ruhiger. Ein Lauf im Pool (arbeitend oder wartend) darf nicht verschwinden —
// sonst gibt es weder Abbruch noch Zuschauer.
app.post('/api/tasks/archive', (req, res) => {
  const { taskId, archived } = req.body || {};
  const data = loadTasksData();
  const task = data.tasks.find((t) => t.id === taskId);
  if (!task) return res.status(404).json({ error: `Auftrag ${taskId} nicht in der Historie` });
  if (liveRuns.has(taskId) || dispatchQueue.some((e) => e.taskId === taskId)) {
    return res.status(409).json({ error: `${taskId} läuft oder wartet — erst beenden, dann einpacken` });
  }
  task.archived = Boolean(archived);
  saveTasksData(data);
  broadcastToClients({ type: 'task_archived', taskId, archived: task.archived });
  res.json({ success: true, task });
});

app.post('/api/tasks/clear', (req, res) => {
  const data = loadTasksData();
  const { projectPath } = req.body;
  if ([...liveRuns.values(), ...dispatchQueue].some((entry) => !projectPath || entry.workingDir === projectPath)) {
    return res.status(409).json({ error: 'Laufende und wartende Aufträge erst beenden' });
  }
  if (projectPath) {
    data.tasks = data.tasks.filter(t => t.projectPath !== projectPath);
  } else {
    data.tasks = [];
  }
  saveTasksData(data);
  res.json({ success: true, tasks: data.tasks });
});

app.get('/api/config', (req, res) => {
  const config = loadConfig();
  res.json({ clis: config.clis, dispatch: config.dispatch, execution: config.execution || { codexUnsafe: false }, remote: {
    telegram: { enabled: Boolean(config.remote?.telegram?.enabled), hasToken: Boolean(config.remote?.telegram?.botToken) }
  } });
});

// Der Pool-Zustand für die Oberfläche: ein Neuladen des Fensters darf die laufenden
// und wartenden Aufträge nicht verlieren, und der Zähler braucht die Kappe.
app.get('/api/runs', (req, res) => {
  res.json({
    running: [...liveRuns.values()].map((r) => ({
      taskId: r.taskId,
      projectPath: r.workingDir,
      projectName: path.basename(r.workingDir),
      prompt: r.record.prompt,
      harness: r.record.harness,
      commands: r.commands,
      startedAt: r.record.timestamp
    })),
    queued: dispatchQueue.map((r) => ({
      taskId: r.taskId,
      projectPath: r.workingDir,
      projectName: path.basename(r.workingDir),
      prompt: r.record.prompt,
      harness: r.record.harness,
      commands: r.requires,
      startedAt: r.record.timestamp
    })),
    maxConcurrent: maxConcurrentRuns()
  });
});

app.post('/api/config', (req, res) => {
  try {
    const { clis, dispatch, execution } = req.body;
    const config = loadConfig();
    config.clis = runtimeRoutes(normalizeRoutes(clis));
    // Die Kappe kommt aus der Oberfläche; alles unterhalb von 1 würde jeden Auftrag
    // in der Warteschlange festsetzen.
    if (dispatch && Number.isInteger(Number(dispatch.max_concurrent))) {
      config.dispatch = { max_concurrent: Math.min(8, Math.max(0, Number(dispatch.max_concurrent))) };
    }
    if (execution) config.execution = { codexUnsafe: execution.codexUnsafe === true };
    saveConfig(config);
    res.json({ success: true, config: { clis: config.clis, dispatch: config.dispatch, execution: config.execution || { codexUnsafe: false } } });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Modelltests laufen in einem leeren Wegwerfprojekt über dieselbe Runtime.
const MODEL_TEST_PROMPT = 'Antworte mit genau einem Wort: OK';
const MODEL_TEST_TIMEOUT_MS = 90000;

app.post('/api/harness/test', async (req, res) => {
  const entry = resolveHarness(req.body || {});
  if (!entry) return res.status(400).json({ ok: false, error: 'Unbekanntes Harness' });
  if (!entry.modelTest) return res.status(400).json({ ok: false, errorKind: 'tui_only', error: `${entry.name} ist nur interaktiv verfügbar.` });
  const startedAt = Date.now();
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-modeltest-'));
  try {
    const result = await runHarness({
      harnessId: entry.id, model: req.body.model || 'Standard', prompt: MODEL_TEST_PROMPT,
      cwd: workDir, env: harnessEnv({ PWD: workDir }), timeoutMs: MODEL_TEST_TIMEOUT_MS,
      idleTimeoutMs: MODEL_TEST_TIMEOUT_MS
    });
    const ok = result.status === 'completed' && Boolean(result.finalText.trim());
    if (ok) clearHarnessHealthMark(entry.commands[0]);
    else if (result.error?.kind === 'auth') markHarnessHealth(entry.commands[0], 'auth', result.error.message);
    res.json({
      ok, exitCode: result.exitCode,
      errorKind: ok ? undefined : result.error?.kind || 'unknown',
      error: ok ? undefined : result.error?.message || 'Prozess endete ohne Antwort.',
      latencyMs: Date.now() - startedAt,
      sample: (result.finalText || result.rawTail || '').trim().slice(-600)
    });
  } catch (err) {
    res.status(500).json({ ok: false, errorKind: 'unknown', error: err.message });
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

app.get('/api/agents-md', (req, res) => {
  try {
    const data = loadTasksData();
    const rootDir = data.rootDirectory || DEFAULT_ROOT_DIR;
    const active = req.query.project || data.activeProject;
    const globalContent = fs.existsSync(AGENTS_MD_FILE) ? fs.readFileSync(AGENTS_MD_FILE, 'utf8') : '';

    let devRootContent = '';
    const devAgentsFile = resolveAgentFile('rootDev', null, rootDir);
    if (fs.existsSync(devAgentsFile)) {
      devRootContent = fs.readFileSync(devAgentsFile, 'utf8');
    }

    let projectContent = '';
    const projAgentsFile = active ? resolveAgentFile('project', active, rootDir) : '';
    if (projAgentsFile && fs.existsSync(projAgentsFile)) {
      projectContent = fs.readFileSync(projAgentsFile, 'utf8');
    }

    res.json({
      global: { path: AGENTS_MD_FILE, content: globalContent, exists: fs.existsSync(AGENTS_MD_FILE), size: globalContent.length },
      rootDev: { path: devAgentsFile, content: devRootContent, exists: fs.existsSync(devAgentsFile), size: devRootContent.length },
      project: { path: projAgentsFile, content: projectContent, exists: !!projectContent, size: projectContent.length }
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/agents-md', (req, res) => {
  try {
    const { content, target } = req.body;
    if (!['global', 'rootDev', 'project'].includes(target)) throw new Error('Unbekanntes AGENTS-Ziel');
    const data = loadTasksData();
    const targetPath = target === 'global' ? AGENTS_MD_FILE
      : resolveAgentFile(target, req.body.projectPath || data.activeProject, data.rootDirectory || DEFAULT_ROOT_DIR);
    fs.writeFileSync(targetPath, typeof content === 'string' ? content : '', 'utf8');
    res.json({ success: true, path: targetPath });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// --- UNIVERSAL SKILLS HUB & SYNC (zentraler Hub und 8 unterstützte CLI-Ziele) ---
const HARNESS_DIRS = [
  { id: 'agents', name: 'Open-Agent Standard Hub', path: path.join(os.homedir(), '.agents', 'skills') },
  { id: 'claude', name: 'Claude Code', path: path.join(os.homedir(), '.claude', 'skills') },
  { id: 'opencode', name: 'OpenCode', path: path.join(os.homedir(), '.config', 'opencode', 'skills') },
  { id: 'codex', name: 'Codex CLI', path: path.join(os.homedir(), '.codex', 'skills') },
  { id: 'cline', name: 'Cline CLI', path: path.join(os.homedir(), '.cline', 'skills') },
  { id: 'qoder', name: 'Qoder CLI', path: path.join(os.homedir(), '.qoder', 'skills') },
  { id: 'codebuddy', name: 'CodeBuddy CLI', path: path.join(os.homedir(), '.codebuddy', 'skills') },
  { id: 'gemini', name: 'Gemini / Antigravity', path: path.join(os.homedir(), '.gemini', 'antigravity', 'skills') },
  { id: 'cursor', name: 'Cursor CLI', path: path.join(os.homedir(), '.cursor', 'skills-cursor') }
];
const HARNESS_SKILLS_DIRS = HARNESS_DIRS;

function parseSkillMetadata(skillDir) {
  const skillFile = path.join(skillDir, 'SKILL.md');
  let name = path.basename(skillDir);
  let description = '';
  if (!fs.existsSync(skillFile)) {
    return { name, description: 'Standard-Skill ohne SKILL.md', hasSkillMd: false };
  }
  try {
    const content = fs.readFileSync(skillFile, 'utf8');
    const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (frontmatterMatch) {
      try {
        const parsed = yaml.load(frontmatterMatch[1]);
        if (parsed && typeof parsed === 'object') {
          if (parsed.name) name = parsed.name;
          if (parsed.description) description = parsed.description;
        }
      } catch {}
    }
    if (!description) {
      const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---/, '').trim();
      const firstLine = body.split('\n').map(l => l.trim()).find(l => l.length > 0 && !l.startsWith('#'));
      description = firstLine ? firstLine.slice(0, 160) : 'Agent-Skill für alle Harnesses';
    }
    return { name, description, hasSkillMd: true };
  } catch (e) {
    return { name, description: 'Fehler beim Lesen der SKILL.md', hasSkillMd: true };
  }
}

function syncAllSkills({ synchronize = true } = {}) {
  const HUB_DIR = path.join(os.homedir(), '.agents', 'skills');
  if (synchronize && !fs.existsSync(HUB_DIR)) {
    try { fs.mkdirSync(HUB_DIR, { recursive: true }); } catch {}
  }

  const candidateSources = [
    path.join(os.homedir(), '.agents', 'skills'),
    path.join(os.homedir(), '.claude', 'skills'),
    path.join(os.homedir(), '.codex', 'skills'),
    path.join(os.homedir(), '.qoder', 'skills'),
    path.join(os.homedir(), '.codebuddy', 'skills'),
    path.join(os.homedir(), '.cline', 'skills'),
    path.join(os.homedir(), '.config', 'opencode', 'skills'),
    path.join(os.homedir(), '.gemini', 'antigravity', 'builtin', 'skills'),
    path.join(os.homedir(), '.cursor', 'skills-cursor'),
    path.join(os.homedir(), '.local', 'share', 'ego', 'ego-skills')
  ];

  // Gemini plugins
  const plugDir = path.join(os.homedir(), '.gemini', 'config', 'plugins');
  if (fs.existsSync(plugDir)) {
    try {
      for (const p of fs.readdirSync(plugDir)) {
        const sp = path.join(plugDir, p, 'skills');
        if (fs.existsSync(sp)) candidateSources.push(sp);
      }
    } catch {}
  }

  // 1. Discover unique skills across all sources
  const discovered = new Map();
  for (const src of candidateSources) {
    if (!fs.existsSync(src)) continue;
    try {
      const entries = fs.readdirSync(src, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.name.startsWith('.') || ent.name === 'node_modules') continue;
        const fullPath = path.join(src, ent.name);
        let realTarget = fullPath;
        try {
          realTarget = fs.realpathSync(fullPath);
        } catch {
          continue;
        }
        const skillMd = path.join(realTarget, 'SKILL.md');
        if (fs.existsSync(skillMd)) {
          if (!discovered.has(ent.name)) {
            const meta = parseSkillMetadata(realTarget);
            discovered.set(ent.name, {
              name: ent.name,
              displayName: meta.name || ent.name,
              description: meta.description,
              sourcePath: realTarget
            });
          }
        }
      }
    } catch {}
  }

  // 2. Link each unique skill into every harness directory
  let newlyLinked = 0;
  for (const h of synchronize ? HARNESS_DIRS : []) {
    if (!fs.existsSync(h.path)) {
      try { fs.mkdirSync(h.path, { recursive: true }); } catch {}
    }
    for (const [skillName, skillInfo] of discovered) {
      const destPath = path.join(h.path, skillName);
      let exists = false;
      try {
        fs.lstatSync(destPath);
        exists = true;
      } catch {}

      if (!exists) {
        try {
          fs.symlinkSync(skillInfo.sourcePath, destPath, 'dir');
          newlyLinked++;
        } catch (err) {}
      }
    }
  }

  // 3. Assemble full inventory of skills and their active status per harness
  const resultList = [];
  for (const [skillName, skillInfo] of discovered) {
    const activeIn = [];
    for (const h of HARNESS_DIRS) {
      const p = path.join(h.path, skillName);
      if (fs.existsSync(p)) {
        activeIn.push({ id: h.id, name: h.name });
      }
    }
    resultList.push({
      ...skillInfo,
      activeHarnesses: activeIn,
      isFullySynced: activeIn.length === HARNESS_DIRS.length
    });
  }

  return {
    totalSkills: discovered.size,
    newlyLinked,
    hubDir: HUB_DIR,
    harnesses: HARNESS_DIRS.map(h => ({
      id: h.id,
      name: h.name,
      path: h.path,
      exists: fs.existsSync(h.path),
      count: fs.existsSync(h.path) ? (fs.readdirSync(h.path).filter(n => !n.startsWith('.')).length) : 0
    })),
    skills: resultList.sort((a, b) => a.name.localeCompare(b.name))
  };
}

app.get('/api/skills', (req, res) => {
  try {
    const syncResult = syncAllSkills({ synchronize: false });
    res.json(syncResult);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/skills/sync', (req, res) => {
  try {
    const syncResult = syncAllSkills();
    res.json({ success: true, ...syncResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/skills/install', (req, res) => {
  try {
    const { mode, name, repoUrl, description, content } = req.body;
    const HUB_DIR = path.join(os.homedir(), '.agents', 'skills');
    if (!fs.existsSync(HUB_DIR)) fs.mkdirSync(HUB_DIR, { recursive: true });

    if (mode === 'git') {
      if (typeof repoUrl !== 'string' || !repoUrl.trim()) return res.status(400).json({ error: 'Git Repository URL erforderlich' });
      const targetName = (name || path.basename(repoUrl, '.git')).trim().replace(/[^a-zA-Z0-9_-]/g, '-');
      const targetDir = path.join(HUB_DIR, targetName);
      if (fs.existsSync(targetDir)) return res.status(400).json({ error: `Skill "${targetName}" existiert bereits` });
      execFileSync('git', ['clone', '--depth', '1', '--', repoUrl, targetDir], { timeout: 30000, stdio: 'pipe' });
    } else {
      // Create custom skill
      if (!name) return res.status(400).json({ error: 'Skill-Name ist erforderlich' });
      const safeName = name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const targetDir = path.join(HUB_DIR, safeName);
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      const skillMd = path.join(targetDir, 'SKILL.md');
      const mdContent = `---\nname: "${safeName}"\ndescription: "${(description || '').replace(/"/g, '\\"')}"\n---\n\n${content || `# ${safeName}\nSkill für alle 9 Harnesses.`}\n`;
      fs.writeFileSync(skillMd, mdContent, 'utf8');
    }

    // Skills mit dem Hub und acht CLI-Verzeichnissen synchronisieren.
    const syncResult = syncAllSkills();
    res.json({ success: true, message: 'Skill für 8 CLI-Ziele installiert und synchronisiert!', sync: syncResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Schedules Management API
function loadSchedules() {
  if (!fs.existsSync(SCHEDULES_FILE)) return [];
  try {
    const schedules = JSON.parse(fs.readFileSync(SCHEDULES_FILE, 'utf8'));
    let migrated = false;
    for (const job of schedules) {
      if (!job.createdAt) { job.createdAt = new Date().toISOString(); migrated = true; }
    }
    if (migrated) saveSchedules(schedules);
    return schedules;
  } catch {
    return [];
  }
}

function saveSchedules(schedules) {
  try {
    fs.writeFileSync(SCHEDULES_FILE, JSON.stringify(schedules, null, 2), 'utf8');
  } catch (err) {
    console.error("Fehler beim Speichern der Schedules:", err);
  }
}

app.get('/api/schedules', (req, res) => {
  res.json({ schedules: loadSchedules() });
});

app.post('/api/schedules', (req, res) => {
  try {
    const { id, name, projectPath, interval, prompt, harness, enabled, notifyTelegram } = req.body;
    const schedules = loadSchedules();
    const data = loadTasksData();
    const resolvedProject = resolveWorkspaceDirectory(projectPath || (id ? schedules.find(s => s.id === id)?.projectPath : null), data.rootDirectory || DEFAULT_ROOT_DIR);
    const configuredRoutes = (loadConfig().clis || []).filter((route) => route.enabled !== false && route.capabilities.scheduler);
    if (harness && harness !== 'auto' && harness !== 'consensus' && !configuredRoutes.some((route) => route.name === harness)) {
      throw new Error('Der gewählte Harness ist für Zeitpläne nicht verfügbar');
    }
    const intervalLabels = {
      every_15_mins: 'Alle 15 Minuten',
      hourly: 'Stündlich',
      every_6_hours: 'Alle 6 Stunden',
      daily_02_00: 'Täglich um 02:00 Uhr',
      daily_08_00: 'Täglich um 08:00 Uhr',
      weekly_monday: 'Wöchentlich (Montag 08:00)'
    };

    if (id) {
      const idx = schedules.findIndex(s => s.id === id);
      if (idx !== -1) {
        schedules[idx] = {
          ...schedules[idx],
          name: name || schedules[idx].name,
          projectPath: resolvedProject,
          projectName: path.basename(resolvedProject),
          interval: interval || schedules[idx].interval,
          intervalLabel: intervalLabels[interval || schedules[idx].interval] || interval || schedules[idx].interval,
          prompt: prompt || schedules[idx].prompt,
          harness: harness || schedules[idx].harness,
          enabled: enabled !== undefined ? Boolean(enabled) : schedules[idx].enabled,
          notifyTelegram: notifyTelegram !== undefined ? Boolean(notifyTelegram) : schedules[idx].notifyTelegram
        };
      }
    } else {
      const newJob = {
        id: 'sched_' + Date.now(),
        name: name || 'Geplanter Task',
        projectPath: resolvedProject,
        projectName: path.basename(resolvedProject),
        interval: interval || 'daily_02_00',
        intervalLabel: intervalLabels[interval || 'daily_02_00'],
        prompt: prompt || 'Führe Routine-Checks und Optimierungen durch.',
        harness: harness || 'auto',
        enabled: enabled !== undefined ? Boolean(enabled) : true,
        notifyTelegram: notifyTelegram !== undefined ? Boolean(notifyTelegram) : true,
        createdAt: new Date().toISOString(),
        lastRun: null,
        lastStatus: null
      };
      schedules.unshift(newJob);
    }
    saveSchedules(schedules);
    res.json({ success: true, schedules });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/schedules/:id', (req, res) => {
  try {
    let schedules = loadSchedules();
    schedules = schedules.filter(s => s.id !== req.params.id);
    saveSchedules(schedules);
    res.json({ success: true, schedules });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/schedules/:id/run', (req, res) => {
  try {
    const schedules = loadSchedules();
    const job = schedules.find(s => s.id === req.params.id);
    if (!job) return res.status(404).json({ error: 'Job nicht gefunden' });

    runScheduledJob(job);
    res.json({ success: true, message: `Task "${job.name}" wurde gestartet.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- RUN POOL ---
// Ein Auftrag erhält seine Task-ID beim Einreichen und startet, sobald Kappe, Ordner
// und Harness frei sind. Bis dahin liegt er in der Warteschlange. Alle Meldungen eines
// Laufs tragen seine Task-ID, damit zwei gleichzeitige Konsolen trennbar bleiben.
const { liveRuns, dispatchQueue, maxConcurrentRuns, submitDispatch, cancelDispatch, writeTask, sendRunMessage } = createDispatchService({
  loadConfig, loadTasksData, taskStore, DEFAULT_ROOT_DIR, buildAgentsContext, broadcastToClients,
  prepareAttachment, prepareBead, saveCheckpoint, runConsensusDispatch, runDispatch, finalizeTask
});

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getWorkspaceChanges(dir) {
  try {
    if (dir && fs.existsSync(path.join(dir, '.git'))) {
      const status = execSync('git status --short', { cwd: dir, encoding: 'utf8', timeout: 3000 }).trim();
      const diffStat = execSync('git diff --stat 2>/dev/null', { cwd: dir, encoding: 'utf8', timeout: 3000 }).trim();
      if (status || diffStat) {
        return `Geänderte Dateien (Git Status):\n${status || 'Keine uncommitted Dateien'}\n\nDiff-Zusammenfassung:\n${diffStat || 'Keine Diff-Änderungen'}`;
      }
      return 'Keine lokalen Dateiänderungen im Git-Repository festgestellt.';
    }
  } catch (e) {}
  return 'Kein Git-Repository oder keine Änderungen festgestellt.';
}

function broadcastToClients(msg, excludeWs) {
  const json = typeof msg === 'string' ? msg : JSON.stringify(msg);
  wss.clients.forEach(client => {
    if (client === excludeWs) return; // Sender bekommt Nachricht nicht doppelt
    if (client.readyState === 1) { // OPEN
      try { client.send(json); } catch {}
    }
  });
}

// WebSocket for live streaming execution
wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === 'cancel') {
        cancelDispatch(data.taskId, ws);
        return;
      }

      if (data.type === 'cancel_install') {
        if (activeInstallProcess) {
          activeInstallProcess.kill('SIGINT');
          activeInstallProcess = null;
          broadcastToClients({ type: 'install_output', text: '\n[Installation abgebrochen]\n', html: '<span style="color:var(--danger)">\n[Installation abgebrochen]</span>\n' });
        }
        return;
      }

      if (data.type === 'dispatch') {
        submitDispatch(data, ws);
      }
    } catch (err) {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'error', error: err.message, message: err.message }));
    }
  });
});

// This server is often started from inside an agent session. That marker would make
// a child qodercli expect the SDK control protocol and abort before it ever calls a model.
// Das Terminal biegt claude über seine Login-Shell auf den eigenen Gateway um. Ein per
// Doppelklick, Launchservices oder Agent-Shell gestarteter Server sieht diese Exporte nie —
// also einmal die Shell selbst fragen, denn sie ist die einzige Quelle, die genau das
// nachbaut, was im Terminal gilt. Nur die Gateway-Namen wandern mit, nie die Shell-Kosmetik.
const { UserEnvironment } = require('./runtime/user-environment');
const userEnvironment = new UserEnvironment();
function gatewayEnv() {
  try { return userEnvironment.environment(); }
  catch { console.error('[Konfiguration] Shell-Konfiguration konnte nicht geladen werden.'); return process.env; }
}
function harnessEnv(overrides = {}) {
  const env = { ...gatewayEnv(), FORCE_COLOR: '1', ...overrides };
  delete env.QODER_AGENT_SDK_ENTRYPOINT;
  return env;
}
app.post('/api/user-environment/reload', (req, res) => {
  try { res.json(userEnvironment.reload()); }
  catch (error) { res.status(503).json({ error: error.message }); }
});
app.post('/api/context/preview', async (req, res) => {
  try {
    const { previewContext } = require('./services/context-preview');
    res.json(await previewContext(req.body, {rootDirectory: loadTasksData().rootDirectory,
      globalFile: AGENTS_MD_FILE, beads, taskStore}));
  } catch (error) { res.status(400).json({error: error.message}); }
});

function buildAgentsContext(workingDir) {
  const { rules, sources } = loadRules(workingDir, loadTasksData().rootDirectory || DEFAULT_ROOT_DIR, AGENTS_MD_FILE);
  return { agentsContext: rules, agentsSources: sources.map((source) => `${path.basename(path.dirname(source.path))}/AGENTS.md (${source.bytes} Bytes)`) };
}

function taskContext(entry, extra = {}) {
  const { agentsContext } = buildAgentsContext(entry.workingDir);
  const state = gitState(entry.workingDir);
  const previous = taskStore.get(entry.payload.previousTaskId || '');
  const prior = previous?.projectPath === entry.workingDir
    ? (previous.checkpoint || checkpoint(previous, null, 'Stand des früheren Laufs unbekannt')) : null;
  return buildContext({ rules: agentsContext, prompt: entry.payload.prompt, image: entry.record.image,
    previous: extra.relay ? entry.record.checkpoint : prior, git: `${state.revision || 'unbekannt'}\n${state.changes}`, bead: entry.bead, beadsContext: entry.beadsContext, ...extra });
}

function prepareAttachment(entry) {
  const imagePath = entry.payload.imagePath;
  if (!imagePath) {
    const previous = taskStore.get(entry.payload.previousTaskId || '');
    if (previous?.projectPath === entry.workingDir && previous.image && fs.existsSync(path.join(entry.workingDir, path.basename(previous.image)))) entry.record.image = path.basename(previous.image);
    return;
  }
  const actual = fs.realpathSync(imagePath);
  if (!actual.startsWith(`${fs.realpathSync(UPLOADS_DIR)}${path.sep}`)) throw new Error('Bildpfad liegt außerhalb des Upload-Verzeichnisses');
  const image = `.harness-task-image-${entry.taskId}${path.extname(actual) || '.png'}`;
  fs.copyFileSync(actual, path.join(entry.workingDir, image));
  entry.record.image = image;
}

function saveCheckpoint(record, resultText) {
  if (resultText) record.resultText = resultText.slice(-12000);
  const state = gitState(record.projectPath);
  record.checkpoint = checkpoint(record, state.revision, state.changes);
}

async function prepareBead(entry) {
  try {
    if (entry.payload.withoutBeads === true) {
      entry.record.beadsContext = { state: 'bypassed' };
      sendRunMessage(entry.ws, entry.taskId, { type: 'context_status', projectPath: entry.workingDir, state: 'bypassed' });
      return;
    }
    entry.beadsContext = await beads.context(entry.workingDir, { prompt: entry.payload.prompt });
  } catch (err) {
    sendRunMessage(entry.ws, entry.taskId, { type: 'context_status', projectPath: entry.workingDir, state: 'error', error: err.message });
    throw new Error(`Beads-Projektkontext konnte nicht geladen werden: ${err.message}`);
  }
  if (entry.beadsContext) {
    entry.record.beadsContext = { loadedAt: new Date().toISOString(),
      state: 'ready', characters: entry.beadsContext.prime.length, memoryCount: entry.beadsContext.memoryCount, availableTasks: entry.beadsContext.availableTasks };
  }
  sendRunMessage(entry.ws, entry.taskId, { type: 'context_status', projectPath: entry.workingDir,
    state: entry.beadsContext ? 'ready' : 'disabled', memoryCount: entry.beadsContext?.memoryCount || 0 });
  if (entry.payload.beadId) {
    entry.bead = await beads.show(entry.workingDir, entry.payload.beadId);
    entry.record.bead = entry.bead;
  }
}

app.get('/api/beads', async (req, res) => {
  try {
    const directory = resolveWorkspaceDirectory(req.query.projectPath, loadTasksData().rootDirectory);
    res.json({ ...(await beads.status(directory)), backup: backupService.status(directory) });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

app.get('/api/tasks/:id/attempts', (req, res) => res.json({ attempts: taskStore.attempts(req.params.id) }));

function captureToolEvidence(record, event, attemptId) {
  const entry = liveRuns.get(record.id);
  if (!entry) return;
  entry.toolEvidence ||= new Map();
  const state = event.type === 'tool_start' && (event.input?.command || event.input?.cmd) ? gitState(record.projectPath) : {};
  recordToolEvidence(record, entry.toolEvidence, event, state, attemptId);
}

async function finalizeTask(entry) {
  if (entry.payload.withoutBeads === true || !beads.enabled(entry.workingDir) || !entry.beadsContext) return;
  try {
    entry.record.memoryStatus = await beads.learn(entry.workingDir, entry.record);
    backupService.request(entry.workingDir, { force: entry.record.memoryStatus.saved > 0 });
  } catch (error) { entry.record.memoryStatus = { state: 'error', error: error.message }; }
  sendRunMessage(entry.ws, entry.taskId, { type: 'context_status', projectPath: entry.workingDir,
    ...entry.record.memoryStatus, backup: backupService.status(entry.workingDir) });
}

// Consensus Mode Dispatch (Dual-Agent Collaboration & Synthesis)
function runConsensusDispatch(entry) {
  const { taskId, ws } = entry;
  const onComplete = entry.finish;
  const notify = (obj) => sendRunMessage(ws, taskId, obj);

  const { prompt, imagePath } = entry.payload;
  const config = loadConfig();
  const clis = config.clis || [];
  const enabledRoutes = clis.filter(c => c.enabled !== false && c.capabilities.consensus);

  const routeA = enabledRoutes[0];
  const routeB = enabledRoutes.find((route) => route.harnessId !== routeA?.harnessId);
  if (!routeB) {
    entry.record.status = 'failed';
    writeTask(entry.record);
    notify(terminalMessage(entry.record, 'Konsens benötigt mindestens zwei aktive Headless-Harnesses.'));
    onComplete(new Error('Zu wenige Harnesses für Konsens-Modus'), entry.record);
    return;
  }

  const workingDir = entry.workingDir;

  const { agentsContext } = buildAgentsContext(workingDir);
  const agentsInfo = entry.record.agentsInfo;
  const guidelinePrompt = taskContext(entry);

  const taskRecord = entry.record;
  entry.commands = [routeA.command, routeB.command];

  notify({
    type: 'route_selected',
    taskId: taskId,
    harness: `Konsens: ${routeA.name} ↔ ${routeB.name}`,
    harnessType: 'consensus',
    command: 'consensus',
    model: `${routeA.model || 'Standard'} & ${routeB.model || 'Standard'}`,
    workingDir: workingDir,
    agentsInfo: `Dual-Agent Kollaboration & Synthese · Richtlinien: ${agentsInfo}`,
    projectPath: workingDir
  });

  const banner = `<div class="consensus-banner">
    <div style="font-weight:700; font-size:14px; margin-bottom:4px;">KONSENS-MODUS AKTIV</div>
    <div style="font-size:12px; color:var(--text-muted);">
      Zwei Engines arbeiten zusammen: <strong>${escapeHtml(routeA.name)}</strong> & <strong>${escapeHtml(routeB.name)}</strong>.<br/>
      Phase 1 & 2 erarbeiten eigenständige Ansätze → Phase 3 debattiert und synthetisiert die finale Lösung.
    </div>
  </div>\n\n`;

  taskRecord.outputHtml += banner;
  notify({ type: 'output', html: banner });

  const promptA = guidelinePrompt;
  const promptB = guidelinePrompt;

  const phaseFailures = [];
  const lastOutputLine = (text) => (text || '')
    .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
    .split('\n').map(l => l.trim()).filter(Boolean).slice(-1)[0] || '';
  const reportPhaseFailure = (route, err, code, output) => {
    const base = err ? err.message
      : (code !== 0 ? `Prozess endete mit Exit-Code ${code}` : 'Engine hat keine Antwort geliefert');
    // The CLI usually names the reason on its last line — without it the banner is useless.
    const detail = err ? '' : lastOutputLine(output);
    const reason = detail ? `${base}: ${detail.slice(0, 160)}` : base;
    phaseFailures.push(`${route.name}: ${reason}`);
    const html = `\n<div class="consensus-phase phase-fail"><strong>⚠ Phase ausgefallen:</strong> ${escapeHtml(route.name)} — ${escapeHtml(reason)}. Dieser Ansatz fehlt der Abstimmung.</div>\n`;
    taskRecord.outputHtml += html;
    notify({ type: 'output', html });
  };

  // Phase 1: Route A
  const p1Header = `<div class="consensus-phase phase-a"><strong>Phase 1:</strong> ${escapeHtml(routeA.name)} erarbeitet Lösungsansatz A...</div>\n`;
  taskRecord.outputHtml += p1Header;
  notify({ type: 'output', html: p1Header });

  executeSingleRun(routeA, `[Phase 1 Entwurf] ${promptA}`, workingDir, notify, taskRecord, (errA, outputA, codeA) => {
    if (entry.cancelled) { taskRecord.status = 'cancelled'; taskRecord.exitCode = 130; saveCheckpoint(taskRecord); writeTask(taskRecord); notify(terminalMessage(taskRecord, 'Abgebrochen durch Benutzer')); onComplete(new Error('Abgebrochen'), taskRecord); return; }
    if (errA || codeA !== 0 || !(outputA || '').trim()) reportPhaseFailure(routeA, errA, codeA, outputA);

    // Phase 2: Route B
    const p2Header = `\n<div class="consensus-phase phase-b"><strong>Phase 2:</strong> ${escapeHtml(routeB.name)} erarbeitet alternativen Lösungsansatz B...</div>\n`;
    taskRecord.outputHtml += p2Header;
    notify({ type: 'output', html: p2Header });

    executeSingleRun(routeB, `[Phase 2 Alternativ-Entwurf] ${promptB}`, workingDir, notify, taskRecord, (errB, outputB, codeB) => {
      if (entry.cancelled) { taskRecord.status = 'cancelled'; taskRecord.exitCode = 130; saveCheckpoint(taskRecord); writeTask(taskRecord); notify(terminalMessage(taskRecord, 'Abgebrochen durch Benutzer')); onComplete(new Error('Abgebrochen'), taskRecord); return; }
      if (errB || codeB !== 0 || !(outputB || '').trim()) reportPhaseFailure(routeB, errB, codeB, outputB);

      // Phase 3: Synthesis & Implementation
      const p3Header = `\n<div class="consensus-phase phase-debate"><strong>Phase 3 (Debatte & Synthese):</strong> Gemeinsame Prüfung & Erarbeitung der perfekten Konsens-Lösung...</div>\n`;
      taskRecord.outputHtml += p3Header;
      notify({ type: 'output', html: p3Header });

      const textA = (outputA || '').slice(-2500).replace(/<[^>]+>/g, '').trim();
      const textB = (outputB || '').slice(-2500).replace(/<[^>]+>/g, '').trim();
      const missing = (name) => `⚠ ${name} hat keinen Ansatz geliefert. Behandle das als fehlend und erfinde keine Vorteile dieses Ansatzes.`;

      const synthesisPrompt = `[KONSENS-SYNTHESE UND FINALE UMSETZUNG]
Benutzeraufgabe: "${prompt}"

Hier sind zwei unabhängig erarbeitete Lösungsansätze:
=== ANSATZ A (${routeA.name}) ===
${textA || missing(routeA.name)}

=== ANSATZ B (${routeB.name}) ===
${textB || missing(routeB.name)}

AUFGABE FÜR DIE KONSENS-SYNTHESE:
1. Vergleiche beide Ansätze kritisch: Welche Best Practices, Edge-Cases oder Syntax-Fehler wurden beachtet oder übersehen?
2. Führe die finale, perfekte und vollständige Lösung im Codebase-Projekt aus.
3. Fasse in 2-3 Sätzen zusammen, welche Vorteile der tatsächlich vorliegenden Ansätze eingeflossen sind. Fehlt ein Ansatz, sage das ausdrücklich.`;

      executeSingleRun(routeA, taskContext(entry, { prompt: synthesisPrompt }), workingDir, notify, taskRecord, (errFinal, outputFinal, codeFinal) => {
        if (entry.cancelled) { taskRecord.status = 'cancelled'; taskRecord.exitCode = 130; saveCheckpoint(taskRecord); writeTask(taskRecord); notify(terminalMessage(taskRecord, 'Abgebrochen durch Benutzer')); onComplete(new Error('Abgebrochen'), taskRecord); return; }
        if (errFinal || codeFinal !== 0 || !(outputFinal || '').trim()) reportPhaseFailure(routeA, errFinal, codeFinal, outputFinal);

        const complete = phaseFailures.length === 0;
        taskRecord.status = complete ? 'completed' : 'incomplete';
        const finishBanner = complete
          ? `\n<div class="consensus-phase phase-done"><strong>Konsens erfolgreich erzielt!</strong> Die gemeinsame Lösung wurde im Projekt angewendet.</div>\n`
          : `\n<div class="consensus-phase phase-fail"><strong>Konsens unvollständig (${phaseFailures.length} Ausfall/Ausfälle):</strong> ${escapeHtml(phaseFailures.join(' · '))}</div>\n`;
        taskRecord.outputHtml += finishBanner;
        notify({ type: 'output', html: finishBanner });

        taskRecord.exitCode = complete ? 0 : 1;
        saveCheckpoint(taskRecord, outputFinal);
        writeTask(taskRecord);
        notify(terminalMessage(taskRecord, complete ? 'Konsens erfolgreich abgeschlossen' : `Konsens mit Ausfall abgeschlossen — ${phaseFailures.join(' · ')}`));

        onComplete(complete ? null : new Error(phaseFailures.join(' · ')), taskRecord);
      });
    });
  });
}

function renderRuntimeEvent(event, renderChunk) {
  let raw = '';
  if (event.type === 'text') raw = event.text || '';
  else if (event.type === 'thinking') raw = `[thinking] ${event.text || ''}\n`;
  else if (event.type === 'warning') raw = event.text || '';
  else if (event.type === 'tool_start') raw = `Werkzeug: ${event.name || 'unbekannt'}\n`;
  else if (event.type === 'tool_result') raw = `⎿ ${event.text || ''}\n`;
  else if (event.type === 'session_lost') raw = `${event.message}\n`;
  else if (event.type === 'error') raw = `${event.message}\n`;
  if (!raw) return null;
  const html = event.type === 'warning' || event.type === 'error' || event.type === 'session_lost'
    ? `<span style="color:var(--warning)">${renderChunk(raw)}</span>` : renderChunk(raw);
  return { raw, html };
}

function executeSingleRun(selectedRoute, fullPrompt, workingDir, notify, taskRecord, callback) {
  const controller = new AbortController();
  const entry = liveRuns.get(taskRecord.id);
  if (entry?.cancelled) controller.abort();
  if (entry) {
    if (!entry.controllers) entry.controllers = new Set();
    entry.controllers.add(controller);
  }
  const renderChunk = makeChunkRenderer();
  const attemptId = taskStore.beginAttempt(taskRecord.id, { harnessId: selectedRoute.harnessId, model: selectedRoute.model });
  runHarness({
    harnessId: selectedRoute.harnessId,
    model: selectedRoute.model || 'Standard', prompt: fullPrompt, cwd: workingDir,
    env: harnessEnv({ PWD: workingDir }), signal: controller.signal, execution: loadConfig().execution,
    idleTimeoutMs: RUN_IDLE_TIMEOUT_MS,
    onIdle: (idleMs) => {
      const html = `\n<div class="route-fallback-banner">⏱ <strong>Keine Ausgabe seit ${Math.round(idleMs / 1000)} s</strong> — ${escapeHtml(selectedRoute.name)} wird abgebrochen.</div>\n`;
      taskRecord.outputHtml += html;
      notify({ type: 'output', html });
    },
    onEvent: (event) => {
      taskStore.addEvent(attemptId, event);
      captureToolEvidence(taskRecord, event, attemptId);
      const output = renderRuntimeEvent(event, renderChunk);
      if (!output) return;
      taskRecord.outputHtml += output.html;
      notify({ type: 'output', ...output });
    }
  }).then((result) => {
    taskStore.finishAttempt(attemptId, { status: result.status, exitCode: result.exitCode, error: result.error, sessionId: result.sessionId });
    taskRecord.resultText = result.finalText.slice(-12000);
    if (result.sessionId) taskRecord.sessionId = result.sessionId;
    callback(result.status === 'completed' ? null : new Error(result.error?.message || result.status), result.finalText, result.exitCode, result);
  }).catch((err) => callback(err, '', null, { status: 'failed', error: { kind: 'harness_failure', message: err.message } }))
    .finally(() => entry?.controllers?.delete(controller));
}

// Standard Dispatch with Automatic Forward-Routing (Priority Fallback Chain)
// Die Kette läuft nur noch für einen Auftrag aus dem Pool: Task-ID, Ordner und
// Meldungsweg kommen aus dem Eintrag, damit mehrere Ketten einander nicht überschreiben.
function runDispatch(entry) {
  const { taskId, ws, workingDir } = entry;
  const notify = (obj) => sendRunMessage(ws, taskId, obj);
  const { prompt, harnessOverride, modelOverride, imagePath } = entry.payload;
  const configured = (loadConfig().clis || []).filter((route) => route.enabled !== false && route.capabilities.dispatchable);
  const candidateRoutes = harnessOverride && harnessOverride !== 'auto'
    ? configured.filter((route) => route.name === harnessOverride)
    : configured;
  const taskRecord = entry.record;
  const fullPrompt = taskContext(entry);

  const finish = (status, result, message) => {
    taskRecord.status = status;
    taskRecord.exitCode = status === 'cancelled' ? 130 : status === 'completed' ? 0 : (result?.exitCode || 1);
    if (result?.error) taskRecord.error = result.error;
    if (result?.sessionId) taskRecord.sessionId = result.sessionId;
    saveCheckpoint(taskRecord, result?.finalText);
    writeTask(taskRecord);
    notify(terminalMessage(taskRecord, message));
    entry.finish(status === 'completed' ? null : new Error(message), taskRecord);
  };

  if (!candidateRoutes.length) {
    finish('failed', null, 'Kein aktives Headless-Harness gefunden. Bitte ein Harness in den Einstellungen aktivieren.');
    return;
  }

  const dispatchHealthMarks = loadHarnessHealthMarks();
  const renderChunk = makeChunkRenderer();
  const previousTask = entry.payload.previousTaskId
    ? (loadTasksData().tasks || []).find((task) => task.id === entry.payload.previousTaskId)
    : null;

  (async () => {
    let relayContext = null;
    for (let index = 0; index < candidateRoutes.length; index += 1) {
      if (entry.cancelled) { finish('cancelled', null, 'Abgebrochen durch Benutzer'); return; }
      const route = candidateRoutes[index];
      const blocked = [
        knownBrokenBlocker(route, dispatchHealthMarks, { explicitChoice: Boolean(harnessOverride && harnessOverride !== 'auto') })
      ].filter(Boolean);
      if (blocked.length) {
        const html = `<div class="route-fallback-banner"><strong>${escapeHtml(route.name)}</strong> wird übersprungen: ${escapeHtml(blocked.join('; '))}.</div>\n`;
        taskRecord.outputHtml += html;
        notify({ type: 'output', html });
        continue;
      }

      const model = modelOverride && modelOverride !== 'Standard' ? modelOverride : (route.model || 'Standard');
      taskRecord.harness = route.name;
      taskRecord.harnessId = route.harnessId;
      taskRecord.command = route.command;
      taskRecord.model = model;
      entry.commands = [route.command];
      notify({ type: 'route_selected', harness: route.name, harnessType: route.harnessId,
        command: route.command, model, workingDir, agentsInfo: taskRecord.agentsInfo, projectPath: workingDir });
      const header = `<div class="route-banner"><span class="badge badge-accent">Priorität #${index + 1}</span>` +
        `<span><strong>Harness:</strong> ${escapeHtml(route.name)} (${escapeHtml(route.command)})</span>` +
        `<span><strong>Modell:</strong> ${escapeHtml(model)}</span>` +
        `<span><strong>Projekt:</strong> ${escapeHtml(path.basename(workingDir))}</span>` +
        `<span><strong>Kontext:</strong> ${escapeHtml(taskRecord.agentsInfo)}</span></div>\n\n`;
      taskRecord.outputHtml += header;
      notify({ type: 'output', html: header });

      const effectivePrompt = taskContext(entry, { relay: relayContext });
      const previousSessionId = !relayContext && previousTask?.projectPath === workingDir &&
        previousTask?.harnessId === route.harnessId ? previousTask.sessionId : null;
      const controller = new AbortController();
      if (!entry.controllers) entry.controllers = new Set();
      entry.controllers.add(controller);
      let result;
      const attemptId = taskStore.beginAttempt(taskRecord.id, { harnessId: route.harnessId, model });
      taskRecord.activeAttemptId = attemptId;
      writeTask(taskRecord);
      try {
        result = await runHarness({ harnessId: route.harnessId, model, prompt: effectivePrompt,
          cwd: workingDir, previousSessionId, signal: controller.signal, execution: loadConfig().execution,
          env: harnessEnv({ PWD: workingDir }), idleTimeoutMs: RUN_IDLE_TIMEOUT_MS,
          onIdle: (idleMs) => {
            const html = `<div class="route-fallback-banner">⏱ <strong>${escapeHtml(route.name)}</strong> schreibt seit ${Math.round(idleMs / 1000)} s nichts mehr — Abbruch und Übergabe.</div>\n`;
            taskRecord.outputHtml += html;
            notify({ type: 'output', html });
          },
          onEvent: (event) => {
            taskStore.addEvent(attemptId, event);
            captureToolEvidence(taskRecord, event, attemptId);
            const output = renderRuntimeEvent(event, renderChunk);
            if (!output) return;
            taskRecord.outputHtml += output.html;
            notify({ type: 'output', ...output });
          }
        });
      } finally {
        entry.controllers.delete(controller);
      }
      taskStore.finishAttempt(attemptId, { status: result.status, exitCode: result.exitCode, error: result.error, sessionId: result.sessionId });
      saveCheckpoint(taskRecord, result.finalText);
      writeTask(taskRecord);
      if (result.status === 'cancelled') {
        finish('cancelled', result, 'Abgebrochen durch Benutzer');
        return;
      }
      if (result.status === 'completed') {
        const promptTokens = Math.round(fullPrompt.length / 4);
        const outputTokens = Math.round(result.finalText.length / 4);
        const totalTokens = promptTokens + outputTokens;
        const contextMax = ['claude', 'antigravity'].includes(route.harnessId) ? 1000000 : 200000;
        taskRecord.usage = { promptTokens, outputTokens, totalTokens, contextMax,
          remainingTokens: Math.max(0, contextMax - totalTokens),
          remainingPercent: Math.max(0, Math.round((1 - totalTokens / contextMax) * 1000) / 10), cost: '–' };
        const usageBanner = `\n<div class="usage-summary-banner">` +
          `<span class="badge badge-accent">📊 Nutzung</span>` +
          `<span><strong>Tokens (geschätzt):</strong> ${totalTokens.toLocaleString('de-DE')} (${promptTokens.toLocaleString('de-DE')} Prompt / ${outputTokens.toLocaleString('de-DE')} Antwort)</span>` +
          `<span><strong>Verbleibend (geschätzt):</strong> ${taskRecord.usage.remainingPercent}%</span>` +
          `</div>\n`;
        taskRecord.outputHtml += usageBanner;
        notify({ type: 'output', html: usageBanner });
        finish('completed', result, 'Erfolgreich abgeschlossen');
        return;
      }

      const reason = result.error?.message || `Fehlercode ${result.exitCode}`;
      if (index + 1 >= candidateRoutes.length || result.error?.retryability !== 'next_harness') {
        finish('failed', result, reason);
        return;
      }
      const lastOutput = (result.finalText || result.rawTail || '').replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '').trim().slice(-2500);
      relayContext = { prevHarness: route.name, reason, lastOutput: lastOutput || 'Keine Konsolenausgabe vorhanden',
        workspaceDiff: getWorkspaceChanges(workingDir) };
      taskRecord.relayHandoffs = taskRecord.relayHandoffs || [];
      taskRecord.relayHandoffs.push({ from: route.name, to: candidateRoutes[index + 1].name, reason, timestamp: new Date().toISOString() });
      const html = `<div class="route-fallback-banner"><strong>${escapeHtml(route.name)}</strong> abgebrochen (${escapeHtml(reason)}). ` +
        `Kontext-Relay an <strong>${escapeHtml(candidateRoutes[index + 1].name)}</strong>…</div>\n`;
      taskRecord.outputHtml += html;
      notify({ type: 'output', html });
    }
    finish('failed', null, 'Alle verfügbaren Harnesses in der Prioritätskette sind fehlgeschlagen.');
  })().catch((err) => finish('failed', { error: { kind: 'harness_failure', message: err.message } }, err.message));
}

// Background Scheduler Execution Engine
function runScheduledJob(job) {
  const data = loadTasksData();
  resolveWorkspaceDirectory(job.projectPath, data.rootDirectory || DEFAULT_ROOT_DIR);
  console.log(`[Scheduler] Führe geplanten Job aus: "${job.name}" im Projekt "${job.projectPath}"`);
  job.lastRun = new Date().toISOString();
  job.lastStatus = 'running';
  saveSchedules(loadSchedules().map(s => s.id === job.id ? job : s));

  submitDispatch(
    {
      prompt: job.prompt,
      harnessOverride: job.harness || 'auto',
      projectPath: job.projectPath
    },
    null,
    async (err, taskRecord) => {
      const schedules = loadSchedules();
      const updated = schedules.map(s => {
        if (s.id === job.id) {
          return {
            ...s,
            lastStatus: taskRecord?.status || (err ? 'failed' : 'completed'),
            lastRun: new Date().toISOString()
          };
        }
        return s;
      });
      saveSchedules(updated);

      // Telegram notification
      if (job.notifyTelegram) {
        const config = loadConfig();
        const tele = config.remote?.telegram;
        if (tele && tele.enabled && tele.botToken && tele.allowedUsers && tele.allowedUsers.length > 0) {
          const icon = err ? '⚠️' : '✅';
          const msg = `${icon} *Geplanter Task ausgeführt: ${job.name}*\n` +
            `📁 *Projekt:* \`${path.basename(job.projectPath)}\`\n` +
            `⚡ *Status:* ${err ? 'Fehlgeschlagen: ' + err.message : 'Erfolgreich abgeschlossen'}\n` +
            `💬 *Prompt:* \`${job.prompt.slice(0, 80)}\``;
          try {
            await sendTelegramMessage(tele.botToken, tele.allowedUsers[0], msg);
          } catch {}
        }
      }
    }
  );
}

function checkAndRunSchedules() {
  const schedules = loadSchedules();
  const now = new Date();
  schedules.forEach(job => {
    if (job.enabled && isJobDue(job, now)) {
      try { runScheduledJob(job); }
      catch (err) {
        job.lastRun = now.toISOString();
        job.lastStatus = 'failed';
        saveSchedules(schedules);
        console.error(`[Scheduler] ${job.name}: ${err.message}`);
      }
    }
  });
}

// Run schedule check every 60 seconds
setInterval(checkAndRunSchedules, 60000);

// --- REMOTE, TAILSCALE & TELEGRAM BOT ENGINE ---

function getLanIp() {
  try {
    const out = execSync("ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null", { encoding: 'utf8' }).trim();
    if (out) return out;
  } catch {}
  return '192.168.178.169';
}

function getTailscaleIp() {
  try {
    const out = execSync("ifconfig 2>/dev/null | grep 'inet 100\\.'", { encoding: 'utf8' });
    const match = out.match(/inet\s+(100\.\d+\.\d+\.\d+)/);
    if (match) return match[1];
  } catch {}
  return null;
}

function stripHtmlAndAnsi(htmlStr) {
  if (!htmlStr) return '';
  return htmlStr
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<div class="route-banner"[\s\S]*?<\/div>/gi, '')
    .replace(/<div class="usage-summary-banner"[\s\S]*?<\/div>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x27;/g, "'")
    .replace(/&#x3D;/g, '=')
    .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
    .trim();
}

function formatOutputForTelegram(rawHtml) {
  let text = stripHtmlAndAnsi(rawHtml);
  // Remove thought blocks if present
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (text.length > 3200) {
    return text.slice(0, 1400) + '\n\n... [gekürzt für Telegram] ...\n\n' + text.slice(-1600);
  }
  return text || '(Keine Textausgabe)';
}

const telegramBotState = {
  isRunning: false,
  botUsername: null,
  botName: null,
  lastPollError: null
};

let telegramPollController = null;
let telegramPollGeneration = 0;

async function checkTelegramBotToken(token) {
  if (!token) return { ok: false, error: 'Kein Token angegeben' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await res.json();
    if (data.ok && data.result) {
      return { ok: true, user: data.result };
    }
    return { ok: false, error: data.description || 'Ungültiges Token' };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function sendTelegramMessage(token, chatId, text, options = {}) {
  try {
    const payload = {
      chat_id: chatId,
      text: text,
      parse_mode: options.parseMode || 'Markdown',
      ...options
    };
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return await res.json();
  } catch (err) {
    console.error("Telegram sendMessage Error:", err);
    return { ok: false, error: err.message };
  }
}

async function sendTelegramAnswerCallback(token, callbackQueryId, text = '') {
  try {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text })
    });
  } catch {}
}

async function handleTelegramUpdate(update, token) {
  try {
    const config = loadConfig();
    const allowed = (config.remote?.telegram?.allowedUsers || []).map(String);

    // 1. Handle Inline Button Click (callback_query)
    if (update.callback_query) {
      const cb = update.callback_query;
      const chatId = cb.message.chat.id;
      const userId = String(cb.from.id);
      const data = cb.data || '';

      if (!allowed.includes(userId)) {
        await sendTelegramAnswerCallback(token, cb.id, "Nicht autorisiert!");
        return;
      }

      if (data.startsWith('proj:')) {
        const targetProj = data.slice(5);
        const td = loadTasksData();
        const rootDir = td.rootDirectory || DEFAULT_ROOT_DIR;
        const selected = scanProjects(rootDir).find((project) => project.name === targetProj);
        if (selected) {
          const targetPath = resolveWorkspaceDirectory(selected.path, rootDir);
          td.activeProject = targetPath;
          saveTasksData(td);
          await sendTelegramAnswerCallback(token, cb.id, `Projekt: ${targetProj}`);
          await sendTelegramMessage(token, chatId, `📁 *Aktives Projekt gewechselt zu:* \`${targetProj}\`\nPfad: \`${targetPath}\``);
        }
      } else if (data.startsWith('harn:')) {
        const harnessName = data.slice(5);
        await sendTelegramAnswerCallback(token, cb.id, `Harness: ${harnessName}`);
        await sendTelegramMessage(token, chatId, `⚡ *Routing gesetzt auf:* \`${harnessName}\``);
      }
      return;
    }

    // 2. Handle Text Message
    const msg = update.message;
    if (!msg) return;
    const chatId = msg.chat.id;
    const userId = String(msg.from.id);
    const username = msg.from.username || msg.from.first_name || 'User';
    const text = (msg.text || '').trim();

    if (!allowed.includes(userId)) {
      await sendTelegramMessage(
        token,
        chatId,
        `⛔ *Zugriff verweigert!*\nDieser Bot ist exklusiv an das persönliche CLIScade auf dem Mac gekoppelt (User-ID \`${userId}\` nicht freigeschaltet).`
      );
      return;
    }

    // Voice Message notice
    if (msg.voice) {
      await sendTelegramMessage(
        token,
        chatId,
        `🎙️ *Sprachnachricht empfangen!*\nAktuell unterstützt: Text-Befehle im Chat sowie Live-Spracheingabe (🎙️) direkt in der mobilen Web-App auf dem Smartphone.`
      );
      return;
    }

    // Photo / Screenshot Attachment Handling (Multimodal)
    let imagePath = null;
    if (msg.photo && msg.photo.length > 0) {
      try {
        const photo = msg.photo[msg.photo.length - 1]; // Highest resolution
        const fileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${photo.file_id}`);
        const fileData = await fileRes.json();
        if (fileData.ok && fileData.result?.file_path) {
          const dlUrl = `https://api.telegram.org/file/bot${token}/${fileData.result.file_path}`;
          const res = await fetch(dlUrl);
          const imgBuf = Buffer.from(await res.arrayBuffer());
          const ext = path.extname(fileData.result.file_path) || '.jpg';
          const safeName = `tg_${Date.now()}_${photo.file_unique_id}${ext}`;
          imagePath = path.join(UPLOADS_DIR, safeName);
          fs.writeFileSync(imagePath, imgBuf);
        }
      } catch (err) {
        console.error("Telegram photo download failed:", err);
      }
    }

    let rawPrompt = (msg.text || msg.caption || '').trim();
    if (!rawPrompt && imagePath) {
      rawPrompt = 'Analysiere diesen Screenshot / dieses Bild und führe die erforderlichen Anpassungen im Code durch.';
    }

    if (!rawPrompt) return;

    // Command: /start or /help
    if (rawPrompt === '/start' || rawPrompt === '/help') {
      const td = loadTasksData();
      const currentProj = td.activeProject ? path.basename(td.activeProject) : 'Standard';
      await sendTelegramMessage(
        token,
        chatId,
        `⚡ *CLIScade Remote Bot*\n` +
        `Verbunden mit deinem Mac!\n\n` +
        `📁 *Aktives Projekt:* \`${currentProj}\`\n\n` +
        `*Befehle von unterwegs:*\n` +
        `• \`/status\` – Status, Pfade & Kontingente\n` +
        `• \`/projects\` – Projekt auswählen (Buttons)\n` +
        `• \`/harness\` – KI-Modell / CLI auswählen\n` +
        `• \`/usage\` – Kontingente aller 9 CLIs\n` +
        `• \`/consensus <Aufgabe>\` – Dual-Agent Kollaboration & Synthese\n` +
        `• \`/run <prompt>\` – Oder tippe einfach direkt deine Aufgabe!\n\n` +
        `📸 *Multimodal:* Sende ein Bildschirmfoto oder Bild (mit oder ohne Text), um visuelle Bugs zu lösen.\n` +
        `💡 *Tipp:* Jede gewöhnliche Textnachricht wird automatisch als Prompt im aktiven Projekt ausgeführt.`
      );
      return;
    }

    // Command: /status
    if (rawPrompt === '/status') {
      const td = loadTasksData();
      const currentProj = td.activeProject ? path.basename(td.activeProject) : 'Standard';
      const rootDir = td.rootDirectory || DEFAULT_ROOT_DIR;
      const clis = (loadConfig().clis || []).filter(c => c.enabled !== false && c.capabilities.telegramDispatch);
      const readyClis = clis.map(c => `• ${c.name} (\`${c.command}\`)`).join('\n') || 'Keine CLIs aktiv';

      await sendTelegramMessage(
        token,
        chatId,
        `📊 *CLIScade Status:*\n\n` +
        `📁 *Root:* \`${rootDir}\`\n` +
        `📦 *Projekt:* \`${currentProj}\`\n` +
        `🟢 *Server:* \`http://${getLanIp()}:${PORT}\`\n\n` +
        `*Aktive Routen (${clis.length}):*\n${readyClis}`
      );
      return;
    }

    // Command: /projects
    if (rawPrompt === '/projects') {
      const td = loadTasksData();
      const rootDir = td.rootDirectory || DEFAULT_ROOT_DIR;
      const projects = scanProjects(rootDir).slice(0, 16);
      if (projects.length === 0) {
        await sendTelegramMessage(token, chatId, `Keine Projekte in \`${rootDir}\` gefunden.`);
        return;
      }

      const buttons = [];
      for (let i = 0; i < projects.length; i += 2) {
        const row = [{ text: `📁 ${projects[i].name}`, callback_data: `proj:${projects[i].name}` }];
        if (projects[i + 1]) {
          row.push({ text: `📁 ${projects[i + 1].name}`, callback_data: `proj:${projects[i + 1].name}` });
        }
        buttons.push(row);
      }

      await sendTelegramMessage(
        token,
        chatId,
        `📁 *Wähle dein Zielprojekt aus:*`,
        { reply_markup: { inline_keyboard: buttons } }
      );
      return;
    }

    // Command: /harness
    if (rawPrompt === '/harness') {
      const clis = loadConfig().clis || [];
      const buttons = [
        [{ text: '⚡ Auto-Route (Prioritätskette)', callback_data: 'harn:auto' }],
        [{ text: '🤝 Konsens-Modus (Dual-Agent)', callback_data: 'harn:consensus' }]
      ];
      clis.forEach(c => {
        if (c.enabled !== false && c.capabilities.telegramDispatch) {
          buttons.push([{ text: `🔹 ${c.name} (${c.command})`, callback_data: `harn:${c.name}` }]);
        }
      });

      await sendTelegramMessage(
        token,
        chatId,
        `⚡ *Wähle das Harness / KI-Modell für nachfolgende Aufgaben:*`,
        { reply_markup: { inline_keyboard: buttons } }
      );
      return;
    }

    // Command: /usage
    if (rawPrompt === '/usage') {
      const usage = await getHarnessUsage();
      let lines = ['📊 *Verbleibende Usage & Kontingente:*', ''];
      Object.values(usage).forEach(u => {
        const status = u.available ? '🟢' : '⚪';
        lines.push(`${status} *${u.name}* (\`${u.command}\`)`);
        lines.push(`   └ Fenster: ${u.contextWindow} · ${u.remaining}`);
      });
      await sendTelegramMessage(token, chatId, lines.join('\n'));
      return;
    }

    // Execute Task (via /consensus, /run <prompt> or any freeform text)
    let harnessOverride = 'auto';
    let prompt = rawPrompt;

    if (prompt.startsWith('/consensus')) {
      harnessOverride = 'consensus';
      prompt = prompt.replace(/^\/consensus\s*/i, '').trim();
      if (!prompt) {
        await sendTelegramMessage(token, chatId, "🤝 *Konsens-Modus:*\nBitte gib eine Aufgabe an, z.B.: `/consensus Schreibe eine React-Komponente mit TypeScript und Tests`");
        return;
      }
    } else {
      prompt = prompt.replace(/^\/run\s+/i, '').trim();
    }

    if (!prompt) {
      await sendTelegramMessage(token, chatId, "Bitte gib einen Prompt ein, z.B.: `/run Erstelle eine README.md`");
      return;
    }

    const td = loadTasksData();
    const projectPath = resolveWorkspaceDirectory(td.activeProject || td.rootDirectory, td.rootDirectory || DEFAULT_ROOT_DIR);
    const projectName = path.basename(projectPath);

    let startText = `⏳ *Task gestartet!*\n📁 *Projekt:* \`${projectName}\``;
    if (harnessOverride === 'consensus') {
      startText += `\n🤝 *Modus:* Konsens-Modus (Dual-Agent Kollaboration)`;
    }
    if (imagePath) {
      startText += `\n📸 *Multimodal:* Bild angehängt (\`${path.basename(imagePath)}\`)`;
    }
    startText += `\n💬 \`${prompt.slice(0, 100)}\``;

    await sendTelegramMessage(token, chatId, startText);

    // Dispatch — durch dieselbe Warteschlange wie die Oberfläche
    submitDispatch(
      {
        prompt: prompt,
        harnessOverride: harnessOverride,
        projectPath: projectPath,
        imagePath: imagePath
      },
      null, // No single ws
      async (err, taskRecord) => {
        if (err || !taskRecord) {
          await sendTelegramMessage(
            token,
            chatId,
            `❌ *Fehler beim Ausführen:*\n\`${err ? err.message : 'Unbekannter Fehler'}\``
          );
          return;
        }

        const cleanOutput = formatOutputForTelegram(taskRecord.outputHtml);
        const usage = taskRecord.usage || {};
        const exitIcon = taskRecord.exitCode === 0 ? '✅' : '⚠️';

        let msgText = `${exitIcon} *Task abgeschlossen!* (Code ${taskRecord.exitCode})\n` +
          `📁 *Projekt:* \`${taskRecord.projectName}\`\n` +
          `⚡ *Harness:* \`${taskRecord.harness}\`\n\n` +
          `💬 *Ergebnis:*\n\`\`\`\n${cleanOutput}\n\`\`\`\n\n`;

        if (usage.totalTokens) {
          msgText += `📊 *Usage:*\n` +
            `• Tokens: *${usage.totalTokens.toLocaleString()}* (${usage.promptTokens.toLocaleString()} Prompt / ${usage.outputTokens.toLocaleString()} Antwort)\n` +
            `• Verbleibend: *${usage.remainingPercent}%* (${Math.round(usage.remainingTokens / 1000)}k frei)\n` +
            `• Kosten: *${usage.cost}*`;
        }

        await sendTelegramMessage(token, chatId, msgText);
      }
    );
  } catch (err) {
    console.error("handleTelegramUpdate Error:", err);
  }
}

async function startTelegramBot() {
  const generation = ++telegramPollGeneration;
  telegramPollController?.abort();
  telegramPollController = null;
  telegramBotState.isRunning = false;
  const config = loadConfig();
  const tele = config.remote?.telegram;
  if (!tele || !tele.enabled || !tele.botToken) {
    telegramBotState.isRunning = false;
    return;
  }

  const check = await checkTelegramBotToken(tele.botToken);
  if (generation !== telegramPollGeneration) return;
  if (!check.ok) {
    telegramBotState.isRunning = false;
    telegramBotState.lastPollError = check.error;
    console.log(`Telegram Bot Token ungültig: ${check.error}`);
    return;
  }

  telegramBotState.isRunning = true;
  telegramBotState.botUsername = check.user.username;
  telegramBotState.botName = check.user.first_name;
  telegramBotState.lastPollError = null;
  console.log(`Telegram Bot aktiv: @${check.user.username} (${check.user.first_name})`);

  const controller = new AbortController();
  telegramPollController = controller;
  (async () => {
    let offset = 0;
    while (generation === telegramPollGeneration && !controller.signal.aborted) {
      try {
        const res = await fetch(`https://api.telegram.org/bot${tele.botToken}/getUpdates?offset=${offset}&timeout=25`, { signal: controller.signal });
        const data = await res.json();
        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            if (generation !== telegramPollGeneration) break;
            offset = update.update_id + 1;
            await handleTelegramUpdate(update, tele.botToken);
          }
        }
      } catch (err) {
        if (controller.signal.aborted) break;
        telegramBotState.lastPollError = err.message;
        await new Promise(r => setTimeout(r, 4000));
      }
    }
    if (generation === telegramPollGeneration) telegramBotState.isRunning = false;
  })().catch((err) => {
    if (generation === telegramPollGeneration) telegramBotState.lastPollError = err.message;
  });
}

// Remote & Telegram API Endpoints
app.get('/api/remote/qr.svg', async (req, res) => {
  try {
    const lanIp = getLanIp();
    const url = `http://${lanIp}:${PORT}`;
    const svg = await QRCode.toString(url, {
      type: 'svg',
      margin: 1,
      color: {
        dark: '#111827',
        light: '#ffffff'
      }
    });
    res.type('image/svg+xml').send(svg);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

app.get('/api/remote', (req, res) => {
  const config = loadConfig();
  const tele = config.remote?.telegram || { enabled: false, botToken: '', allowedUsers: [] };
  const lanIp = getLanIp();
  const tailscaleIp = getTailscaleIp();

  res.json({
    lanIp,
    port: PORT,
    lanUrl: `http://${lanIp}:${PORT}`,
    tailscaleIp,
    tailscaleUrl: tailscaleIp ? `http://${tailscaleIp}:${PORT}` : null,
    telegram: {
      enabled: Boolean(tele.enabled),
      hasToken: Boolean(tele.botToken),
      botTokenMasked: tele.botToken ? `${tele.botToken.slice(0, 6)}...${tele.botToken.slice(-4)}` : '',
      allowedUsers: tele.allowedUsers || [],
      isRunning: telegramBotState.isRunning,
      botUsername: telegramBotState.botUsername,
      botName: telegramBotState.botName,
      lastError: telegramBotState.lastPollError
    }
  });
});

app.post('/api/remote/telegram', async (req, res) => {
  try {
    const { enabled, botToken, allowedUsers } = req.body;
    const config = loadConfig();
    if (!config.remote) config.remote = {};
    if (!config.remote.telegram) config.remote.telegram = {};

    if (botToken !== undefined) {
      config.remote.telegram.botToken = botToken.trim();
    }
    if (enabled !== undefined) {
      config.remote.telegram.enabled = Boolean(enabled);
    }
    if (allowedUsers !== undefined) {
      config.remote.telegram.allowedUsers = allowedUsers;
    }

    saveConfig(config);

    // Restart bot with new settings
    await startTelegramBot();

    res.json({
      success: true,
      telegram: {
        enabled: config.remote.telegram.enabled,
        hasToken: Boolean(config.remote.telegram.botToken),
        isRunning: telegramBotState.isRunning,
        botUsername: telegramBotState.botUsername,
        botName: telegramBotState.botName,
        lastError: telegramBotState.lastPollError
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/remote/telegram/test', async (req, res) => {
  try {
    const config = loadConfig();
    const tele = config.remote?.telegram;
    if (!tele || !tele.botToken) {
      return res.status(400).json({ error: 'Kein Telegram Bot Token konfiguriert' });
    }

    const check = await checkTelegramBotToken(tele.botToken);
    if (!check.ok) {
      return res.status(400).json({ error: `Ungültiger Bot Token: ${check.error}` });
    }

    if (tele.allowedUsers && tele.allowedUsers.length > 0) {
      const targetUser = tele.allowedUsers[0];
      const sendRes = await sendTelegramMessage(
        tele.botToken,
        targetUser,
        `🔔 *CLIScade Test-Nachricht*\n\nVerbindung erfolgreich hergestellt! Dein Bot @${check.user.username} ist bereit für Befehle von unterwegs.`
      );
      if (!sendRes.ok) {
        return res.status(400).json({ error: `Nachricht an User ${targetUser} fehlgeschlagen: ${sendRes.description || 'Fehler'}` });
      }
    }

    res.json({
      success: true,
      botUsername: check.user.username,
      botName: check.user.first_name,
      message: `Bot @${check.user.username} ist online und erreichbar!`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

if (process.argv.includes('sync-skills')) {
  console.log('🔄 Synchronisiere alle Skills für alle 9 Harnesses...');
  const res = syncAllSkills();
  console.log(`✅ ${res.totalSkills} Skills inventarisiert (${res.newlyLinked} neu verlinkt).`);
  res.harnesses.forEach(h => {
    console.log(`   • ${h.name}: ${h.count} Skills aktiv in ${h.path}`);
  });
  process.exit(0);
}

// A restart kills every child process, so tasks that were mid-run would otherwise
// stay "running" in the history forever.
function reconcileOrphanedTasks() { taskStore.reconcile(); }

server.listen(PORT, HOST, () => {
  const lanHint = HOST === '0.0.0.0' ? ` (LAN: http://${getLanIp()}:${PORT})` : '';
  console.log(`CLIScade running on http://${HOST}:${PORT}${lanHint}`);
  reconcileOrphanedTasks();
  if (process.env.HARNESS_BEADS_BACKUPS !== '0') backupService.start(() => {
    const root = loadTasksData().rootDirectory;
    return scanProjects(root).filter(p => p.name !== 'Archiv').flatMap(p => beads.enabled(p.path) ? [p.path] : scanProjects(p.path).filter(c => beads.enabled(c.path)).map(c => c.path));
  });
  gatewayEnv();
  startTelegramBot().catch(err => console.error("Telegram Bot Start:", err));
});

let shuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  if (shuttingDown) return;
  shuttingDown = true;
  backupService.stop();
  for (const entry of liveRuns.values()) {
    entry.cancelled = true;
    for (const controller of entry.controllers) controller.abort();
  }
  const deadline = Date.now() + 7000;
  const timer = setInterval(() => {
    if (liveRuns.size && Date.now() < deadline) return;
    clearInterval(timer);
    taskStore.reconcile(); taskStore.close();
    process.exit(0);
  }, 100);
});
