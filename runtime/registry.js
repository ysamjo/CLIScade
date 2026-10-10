// Feste Executables und Fähigkeiten aller unterstützten Harnesses.
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
  },
  cursor_cli: {
    id: 'cursor_cli',
    name: 'Cursor CLI',
    cmd: 'agent',
    altCmd: 'cursor-agent',
    package: 'cursor-agent',
    installCmd: 'curl https://cursor.com/install -fsS | bash',
    description: 'Cursor Agent CLI für Terminal und GitHub Actions',
    category: 'Frontier Agent',
    iconKey: 'cursor_cli',
    docsUrl: 'https://cursor.com/docs/cli/overview'
  }
};

const HARNESS_DEFINITIONS = {
  claude: { installId: 'claude_code_cli', aliases: ['claude_code'], transport: 'headless', resumable: true, structuredOutput: true },
  codex: { installId: 'codex_cli', aliases: [], transport: 'headless', resumable: true, structuredOutput: true },
  cline: { installId: 'cline_cli', aliases: [], transport: 'headless', resumable: false, structuredOutput: true },
  opencode: { installId: 'opencode_cli', aliases: [], transport: 'headless', resumable: true, structuredOutput: true },
  antigravity: { installId: 'antigravity_cli', aliases: ['antigravity_cli'], transport: 'headless', resumable: false, structuredOutput: false },
  qoder: { installId: 'qoder_cli', aliases: [], transport: 'headless', resumable: false, structuredOutput: false },
  codebuddy: { installId: 'codebuddy_cli', aliases: ['cbc'], transport: 'headless', resumable: false, structuredOutput: false },
  cursor: { installId: 'cursor_cli', aliases: [], transport: 'headless', resumable: false, structuredOutput: false }
};

const HARNESS_REGISTRY = Object.freeze(Object.fromEntries(
  Object.entries(HARNESS_DEFINITIONS).map(([id, definition]) => {
    const install = CLI_INSTALL_REGISTRY[definition.installId];
    const headless = definition.transport === 'headless';
    return [id, Object.freeze({
      id, name: install.name, commands: Object.freeze([install.cmd, install.altCmd].filter(Boolean)),
      installId: definition.installId, aliases: definition.aliases,
      transport: definition.transport, dispatchable: headless, consensus: headless,
      scheduler: headless, telegramDispatch: headless, modelTest: headless,
      resumable: definition.resumable, structuredOutput: definition.structuredOutput
    })];
  })
));

function resolveHarness(route) {
  if (!route || typeof route !== 'object') return null;
  if (route.harnessId != null) return HARNESS_REGISTRY[route.harnessId] || null;
  return Object.values(HARNESS_REGISTRY).find((entry) =>
    entry.commands.includes(route.command) || entry.aliases.includes(route.command) ||
    entry.id === route.harness || entry.aliases.includes(route.harness)) || null;
}

function normalizeRoutes(routes, { strict = true } = {}) {
  if (!Array.isArray(routes)) throw new TypeError('Harness-Routen müssen eine Liste sein');
  return routes.map((route) => {
    const entry = resolveHarness(route);
    if (!entry) {
      if (!strict) return null;
      throw new Error(`Unbekanntes Harness: ${route?.harnessId || route?.command || ''}`);
    }
    const { name, model, enabled } = route;
    return {
      name: typeof name === 'string' && name.trim() ? name.trim() : entry.name,
      harnessId: entry.id,
      ...(model !== undefined ? { model } : {}),
      ...(enabled !== undefined || !entry.dispatchable ? { enabled: entry.dispatchable && enabled !== false } : {})
    };
  }).filter(Boolean);
}

function runtimeRoutes(routes) {
  return normalizeRoutes(routes, { strict: false }).map((route) => {
    const entry = HARNESS_REGISTRY[route.harnessId];
    return { ...route, command: entry.commands[0], harness: entry.id, capabilities: entry };
  });
}

module.exports = { HARNESS_REGISTRY, CLI_INSTALL_REGISTRY, resolveHarness, normalizeRoutes, runtimeRoutes };
