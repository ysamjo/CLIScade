const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execSync } = require('child_process');
const yaml = require('js-yaml');
const Convert = require('ansi-to-html');
const QRCode = require('qrcode');

const ansiConverter = new Convert({
  newline: true,
  escapeXML: true,
  stream: true,
  colors: {
    0: '#000000',
    1: '#ef4444',
    2: '#22c55e',
    3: '#eab308',
    4: '#3b82f6',
    5: '#a855f7',
    6: '#06b6d4',
    7: '#f4f4f5'
  }
});

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const STATE_DIR = path.join(process.env.HOME, '.harness-dispatch');
const CONFIG_FILE = path.join(STATE_DIR, 'config.yaml');
const AGENTS_MD_FILE = path.join(STATE_DIR, 'AGENTS.md');
const TASKS_FILE = path.join(STATE_DIR, 'studio-tasks.json');
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

// Initial studio-tasks.json
if (!fs.existsSync(TASKS_FILE)) {
  const initial = {
    rootDirectory: DEFAULT_ROOT_DIR,
    activeProject: '',
    tasks: []
  };
  fs.writeFileSync(TASKS_FILE, JSON.stringify(initial, null, 2), 'utf8');
}

const UPLOADS_DIR = path.join(STATE_DIR, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const SCHEDULES_FILE = path.join(STATE_DIR, 'schedules.json');
if (!fs.existsSync(SCHEDULES_FILE)) {
  fs.writeFileSync(SCHEDULES_FILE, '[]', 'utf8');
}

app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(UPLOADS_DIR));
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
    { id: 'fledge-alpha-free', label: 'Fledge Alpha (Free Tier)' },
    { id: 'ling-3.1-flash-free', label: 'Ling 3.1 Flash (Free Tier)' },
    { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
    { id: 'space-bunny-free', label: 'Space Bunny (Free Tier)' },
    { id: 'deepseek-ai/deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash' }
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
  freebuff: [
    { id: 'Standard', label: 'Standard (GLM 5.3 Flash)' },
    { id: 'glm-5.3-flash', label: 'GLM 5.3 Flash (Gratis & Unmetered)' },
    { id: 'stealth/space-bunny-alpha', label: 'Space Bunny Alpha' },
    { id: 'deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash' },
    { id: 'deepseek-v3', label: 'DeepSeek V3' },
    { id: 'gpt-6-luna', label: 'GPT-6 Luna' },
    { id: 'mimo-2.6-flash', label: 'MiMo 2.6 Flash' },
    { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' }
  ],
  codebuddy: [
    { id: 'Standard', label: 'Standard (hy3)' },
    { id: 'hy3', label: 'Tencent Hunyuan 3 (hy3)' },
    { id: 'deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash' },
    { id: 'deepseek-v3', label: 'DeepSeek V3' },
    { id: 'fast-model', label: 'Fast Model (Schnell)' },
    { id: 'balanced-model', label: 'Balanced Model' },
    { id: 'deep-model', label: 'Deep Model (Tiefe Analyse)' }
  ]
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

function fetchDynamicModelPresets() {
  const result = JSON.parse(JSON.stringify(DEFAULT_MODEL_PRESETS));

  // 1. OpenCode: query live models via `opencode api GET /api/model`
  try {
    const raw = execSync('opencode api GET /api/model', { encoding: 'utf8', timeout: 3500 });
    const json = JSON.parse(raw);
    const models = Array.isArray(json) ? json : (json.data || []);
    if (models.length > 0) {
      const list = [{ id: 'Standard', label: 'Standard / OpenCode Free Default' }];
      models.forEach(m => {
        const id = m.id || m.modelID;
        if (!id) return;
        const name = m.name || id;
        const prov = (m.settings && m.settings.provider) || m.providerID || '';
        list.push({ id, label: prov ? `${name} (${prov})` : name });
      });
      result.opencode = list;
    }
  } catch (e) {}

  // 2. Qoder: query live models via `qodercli --list-models`
  try {
    const raw = execSync('qodercli --list-models 2>/dev/null', { encoding: 'utf8', timeout: 3000 });
    const lines = raw.split('\n').map(l => l.trim()).filter(l => l && l !== 'MODEL' && !l.startsWith('-'));
    if (lines.length > 0) {
      const list = [{ id: 'Standard', label: 'Standard / Account Default' }];
      lines.forEach(m => {
        list.push({ id: m, label: m });
      });
      if (!lines.includes('claude-3-7-sonnet')) list.push({ id: 'claude-3-7-sonnet', label: 'Claude 3.7 Sonnet' });
      if (!lines.includes('gpt-4o')) list.push({ id: 'gpt-4o', label: 'GPT-4o' });
      result.qoder = list;
    }
  } catch (e) {}

  // 3. Claude Code / OmniRoute: query `omniroute models`
  try {
    const raw = execSync('omniroute models 2>/dev/null', { encoding: 'utf8', timeout: 3500 });
    const clean = raw.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '');
    const claudeList = [];
    const otherList = [];
    clean.split('\n').forEach(line => {
      if (!line.includes('|')) return;
      const parts = line.split('|').map(s => s.trim());
      if (parts.length >= 3 && parts[1] && parts[1] !== 'Model ID' && !parts[1].startsWith('-')) {
        const id = parts[1];
        const prov = parts[2];
        const item = { id, label: prov && prov !== '-' ? `${id} (${prov})` : id };
        if (id.toLowerCase().includes('claude')) {
          claudeList.push(item);
        } else {
          otherList.push(item);
        }
      }
    });

    if (claudeList.length > 0 || otherList.length > 0) {
      const list = [{ id: 'Standard', label: 'Standard / OmniRoute Default' }];
      result.claude_code = list.concat(claudeList).concat(otherList);
    }
  } catch (e) {}

  // 4. Cline: inspect configured model from ~/.cline/data/settings/providers.json
  try {
    const clineProvPath = path.join(os.homedir(), '.cline', 'data', 'settings', 'providers.json');
    if (fs.existsSync(clineProvPath)) {
      const pData = JSON.parse(fs.readFileSync(clineProvPath, 'utf8'));
      const activeModel = pData.providers && pData.providers.cline && pData.providers.cline.settings && pData.providers.cline.settings.model;
      if (activeModel && !result.cline.some(m => m.id === activeModel)) {
        result.cline.splice(1, 0, { id: activeModel, label: `${activeModel} (Aktiv konfiguriert)` });
      }
    }
  } catch (e) {}

  // 5. CodeBuddy: inspect configured model from ~/.codebuddy/settings.json
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

function getCliModels(forceRefresh = false) {
  const now = Date.now();
  if (!cachedModelPresets || forceRefresh || (now - modelPresetsCachedAt > 180000)) {
    cachedModelPresets = fetchDynamicModelPresets();
    modelPresetsCachedAt = now;
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
    if (!data.remote) data.remote = {};
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
  const serialized = yaml.dump(configData, { lineWidth: -1 });
  fs.writeFileSync(CONFIG_FILE, serialized, 'utf8');
}

// Helper: load tasks & workspace data
function loadTasksData() {
  try {
    return JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
  } catch {
    return { rootDirectory: DEFAULT_ROOT_DIR, activeProject: '', tasks: [] };
  }
}

function saveTasksData(data) {
  fs.writeFileSync(TASKS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Scan subdirectories of root directory
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
const CLI_INSTALL_REGISTRY = {
  claude_code_cli: {
    id: 'claude_code_cli',
    name: 'Claude Code',
    cmd: 'claude',
    package: '@anthropic-ai/claude-code',
    installCmd: 'npm install -g @anthropic-ai/claude-code',
    description: 'Offizielle Agentic Terminal-CLI von Anthropic (Sonnet 3.7 & Opus 4.6)',
    category: 'Frontier Agent',
    iconKey: 'claude_code_cli',
    docsUrl: 'https://docs.anthropic.com/claude/docs/claude-code'
  },
  codex_cli: {
    id: 'codex_cli',
    name: 'Codex CLI',
    cmd: 'codex',
    package: '@openai/codex',
    installCmd: 'npm install -g @openai/codex',
    description: 'Offizielle OpenAI Codex Coding-CLI für o3, o3-mini & GPT-4.5',
    category: 'Frontier Agent',
    iconKey: 'codex_cli',
    docsUrl: 'https://openai.com'
  },
  cline_cli: {
    id: 'cline_cli',
    name: 'Cline CLI',
    cmd: 'cline',
    package: 'cline',
    installCmd: 'npm install -g cline',
    description: 'Autonome Open-Source Coding-CLI mit Diff-Editing & Tool-Unterstützung',
    category: 'Autonomous Agent',
    iconKey: 'cline_cli',
    docsUrl: 'https://github.com/cline/cline'
  },
  opencode_cli: {
    id: 'opencode_cli',
    name: 'OpenCode',
    cmd: 'opencode',
    package: 'opencode-ai',
    installCmd: 'npm install -g opencode-ai || (curl -fsSL https://opencode.ai/install.sh | bash)',
    description: 'Open-Source KI-Coding Agent für Terminal und IDE-Workflows',
    category: 'Open Source',
    iconKey: 'opencode_cli',
    docsUrl: 'https://opencode.ai'
  },
  antigravity_cli: {
    id: 'antigravity_cli',
    name: 'Antigravity (AGY)',
    cmd: 'agy',
    package: '@google/antigravity',
    installCmd: 'npm install -g @google/antigravity || ln -sf ~/.gemini/antigravity/bin/agy ~/.local/bin/agy',
    description: 'Google Antigravity autonomous agent framework & CLI',
    category: 'DeepMind Agent',
    iconKey: 'antigravity_cli',
    docsUrl: 'https://gemini.google.com'
  },
  qoder_cli: {
    id: 'qoder_cli',
    name: 'Qoder CLI',
    cmd: 'qodercli',
    altCmd: 'qoder',
    package: '@qoder/cli',
    installCmd: 'npm install -g @qoder/cli',
    description: 'Enterprise AI Agent CLI mit Qwen 3.8 Coding Modellen',
    category: 'Enterprise Agent',
    iconKey: 'qoder_cli',
    docsUrl: 'https://qoder.ai'
  },
  freebuff_cli: {
    id: 'freebuff_cli',
    name: 'Freebuff',
    cmd: 'freebuff',
    package: 'freebuff',
    installCmd: 'npm install -g freebuff',
    description: 'Agentic Harness für Multi-Context Refactorings & Space-Bunny-Modelle',
    category: 'Specialized',
    iconKey: 'freebuff_cli',
    docsUrl: 'https://github.com/freebuff/freebuff'
  },
  codebuddy_cli: {
    id: 'codebuddy_cli',
    name: 'CodeBuddy',
    cmd: 'codebuddy',
    package: 'codebuddy-cli',
    installCmd: 'npm install -g codebuddy-cli',
    description: 'CodeBuddy CLI für DeepSeek v3/v4 & Coding Assistants',
    category: 'Specialized',
    iconKey: 'codebuddy_cli',
    docsUrl: 'https://codebuddy.ca'
  }
};

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
    const altCmd = meta.altCmd || meta.cmd;
    const p = execSync(`which ${meta.cmd} 2>/dev/null || which ${altCmd} 2>/dev/null`, { encoding: 'utf8' }).trim();
    if (p) {
      available = true;
      binaryPath = p;
      try {
        const vOut = execSync(`${meta.cmd} --version 2>/dev/null || ${altCmd} --version 2>/dev/null`, { encoding: 'utf8', timeout: 3000 }).trim();
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
    freebuff: {
      id: 'freebuff',
      name: 'Freebuff',
      command: 'freebuff',
      available: false,
      plan: 'Community Unmetered',
      contextWindow: '128.000 Tokens',
      remaining: 'Unbegrenzt (GLM 5.3 / Space Bunny)',
      cost: '$0.00',
      badge: 'Unbegrenzt'
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
    if (key === 'freebuff_cli') key = 'freebuff';
    if (key === 'codebuddy_cli') key = 'codebuddy';

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
  res.json({ health, clis: config.clis || [] });
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
      return res.json({ success: true, message: 'Alle 8 CLIs sind bereits vollständig installiert und einsatzbereit!' });
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
      executeCliInstall(
        item.id,
        (text) => broadcastToClients({ type: 'install_output', toolId: item.id, text, html: ansiConverter.toHtml(text) }),
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

  executeCliInstall(
    id,
    (text) => {
      broadcastToClients({ type: 'install_output', toolId: id, text, html: ansiConverter.toHtml(text) });
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

app.get('/api/model-presets', (req, res) => {
  const refresh = req.query.refresh === '1' || req.query.refresh === 'true';
  res.json(getCliModels(refresh));
});

app.get('/api/workspace', (req, res) => {
  const data = loadTasksData();
  const rootDir = data.rootDirectory || DEFAULT_ROOT_DIR;
  const projects = scanProjects(rootDir);
  const active = data.activeProject || (projects[0] ? projects[0].path : rootDir);
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

    if (rootDirectory && fs.existsSync(rootDirectory)) {
      data.rootDirectory = rootDirectory;
    }
    if (activeProject && fs.existsSync(activeProject)) {
      data.activeProject = activeProject;
    }

    saveTasksData(data);
    const projects = scanProjects(data.rootDirectory);
    res.json({
      rootDirectory: data.rootDirectory,
      activeProject: data.activeProject,
      projects,
      tasks: data.tasks || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/tasks', (req, res) => {
  const data = loadTasksData();
  res.json({ tasks: data.tasks || [] });
});

app.post('/api/tasks/clear', (req, res) => {
  const data = loadTasksData();
  const { projectPath } = req.body;
  if (projectPath) {
    data.tasks = data.tasks.filter(t => t.projectPath !== projectPath);
  } else {
    data.tasks = [];
  }
  saveTasksData(data);
  res.json({ success: true, tasks: data.tasks });
});

app.get('/api/config', (req, res) => {
  res.json(loadConfig());
});

app.post('/api/config', (req, res) => {
  try {
    const { clis } = req.body;
    const config = loadConfig();
    config.clis = clis;
    saveConfig(config);
    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/agents-md', (req, res) => {
  try {
    const data = loadTasksData();
    const active = req.query.project || data.activeProject;
    const globalContent = fs.existsSync(AGENTS_MD_FILE) ? fs.readFileSync(AGENTS_MD_FILE, 'utf8') : '';

    let devRootContent = '';
    const rootDir = data.rootDirectory || DEFAULT_ROOT_DIR;
    const devAgentsFile = path.join(rootDir, 'AGENTS.md');
    if (fs.existsSync(devAgentsFile)) {
      devRootContent = fs.readFileSync(devAgentsFile, 'utf8');
    }

    let projectContent = '';
    const projAgentsFile = active ? path.join(active, 'AGENTS.md') : '';
    if (projAgentsFile && fs.existsSync(projAgentsFile)) {
      projectContent = fs.readFileSync(projAgentsFile, 'utf8');
    }

    res.json({
      global: { path: AGENTS_MD_FILE, content: globalContent, exists: fs.existsSync(AGENTS_MD_FILE), size: globalContent.length },
      rootDev: { path: devAgentsFile, content: devRootContent, exists: fs.existsSync(devAgentsFile), size: devRootContent.length },
      project: { path: projAgentsFile, content: projectContent, exists: !!projectContent, size: projectContent.length }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/agents-md', (req, res) => {
  try {
    const { content, target, customPath } = req.body;
    let targetPath = AGENTS_MD_FILE;
    if (target === 'rootDev') {
      const data = loadTasksData();
      targetPath = path.join(data.rootDirectory, 'AGENTS.md');
    } else if (target === 'project' && customPath) {
      targetPath = customPath;
    }
    fs.writeFileSync(targetPath, content || '', 'utf8');
    res.json({ success: true, path: targetPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- UNIVERSAL SKILLS HUB & SYNC (Open-Agent Standard for all 8 CLIs) ---
const HARNESS_DIRS = [
  { id: 'agents', name: 'Open-Agent Standard Hub', path: path.join(os.homedir(), '.agents', 'skills') },
  { id: 'claude', name: 'Claude Code', path: path.join(os.homedir(), '.claude', 'skills') },
  { id: 'opencode', name: 'OpenCode', path: path.join(os.homedir(), '.config', 'opencode', 'skills') },
  { id: 'codex', name: 'Codex CLI', path: path.join(os.homedir(), '.codex', 'skills') },
  { id: 'cline', name: 'Cline CLI', path: path.join(os.homedir(), '.cline', 'skills') },
  { id: 'qoder', name: 'Qoder CLI', path: path.join(os.homedir(), '.qoder', 'skills') },
  { id: 'codebuddy', name: 'CodeBuddy CLI', path: path.join(os.homedir(), '.codebuddy', 'skills') },
  { id: 'gemini', name: 'Gemini / Antigravity', path: path.join(os.homedir(), '.gemini', 'antigravity', 'skills') }
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

function syncAllSkills() {
  const HUB_DIR = path.join(os.homedir(), '.agents', 'skills');
  if (!fs.existsSync(HUB_DIR)) {
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
  for (const h of HARNESS_DIRS) {
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
    const syncResult = syncAllSkills();
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
      if (!repoUrl) return res.status(400).json({ error: 'Git Repository URL erforderlich' });
      const targetName = (name || path.basename(repoUrl, '.git')).trim().replace(/[^a-zA-Z0-9_-]/g, '-');
      const targetDir = path.join(HUB_DIR, targetName);
      if (fs.existsSync(targetDir)) return res.status(400).json({ error: `Skill "${targetName}" existiert bereits` });
      execSync(`git clone --depth 1 "${repoUrl}" "${targetDir}"`, { timeout: 30000 });
    } else {
      // Create custom skill
      if (!name) return res.status(400).json({ error: 'Skill-Name ist erforderlich' });
      const safeName = name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      const targetDir = path.join(HUB_DIR, safeName);
      if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
      const skillMd = path.join(targetDir, 'SKILL.md');
      const mdContent = `---\nname: "${safeName}"\ndescription: "${(description || '').replace(/"/g, '\\"')}"\n---\n\n${content || `# ${safeName}\nSkill für alle 8 Harnesses.`}\n`;
      fs.writeFileSync(skillMd, mdContent, 'utf8');
    }

    // Automatically sync across all 8 CLIs
    const syncResult = syncAllSkills();
    res.json({ success: true, message: 'Skill erfolgreich für alle 8 CLIs installiert & synchronisiert!', sync: syncResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Image Upload endpoint
app.post('/api/upload', (req, res) => {
  try {
    const { filename, data } = req.body;
    if (!data) return res.status(400).json({ error: 'Keine Bilddaten übergeben' });

    let buffer;
    let ext = 'png';
    const matches = data.match(/^data:image\/([A-Za-z-+]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      ext = matches[1];
      buffer = Buffer.from(matches[2], 'base64');
    } else {
      buffer = Buffer.from(data, 'base64');
    }

    const safeName = `img_${Date.now()}_${(filename || `upload.${ext}`).replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filePath = path.join(UPLOADS_DIR, safeName);
    fs.writeFileSync(filePath, buffer);

    res.json({
      success: true,
      filename: safeName,
      filePath: filePath,
      url: `/uploads/${safeName}`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Schedules Management API
function loadSchedules() {
  if (!fs.existsSync(SCHEDULES_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(SCHEDULES_FILE, 'utf8'));
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
          projectPath: projectPath || schedules[idx].projectPath,
          projectName: path.basename(projectPath || schedules[idx].projectPath),
          interval: interval || schedules[idx].interval,
          intervalLabel: intervalLabels[interval] || interval,
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
        projectPath: projectPath || DEFAULT_ROOT_DIR,
        projectName: path.basename(projectPath || DEFAULT_ROOT_DIR),
        interval: interval || 'daily_02_00',
        intervalLabel: intervalLabels[interval] || interval,
        prompt: prompt || 'Führe Routine-Checks und Optimierungen durch.',
        harness: harness || 'auto',
        enabled: enabled !== undefined ? Boolean(enabled) : true,
        notifyTelegram: notifyTelegram !== undefined ? Boolean(notifyTelegram) : true,
        lastRun: null,
        lastStatus: null
      };
      schedules.unshift(newJob);
    }
    saveSchedules(schedules);
    res.json({ success: true, schedules });
  } catch (err) {
    res.status(500).json({ error: err.message });
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

// Active running process tracking
let activeProcess = null;
// WS-Zuordnung pro Task (nicht persistiert): "Abbrechen" trifft nur UI-Läufe,
// geplante Hintergrund-Jobs (ws = null) werden nie überschrieben.
const taskWsMap = new WeakMap();

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
        if (activeProcess) {
          activeProcess.kill('SIGINT');
          broadcastToClients({ type: 'output', html: '<span style="color:#ef4444">\n[Abgebrochen durch Benutzer]</span>\n' });
          activeProcess = null;
        }
        return;
      }

      if (data.type === 'cancel_install') {
        if (activeInstallProcess) {
          activeInstallProcess.kill('SIGINT');
          activeInstallProcess = null;
          broadcastToClients({ type: 'install_output', text: '\n[Installation abgebrochen]\n', html: '<span style="color:#ef4444">\n[Installation abgebrochen]</span>\n' });
        }
        return;
      }

      if (data.type === 'dispatch') {
        runDispatch(data, ws);
      }
    } catch (err) {
      if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'error', error: err.message }));
    }
  });
});

function buildCliCommand(selectedRoute, fullPrompt, effectiveModel) {
  let cmd = selectedRoute.command;
  let args = [];

  if (selectedRoute.harness === 'claude_code' || selectedRoute.command === 'claude') {
    args = ['-p', fullPrompt, '--permission-mode', 'acceptEdits'];
    if (effectiveModel && effectiveModel !== 'Standard') {
      args.push('--model', effectiveModel);
    }
  } else if (selectedRoute.command === 'cline') {
    args = ['--auto-approve', 'true'];
    if (effectiveModel && effectiveModel !== 'Standard') {
      args.push('--model', effectiveModel);
    }
    args.push(fullPrompt);
  } else if (selectedRoute.command === 'opencode') {
    args = ['run', '--auto'];
    if (effectiveModel && effectiveModel !== 'Standard') {
      args.push('--model', effectiveModel);
    }
    args.push(fullPrompt);
  } else if (selectedRoute.command === 'codex' || selectedRoute.harness === 'codex') {
    args = ['exec', '--dangerously-bypass-approvals-and-sandbox'];
    if (effectiveModel && effectiveModel !== 'Standard') {
      args.push('--model', effectiveModel);
    }
    args.push(fullPrompt);
  } else if (selectedRoute.command === 'agy' || selectedRoute.harness === 'antigravity_cli') {
    args = ['--print', fullPrompt, '--dangerously-skip-permissions'];
    if (effectiveModel && effectiveModel !== 'Standard') {
      args.push('--model', effectiveModel);
    }
  } else if (selectedRoute.command === 'qodercli' || selectedRoute.command === 'qoder' || selectedRoute.harness === 'qoder') {
    try {
      execSync('which qodercli', { stdio: 'ignore' });
      cmd = 'qodercli';
    } catch {
      cmd = 'qoder';
    }
    args = ['-p', fullPrompt, '--dangerously-skip-permissions'];
    if (effectiveModel && effectiveModel !== 'Standard') {
      args.push('-m', effectiveModel);
    }
  } else if (selectedRoute.command === 'freebuff' || selectedRoute.harness === 'freebuff') {
    cmd = 'freebuff';
    if (effectiveModel && effectiveModel !== 'Standard') {
      try {
        const manicodeSettingsFile = path.join(process.env.HOME, '.config', 'manicode', 'settings.json');
        if (fs.existsSync(manicodeSettingsFile)) {
          const settings = JSON.parse(fs.readFileSync(manicodeSettingsFile, 'utf8'));
          settings.freebuffModel = effectiveModel;
          fs.writeFileSync(manicodeSettingsFile, JSON.stringify(settings, null, 2), 'utf8');
        }
      } catch (err) {}
    }
    args = ['--trust-agents'];
  } else if (selectedRoute.command === 'codebuddy' || selectedRoute.command === 'cbc' || selectedRoute.harness === 'codebuddy') {
    cmd = 'codebuddy';
    args = ['-p', '-y'];
    if (effectiveModel && effectiveModel !== 'Standard') {
      args.push('--model', effectiveModel);
    }
    args.push(fullPrompt);
  } else {
    args = [fullPrompt];
  }

  return { cmd, args };
}

// Consensus Mode Dispatch (Dual-Agent Collaboration & Synthesis)
function runConsensusDispatch(payload, ws, onComplete) {
  const notify = (obj) => {
    if (ws && ws.readyState === 1) {
      try { ws.send(JSON.stringify(obj)); } catch {}
      broadcastToClients(obj, ws); // an alle anderen, Sender nicht doppelt
    } else {
      broadcastToClients(obj);
    }
  };

  const { prompt, imagePath, projectPath } = payload;
  const config = loadConfig();
  const clis = config.clis || [];
  const enabledRoutes = clis.filter(c => c.enabled !== false);

  if (enabledRoutes.length < 2) {
    notify({
      type: 'error',
      message: 'Konsens-Modus benötigt mindestens 2 aktive Harnesses in den Einstellungen.'
    });
    if (onComplete) onComplete(new Error('Zu wenige Harnesses für Konsens-Modus'), null);
    return;
  }

  const routeA = enabledRoutes[0];
  const routeB = enabledRoutes[1];
  const workingDir = projectPath && fs.existsSync(projectPath) ? projectPath : process.env.HOME;

  const taskId = 'consensus_' + Date.now();
  const taskRecord = {
    id: taskId,
    projectPath: workingDir,
    projectName: path.basename(workingDir),
    prompt: prompt,
    imagePath: imagePath || null,
    harness: `Konsens (${routeA.name} ↔ ${routeB.name})`,
    command: 'consensus',
    model: `${routeA.model || 'Standard'} ↔ ${routeB.model || 'Standard'}`,
    agentsInfo: 'Multi-Agent Konsens',
    timestamp: new Date().toISOString(),
    status: 'running',
    outputHtml: ''
  };

  const tasksData = loadTasksData();
  tasksData.tasks.unshift(taskRecord);
  saveTasksData(tasksData);
  if (ws) taskWsMap.set(taskRecord, ws);

  notify({ type: 'task_created', task: taskRecord });
  notify({
    type: 'route_selected',
    taskId: taskId,
    harness: `Konsens: ${routeA.name} ↔ ${routeB.name}`,
    harnessType: 'consensus',
    command: 'consensus',
    model: `${routeA.model || 'Standard'} & ${routeB.model || 'Standard'}`,
    workingDir: workingDir,
    agentsInfo: 'Dual-Agent Kollaboration & Synthese',
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

  // Handle image attachment
  let promptA = prompt;
  let promptB = prompt;
  if (imagePath && fs.existsSync(imagePath)) {
    try {
      const ext = path.extname(imagePath) || '.png';
      const targetLocal = path.join(workingDir, `.harness-task-image${ext}`);
      fs.copyFileSync(imagePath, targetLocal);
      const imgNotice = `\n[Beigefügtes Bild: ${path.basename(targetLocal)}]\nBitte analysiere dieses Bild und beachte es bei der Umsetzung.\n`;
      promptA += imgNotice;
      promptB += imgNotice;
    } catch {}
  }

  // Phase 1: Route A
  const p1Header = `<div class="consensus-phase phase-a"><strong>Phase 1:</strong> ${escapeHtml(routeA.name)} erarbeitet Lösungsansatz A...</div>\n`;
  taskRecord.outputHtml += p1Header;
  notify({ type: 'output', html: p1Header });

  executeSingleRun(routeA, `[Phase 1 Entwurf] ${promptA}`, workingDir, notify, taskRecord, (errA, outputA) => {
    // Phase 2: Route B
    const p2Header = `\n<div class="consensus-phase phase-b"><strong>Phase 2:</strong> ${escapeHtml(routeB.name)} erarbeitet alternativen Lösungsansatz B...</div>\n`;
    taskRecord.outputHtml += p2Header;
    notify({ type: 'output', html: p2Header });

    executeSingleRun(routeB, `[Phase 2 Alternativ-Entwurf] ${promptB}`, workingDir, notify, taskRecord, (errB, outputB) => {
      // Phase 3: Synthesis & Implementation
      const p3Header = `\n<div class="consensus-phase phase-debate"><strong>Phase 3 (Debatte & Synthese):</strong> Gemeinsame Prüfung & Erarbeitung der perfekten Konsens-Lösung...</div>\n`;
      taskRecord.outputHtml += p3Header;
      notify({ type: 'output', html: p3Header });

      const textA = (outputA || '').slice(-2500).replace(/<[^>]+>/g, '').trim();
      const textB = (outputB || '').slice(-2500).replace(/<[^>]+>/g, '').trim();

      const synthesisPrompt = `[KONSENS-SYNTHESE UND FINALE UMSETZUNG]
Benutzeraufgabe: "${prompt}"

Hier sind zwei unabhängig erarbeitete Lösungsansätze:
=== ANSATZ A (${routeA.name}) ===
${textA || '(Kein Textauszug)'}

=== ANSATZ B (${routeB.name}) ===
${textB || '(Kein Textauszug)'}

AUFGABE FÜR DIE KONSENS-SYNTHESE:
1. Vergleiche beide Ansätze kritisch: Welche Best Practices, Edge-Cases oder Syntax-Fehler wurden beachtet oder übersehen?
2. Führe die finale, perfekte und vollständige Lösung im Codebase-Projekt aus.
3. Fasse in 2-3 Sätzen zusammen, welche jeweiligen Vorteile von Ansatz A und Ansatz B in das finale Ergebnis eingeflossen sind.`;

      executeSingleRun(routeA, synthesisPrompt, workingDir, notify, taskRecord, (errFinal, outputFinal) => {
        taskRecord.status = 'completed';
        const finishBanner = `\n<div class="consensus-phase phase-done"><strong>Konsens erfolgreich erzielt!</strong> Die gemeinsame Lösung wurde im Projekt angewendet.</div>\n`;
        taskRecord.outputHtml += finishBanner;
        notify({ type: 'output', html: finishBanner });

        saveTasksData(tasksData);
        notify({
          type: 'done',
          taskId: taskId,
          exitCode: 0,
          message: 'Konsens erfolgreich abgeschlossen'
        });

        if (onComplete) onComplete(null, taskRecord);
      });
    });
  });
}

function executeSingleRun(selectedRoute, fullPrompt, workingDir, notify, taskRecord, callback) {
  let isInstalled = false;
  try {
    execSync(`which ${selectedRoute.command}`, { stdio: 'ignore' });
    isInstalled = true;
  } catch {
    isInstalled = false;
  }

  if (!isInstalled) {
    const errText = `Befehl "${selectedRoute.command}" nicht im PATH gefunden.`;
    notify({ type: 'output', html: `<span style="color:#ef4444;">[Fehler: ${errText}]</span>\n` });
    return callback(new Error(errText), '');
  }

  const { cmd, args } = buildCliCommand(selectedRoute, fullPrompt, selectedRoute.model || 'Standard');
  let collectedOutput = '';

  try {
    const child = spawn(cmd, args, {
      cwd: workingDir,
      env: { ...process.env, FORCE_COLOR: '1' }
    });
    if (taskWsMap.get(taskRecord)) activeProcess = child;

    const isFreebuff = (selectedRoute.command === 'freebuff' || selectedRoute.harness === 'freebuff');
    if (isFreebuff && child.stdin) {
      child.stdin.write(fullPrompt + '\n');
      setTimeout(() => { try { child.stdin.end(); } catch {} }, 1000);
    } else if (child.stdin) {
      child.stdin.end();
    }

    child.stdout.on('data', (data) => {
      const text = data.toString();
      collectedOutput += text;
      const html = ansiConverter.toHtml(text);
      taskRecord.outputHtml += html;
      notify({ type: 'output', raw: text, html });
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      collectedOutput += text;
      const html = `<span style="color:#f59e0b">${ansiConverter.toHtml(text)}</span>`;
      taskRecord.outputHtml += html;
      notify({ type: 'output', raw: text, html });
    });

    child.on('close', (code) => {
      if (activeProcess === child) activeProcess = null;
      callback(null, collectedOutput);
    });

    child.on('error', (err) => {
      if (activeProcess === child) activeProcess = null;
      callback(err, collectedOutput);
    });
  } catch (err) {
    callback(err, '');
  }
}

// Standard Dispatch with Automatic Forward-Routing (Priority Fallback Chain)
function runDispatch(payload, ws, onComplete) {
  const notify = (obj) => {
    if (ws && ws.readyState === 1) {
      try { ws.send(JSON.stringify(obj)); } catch {}
      broadcastToClients(obj, ws); // an alle anderen, Sender nicht doppelt
    } else {
      broadcastToClients(obj);
    }
  };

  const { prompt, harnessOverride, modelOverride, projectPath, imagePath } = payload;

  // Consensus Mode check
  if (harnessOverride === 'consensus') {
    return runConsensusDispatch(payload, ws, onComplete);
  }

  const config = loadConfig();
  const clis = config.clis || [];
  const workingDir = projectPath && fs.existsSync(projectPath) ? projectPath : process.env.HOME;

  // Determine candidate routes
  let candidateRoutes = [];
  if (harnessOverride && harnessOverride !== 'auto') {
    const specific = clis.find(c => c.name === harnessOverride);
    if (specific) candidateRoutes = [specific];
  } else {
    // Priority order: all enabled routes
    candidateRoutes = clis.filter(c => c.enabled !== false);
  }

  if (candidateRoutes.length === 0) {
    notify({
      type: 'error',
      message: 'Kein aktives Harness gefunden. Bitte im Tab "Harness & Modelle" mindestens ein Harness aktivieren.'
    });
    if (onComplete) onComplete(new Error('Kein aktives Harness gefunden'), null);
    return;
  }

  // Read Hierarchical AGENTS.md
  let agentsContext = '';
  const agentsSources = [];

  const tasksData = loadTasksData();
  const rootDir = tasksData.rootDirectory || DEFAULT_ROOT_DIR;
  const rootAgentsFile = path.join(rootDir, 'AGENTS.md');
  if (fs.existsSync(rootAgentsFile)) {
    const content = fs.readFileSync(rootAgentsFile, 'utf8').trim();
    agentsContext += `[Entwickler-Richtlinien aus ${rootAgentsFile}]\n` + content + '\n\n';
    agentsSources.push(`Developer/AGENTS.md (${Math.round(content.length / 1024 * 10) / 10} KB)`);
  }

  const projectAgentsFile = path.join(workingDir, 'AGENTS.md');
  if (fs.existsSync(projectAgentsFile) && projectAgentsFile !== rootAgentsFile) {
    const content = fs.readFileSync(projectAgentsFile, 'utf8').trim();
    agentsContext += `[Projekt-Richtlinien aus ${projectAgentsFile}]\n` + content + '\n\n';
    agentsSources.push(`${path.basename(workingDir)}/AGENTS.md (${Math.round(content.length / 1024 * 10) / 10} KB)`);
  }

  if (fs.existsSync(AGENTS_MD_FILE) && agentsSources.length === 0) {
    const content = fs.readFileSync(AGENTS_MD_FILE, 'utf8').trim();
    agentsContext += `[Globale Richtlinien]\n` + content + '\n\n';
    agentsSources.push(`Global AGENTS.md (${Math.round(content.length / 1024 * 10) / 10} KB)`);
  }

  const agentsInfo = agentsSources.length > 0 ? agentsSources.join(' + ') : 'Keine';

  let fullPrompt = prompt;
  if (agentsContext.trim()) {
    fullPrompt = `${agentsContext.trim()}\n\n[Aufgabe]\n${prompt}`;
  }

  // Handle multimodal image attachment
  if (imagePath && fs.existsSync(imagePath)) {
    try {
      const ext = path.extname(imagePath) || '.png';
      const targetLocal = path.join(workingDir, `.harness-task-image${ext}`);
      fs.copyFileSync(imagePath, targetLocal);
      fullPrompt += `\n\n[Beigefügtes Bild / Screenshot: ${path.basename(targetLocal)}]\nBitte analysiere dieses Bild und beachte es bei der Umsetzung.`;
    } catch (e) {
      console.warn("Fehler beim Kopieren des Bildes:", e);
    }
  }

  const taskId = 'task_' + Date.now();
  const initialRoute = candidateRoutes[0];
  const taskRecord = {
    id: taskId,
    projectPath: workingDir,
    projectName: path.basename(workingDir),
    prompt: prompt,
    imagePath: imagePath || null,
    harness: initialRoute.name,
    command: initialRoute.command,
    model: (modelOverride && modelOverride !== 'Standard') ? modelOverride : (initialRoute.model || 'Standard'),
    agentsInfo: agentsInfo,
    timestamp: new Date().toISOString(),
    status: 'running',
    outputHtml: ''
  };

  tasksData.tasks.unshift(taskRecord);
  saveTasksData(tasksData);
  if (ws) taskWsMap.set(taskRecord, ws);

  notify({ type: 'task_created', task: taskRecord });

  // Function to execute routes sequentially in priority chain with Smart Context Handoff (Relay)
  function tryRoute(routeIndex, relayContext = null) {
    if (routeIndex >= candidateRoutes.length) {
      const errMsg = 'Alle verfügbaren Harnesses in der Prioritätskette sind fehlgeschlagen oder nicht installiert.';
      const failBanner = `\n<div class="route-failed-banner" style="background:rgba(239,68,68,0.15); border:1px solid var(--danger); padding:10px 14px; border-radius:8px; margin-top:8px; color:#ef4444;">✕ <strong>Routing-Kette erschöpft:</strong> ${errMsg}</div>\n`;
      taskRecord.outputHtml += failBanner;
      notify({ type: 'output', raw: errMsg, html: failBanner });
      taskRecord.status = 'failed';
      saveTasksData(tasksData);
      notify({ type: 'done', taskId, exitCode: 1, message: errMsg });
      if (onComplete) onComplete(new Error(errMsg), taskRecord);
      return;
    }

    const selectedRoute = candidateRoutes[routeIndex];
    const effectiveModel = (modelOverride && modelOverride !== 'Standard')
      ? modelOverride
      : (selectedRoute.model || 'Standard');

    // Check if CLI is installed in PATH
    let isInstalled = false;
    try {
      execSync(`which ${selectedRoute.command}`, { stdio: 'ignore' });
      isInstalled = true;
    } catch {
      isInstalled = false;
    }

    if (!isInstalled) {
      const skipNotice = `\n<div class="route-fallback-banner" style="background:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.3); padding:8px 12px; border-radius:8px; margin:6px 0; color:#f59e0b; font-size:12px;"><strong>${escapeHtml(selectedRoute.name)}</strong> (<code>${escapeHtml(selectedRoute.command)}</code>) nicht im System-PATH gefunden.<br/><em>Springe automatisch zum nächsten Harness in der Prioritätskette...</em></div>\n`;
      taskRecord.outputHtml += skipNotice;
      notify({ type: 'output', raw: '', html: skipNotice });
      return tryRoute(routeIndex + 1, relayContext);
    }

    // Update taskRecord details
    taskRecord.harness = selectedRoute.name;
    taskRecord.command = selectedRoute.command;
    taskRecord.model = effectiveModel;

    notify({
      type: 'route_selected',
      taskId: taskId,
      harness: selectedRoute.name,
      harnessType: selectedRoute.harness || 'generic',
      command: selectedRoute.command,
      model: effectiveModel,
      workingDir: workingDir,
      agentsInfo: agentsInfo,
      projectPath: workingDir
    });

    const isRelay = Boolean(relayContext);
    const headerMsg = `<div class="route-banner" style="${isRelay ? 'border-left: 3px solid #f59e0b;' : ''}">
      <span class="badge ${isRelay ? 'badge-warning' : 'badge-accent'}">${isRelay ? '🔄 Kontext-Relay #' + (routeIndex + 1) : 'Priorität #' + (routeIndex + 1)}</span>
      <span><strong>Harness:</strong> ${selectedRoute.name} (${selectedRoute.command})</span>
      <span><strong>Modell:</strong> ${effectiveModel}</span>
      <span><strong>Projekt:</strong> ${path.basename(workingDir)}</span>
      <span><strong>Kontext:</strong> 📜 ${agentsInfo}</span>
    </div>\n\n`;

    taskRecord.outputHtml += headerMsg;
    notify({ type: 'output', html: headerMsg });

    // Build prompt: If relayContext is provided, wrap in structured handoff format
    let effectivePrompt = fullPrompt;
    if (relayContext) {
      effectivePrompt = `[AUTOMATISCHE KONTEXT-ÜBERGABE & NAHTLOSE FORTSETZUNG]\n` +
        `Das vorherige Harness "${relayContext.prevHarness}" (${relayContext.prevCommand}) wurde vorzeitig abgebrochen (${relayContext.reason}).\n\n` +
        `URSPRÜNGLICHER BENUTZER-AUFTRAG:\n${prompt}\n\n` +
        `STAND DER DATEIEN IM PROJEKTVERZEICHNIS:\n${relayContext.workspaceDiff}\n\n` +
        `LETZTER ZWISCHENSTAND / AUSGABE DES VORHERIGEN HARNESS:\n"""\n${relayContext.lastOutput}\n"""\n\n` +
        `DEIN AUFTRAG:\n` +
        `1. Analysiere den bisher erarbeiteten Code und die Dateien im Projekt.\n` +
        `2. Knüpfe nahtlos an den bestehenden Zwischenstand an, ohne von vorn zu beginnen.\n` +
        `3. Schließe die Aufgabe vollständig und funktionstüchtig ab.`;

      if (imagePath && fs.existsSync(imagePath)) {
        const ext = path.extname(imagePath) || '.png';
        const targetLocal = path.join(workingDir, `.harness-task-image${ext}`);
        effectivePrompt += `\n\n[Beigefügtes Bild / Screenshot: ${path.basename(targetLocal)}]\nBitte beachte auch das beigefügte Bild.`;
      }
    }

    const { cmd, args } = buildCliCommand(selectedRoute, effectivePrompt, effectiveModel);
    let currentRunRawOutput = '';

    try {
      const child = spawn(cmd, args, {
        cwd: workingDir,
        env: { ...process.env, FORCE_COLOR: '1' }
      });
      if (ws) activeProcess = child;

      const isFreebuff = (selectedRoute.command === 'freebuff' || selectedRoute.harness === 'freebuff');
      if (isFreebuff && child.stdin) {
        child.stdin.write(effectivePrompt + '\n');
        setTimeout(() => { try { child.stdin.end(); } catch {} }, 1000);
      } else if (child.stdin) {
        child.stdin.end();
      }

      child.stdout.on('data', (data) => {
        const text = data.toString();
        currentRunRawOutput += text;
        const html = ansiConverter.toHtml(text);
        taskRecord.outputHtml += html;
        notify({ type: 'output', raw: text, html });
      });

      child.stderr.on('data', (data) => {
        const text = data.toString();
        currentRunRawOutput += text;
        const html = `<span style="color:#f59e0b">${ansiConverter.toHtml(text)}</span>`;
        taskRecord.outputHtml += html;
        notify({ type: 'output', raw: text, html });
      });

      child.on('close', (code) => {
        if (activeProcess === child) activeProcess = null;

        // If failed and more routes exist, auto-fallback with SMART CONTEXT HANDOFF!
        if (code !== 0 && routeIndex + 1 < candidateRoutes.length) {
          let reason = `Fehlercode ${code}`;
          if (currentRunRawOutput.match(/429|rate\s*limit|quota|credit|insufficient|budget|overloaded/i)) {
            reason = 'Quota / Rate-Limit erreicht (429 / Guthaben erschöpft)';
          } else if (currentRunRawOutput.match(/context.*(length|window|limit|exceeded|too long)/i)) {
            reason = 'Kontextfenster-Limit überschritten';
          } else if (code === 137 || code === 143) {
            reason = 'Prozess beendet (OOM / Timeout)';
          }

          const cleanOutput = currentRunRawOutput
            .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
            .trim();
          const lastOutputSnippet = cleanOutput.length > 2500 ? '...' + cleanOutput.slice(-2500) : (cleanOutput || 'Keine Konsolenausgabe vorhanden');
          const wsDiff = getWorkspaceChanges(workingDir);

          const nextRelayContext = {
            prevHarness: selectedRoute.name,
            prevCommand: selectedRoute.command,
            exitCode: code,
            reason: reason,
            lastOutput: lastOutputSnippet,
            workspaceDiff: wsDiff
          };

          taskRecord.relayHandoffs = taskRecord.relayHandoffs || [];
          taskRecord.relayHandoffs.push({
            from: selectedRoute.name,
            to: candidateRoutes[routeIndex + 1].name,
            reason: reason,
            timestamp: new Date().toISOString()
          });

          const nextName = candidateRoutes[routeIndex + 1].name;
          const fallbackNotice = `\n<div class="route-fallback-banner" style="background:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.3); padding:10px 14px; border-radius:8px; margin:8px 0; color:#f59e0b; font-size:12px;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
              <span class="badge" style="background:#f59e0b; color:#000; font-weight:700;">🔄 Smart Context Relay</span>
              <strong>${escapeHtml(selectedRoute.name)} abgebrochen (${escapeHtml(reason)})</strong>
            </div>
            <div>Zwischenstand (${lastOutputSnippet.length} Zeichen) und Workspace-Status werden nahtlos an Priorität #${routeIndex + 2} (<strong>${escapeHtml(nextName)}</strong>) übergeben...</div>
          </div>\n`;

          taskRecord.outputHtml += fallbackNotice;
          notify({ type: 'output', raw: '', html: fallbackNotice });
          return tryRoute(routeIndex + 1, nextRelayContext);
        }

        taskRecord.status = code === 0 ? 'completed' : 'failed';
        taskRecord.exitCode = code;

        // Token Usage Calculation
        const promptChars = fullPrompt ? fullPrompt.length : 0;
        const outputChars = taskRecord.outputHtml ? taskRecord.outputHtml.length : 0;
        let promptTokens = Math.round(promptChars / 4);
        let outputTokens = Math.round(outputChars / 4);
        let totalTokens = promptTokens + outputTokens;
        let costStr = '$0.00';

        let contextMax = 200000;
        if (selectedRoute.command === 'claude' || selectedRoute.command === 'agy') {
          contextMax = 1000000;
        }

        try {
          const rawOutput = taskRecord.outputHtml || '';
          const costMatch = rawOutput.match(/total_cost_usd["']?:\s*([\d\.]+)/);
          if (costMatch) costStr = `$${parseFloat(costMatch[1]).toFixed(4)}`;
          const tokensMatch = rawOutput.match(/input_tokens["']?:\s*(\d+).*?output_tokens["']?:\s*(\d+)/s);
          if (tokensMatch) {
            promptTokens = parseInt(tokensMatch[1], 10);
            outputTokens = parseInt(tokensMatch[2], 10);
            totalTokens = promptTokens + outputTokens;
          }
        } catch {}

        const remainingTokens = Math.max(0, contextMax - totalTokens);
        const remainingPercent = Math.max(0, Math.round((remainingTokens / contextMax) * 1000) / 10);

        taskRecord.usage = {
          promptTokens,
          outputTokens,
          totalTokens,
          contextMax,
          remainingTokens,
          remainingPercent,
          cost: costStr
        };

        if (code === 0) {
          const usageBanner = `\n<div class="usage-summary-banner">
            <span class="badge badge-accent">📊 Usage</span>
            <span><strong>Tokens:</strong> ${totalTokens.toLocaleString()} (${promptTokens.toLocaleString()} Prompt / ${outputTokens.toLocaleString()} Antwort)</span>
            <span><strong>Verbleibend:</strong> ${remainingPercent}% (${Math.round(remainingTokens / 1000).toLocaleString()}k frei)</span>
            <span><strong>Kosten:</strong> ${costStr}</span>
          </div>\n`;
          taskRecord.outputHtml += usageBanner;
          notify({ type: 'output', raw: '', html: usageBanner });
        }

        // Save
        const td = loadTasksData();
        const idx = td.tasks.findIndex(t => t.id === taskId);
        if (idx !== -1) {
          td.tasks[idx] = taskRecord;
          saveTasksData(td);
        }

        notify({
          type: 'done',
          taskId: taskId,
          exitCode: code,
          usage: taskRecord.usage,
          message: code === 0 ? 'Erfolgreich abgeschlossen' : `Beendet mit Code ${code}`
        });

        if (onComplete) onComplete(null, taskRecord);
      });

      child.on('error', (err) => {
        if (activeProcess === child) activeProcess = null;
        if (routeIndex + 1 < candidateRoutes.length) {
          const nextRelayContext = {
            prevHarness: selectedRoute.name,
            prevCommand: selectedRoute.command,
            exitCode: -1,
            reason: `Startfehler: ${err.message}`,
            lastOutput: `Konnte ${selectedRoute.command} nicht starten: ${err.message}`,
            workspaceDiff: getWorkspaceChanges(workingDir)
          };
          const nextName = candidateRoutes[routeIndex + 1].name;
          const fallbackNotice = `\n<div class="route-fallback-banner" style="background:rgba(245,158,11,0.12); border:1px solid rgba(245,158,11,0.3); padding:10px 14px; border-radius:8px; margin:6px 0; color:#f59e0b; font-size:12px;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
              <span class="badge" style="background:#f59e0b; color:#000; font-weight:700;">🔄 Smart Relay</span>
              <strong>Fehler beim Starten von ${escapeHtml(selectedRoute.name)}: ${escapeHtml(err.message)}</strong>
            </div>
            <div>Übergebe an <strong>${escapeHtml(nextName)}</strong>...</div>
          </div>\n`;
          taskRecord.outputHtml += fallbackNotice;
          notify({ type: 'output', raw: '', html: fallbackNotice });
          return tryRoute(routeIndex + 1, nextRelayContext);
        }

        taskRecord.status = 'error';
        taskRecord.errorMessage = err.message;
        notify({
          type: 'error',
          taskId: taskId,
          message: `Fehler beim Ausführen von ${cmd}: ${err.message}`
        });
        if (onComplete) onComplete(err, taskRecord);
      });
    } catch (err) {
      if (routeIndex + 1 < candidateRoutes.length) {
        return tryRoute(routeIndex + 1, relayContext);
      }
      notify({ type: 'error', message: err.message });
      if (onComplete) onComplete(err, null);
    }
  }

  // Start with first route in priority order
  tryRoute(0);
}

// Background Scheduler Execution Engine
function isJobDue(job, now) {
  if (!job.lastRun) return true;
  const last = new Date(job.lastRun).getTime();
  const current = now.getTime();
  const diffMinutes = (current - last) / (1000 * 60);

  switch (job.interval) {
    case 'every_15_mins':
      return diffMinutes >= 15;
    case 'hourly':
      return diffMinutes >= 60;
    case 'every_6_hours':
      return diffMinutes >= 360;
    case 'daily_02_00':
      return now.getHours() === 2 && (now.toDateString() !== new Date(last).toDateString());
    case 'daily_08_00':
      return now.getHours() === 8 && (now.toDateString() !== new Date(last).toDateString());
    case 'weekly_monday':
      return now.getDay() === 1 && now.getHours() === 8 && (now.toDateString() !== new Date(last).toDateString());
    default:
      return diffMinutes >= 60;
  }
}

function runScheduledJob(job) {
  console.log(`[Scheduler] Führe geplanten Job aus: "${job.name}" im Projekt "${job.projectPath}"`);
  job.lastRun = new Date().toISOString();
  job.lastStatus = 'running';
  saveSchedules(loadSchedules().map(s => s.id === job.id ? job : s));

  runDispatch(
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
            lastStatus: err ? 'failed' : 'completed',
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
      runScheduledJob(job);
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

let telegramPollingActive = false;

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

      if (allowed.length > 0 && !allowed.includes(userId)) {
        await sendTelegramAnswerCallback(token, cb.id, "Nicht autorisiert!");
        return;
      }

      if (data.startsWith('proj:')) {
        const targetProj = data.slice(5);
        const td = loadTasksData();
        const rootDir = td.rootDirectory || DEFAULT_ROOT_DIR;
        const targetPath = path.join(rootDir, targetProj);
        if (fs.existsSync(targetPath)) {
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

    // Auto-pair on first interaction if no allowed users set
    if (allowed.length === 0) {
      if (!config.remote) config.remote = {};
      if (!config.remote.telegram) config.remote.telegram = {};
      config.remote.telegram.allowedUsers = [userId];
      saveConfig(config);
      await sendTelegramMessage(
        token,
        chatId,
        `🎉 *Erfolgreich gekoppelt!*\nDein Telegram-Account (@${username}, ID \`${userId}\`) wurde als autorisierter Admin registriert. Alle Befehle werden nun ausgeführt.`
      );
    } else if (!allowed.includes(userId)) {
      await sendTelegramMessage(
        token,
        chatId,
        `⛔ *Zugriff verweigert!*\nDieser Bot ist exklusiv an das persönliche Harness Studio auf dem Mac gekoppelt (User-ID \`${userId}\` nicht freigeschaltet).`
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
        `⚡ *Harness Studio Remote Bot*\n` +
        `Verbunden mit deinem Mac!\n\n` +
        `📁 *Aktives Projekt:* \`${currentProj}\`\n\n` +
        `*Befehle von unterwegs:*\n` +
        `• \`/status\` – Status, Pfade & Kontingente\n` +
        `• \`/projects\` – Projekt auswählen (Buttons)\n` +
        `• \`/harness\` – KI-Modell / CLI auswählen\n` +
        `• \`/usage\` – Kontingente aller 8 CLIs\n` +
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
      const clis = (loadConfig().clis || []).filter(c => c.enabled !== false);
      const readyClis = clis.map(c => `• ${c.name} (\`${c.command}\`)`).join('\n') || 'Keine CLIs aktiv';

      await sendTelegramMessage(
        token,
        chatId,
        `📊 *Harness Studio Status:*\n\n` +
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
        if (c.enabled !== false) {
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
    const projectPath = td.activeProject || td.rootDirectory || DEFAULT_ROOT_DIR;
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

    // Dispatch
    runDispatch(
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
  const config = loadConfig();
  const tele = config.remote?.telegram;
  if (!tele || !tele.enabled || !tele.botToken) {
    telegramBotState.isRunning = false;
    return;
  }

  const check = await checkTelegramBotToken(tele.botToken);
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

  if (telegramPollingActive) return;
  telegramPollingActive = true;

  let offset = 0;
  while (telegramBotState.isRunning) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${tele.botToken}/getUpdates?offset=${offset}&timeout=25`);
      const data = await res.json();
      if (data.ok && Array.isArray(data.result)) {
        for (const update of data.result) {
          offset = update.update_id + 1;
          await handleTelegramUpdate(update, tele.botToken);
        }
      }
    } catch (err) {
      if (!telegramBotState.isRunning) break;
      await new Promise(r => setTimeout(r, 4000));
    }
  }
  telegramPollingActive = false;
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
        `🔔 *Harness Studio Test-Nachricht*\n\nVerbindung erfolgreich hergestellt! Dein Bot @${check.user.username} ist bereit für Befehle von unterwegs.`
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
  console.log('🔄 Synchronisiere alle Skills für alle 8 Harnesses...');
  const res = syncAllSkills();
  console.log(`✅ ${res.totalSkills} Skills inventarisiert (${res.newlyLinked} neu verlinkt).`);
  res.harnesses.forEach(h => {
    console.log(`   • ${h.name}: ${h.count} Skills aktiv in ${h.path}`);
  });
  process.exit(0);
}

server.listen(PORT, '0.0.0.0', () => {
  const lanIp = getLanIp();
  console.log(`Harness Studio running on http://0.0.0.0:${PORT} (LAN: http://${lanIp}:${PORT})`);
  startTelegramBot().catch(err => console.error("Telegram Bot Start:", err));
});
