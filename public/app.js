// State
let state = {
  rootDirectory: '',
  projects: [],
  activeProject: '',
  tasks: [],
  activeTaskId: null,
  clis: [],
  health: [],
  modelPresets: {},
  modelTests: {},
  expandedProjects: new Set(),
  activeAgentsTab: 'rootDev',
  agentsData: null,
  usageData: null,
  ws: null,
  isRunning: false,
  attachedImage: null,
  schedules: [],
  installerTools: [],
  installingTools: new Set(),
  isInstallingAll: false
};

// DOM Elements
const dom = {
  // Navigation / Quick triggers
  openSettingsBtn: document.getElementById('open-settings-btn'),
  topOpenSettingsBtn: document.getElementById('top-open-settings-btn'),
  sidebarQuickSettingsBtn: document.getElementById('sidebar-quick-settings-btn'),

  // Root Directory & Tree
  rootDirDisplay: document.getElementById('root-dir-display'),
  rootDirText: document.getElementById('root-dir-text'),
  rootAgentsBadge: document.getElementById('root-agents-badge'),
  rootAgentsText: document.getElementById('root-agents-text'),
  refreshTreeBtn: document.getElementById('refresh-tree-btn'),
  projectTree: document.getElementById('project-tree'),
  projectsCountBadge: document.getElementById('projects-count-badge'),

  // Top Bar
  currentProjectName: document.getElementById('current-project-name'),
  currentProjectPath: document.getElementById('current-project-path'),
  newTaskTopBtn: document.getElementById('new-task-top-btn'),
  connectionStatus: document.getElementById('connection-status'),

  // Studio & Terminal
  activeRoutingCard: document.getElementById('active-routing-card'),
  routeHarnessTitle: document.getElementById('route-harness-title'),
  routeModelTitle: document.getElementById('route-model-title'),
  routeAgentsBadge: document.getElementById('route-agents-badge'),
  cancelRunBtn: document.getElementById('cancel-run-btn'),
  terminalSessionTitle: document.getElementById('terminal-session-title'),
  terminalBody: document.getElementById('terminal-body'),
  clearTerminalBtn: document.getElementById('clear-terminal-btn'),
  copyTerminalBtn: document.getElementById('copy-terminal-btn'),
  harnessOverride: document.getElementById('harness-override'),
  promptTargetFolder: document.getElementById('prompt-target-folder'),
  agentsContextPill: document.getElementById('agents-context-pill'),
  agentsContextText: document.getElementById('agents-context-text'),
  promptInput: document.getElementById('prompt-input'),
  sendPromptBtn: document.getElementById('send-prompt-btn'),

  // Settings Modal Dialog
  settingsModal: document.getElementById('settings-modal'),
  closeSettingsModalBtn: document.getElementById('close-settings-modal-btn'),
  closeSettingsFooterBtn: document.getElementById('close-settings-footer-btn'),
  settingsNavItems: document.querySelectorAll('.settings-nav-item'),
  settingsSections: document.querySelectorAll('.settings-section'),

  // Workspace Settings
  settingsRootInput: document.getElementById('settings-root-input'),
  settingsSaveRootBtn: document.getElementById('settings-save-root-btn'),
  settingsRootFeedback: document.getElementById('settings-root-feedback'),
  quickPathDevBtn: document.getElementById('quick-path-dev-btn'),
  quickPathHomeBtn: document.getElementById('quick-path-home-btn'),
  statRootPath: document.getElementById('stat-root-path'),
  statProjectsCount: document.getElementById('stat-projects-count'),
  statActiveProject: document.getElementById('stat-active-project'),

  // Harness Settings
  refreshModelsBtn: document.getElementById('refresh-models-btn'),
  modelsRefreshBanner: document.getElementById('models-refresh-banner'),
  modelsRefreshText: document.getElementById('models-refresh-text'),
  addRouteBtn: document.getElementById('add-route-btn'),
  harnessConfigList: document.getElementById('harness-config-list'),
  saveSettingsBtn: document.getElementById('save-settings-btn'),
  settingsSaveFeedback: document.getElementById('settings-save-feedback'),

  // AGENTS.md Settings
  agentsTabBtns: document.querySelectorAll('.agents-tab-btn'),
  editorFilePathDisplay: document.getElementById('editor-file-path-display'),
  agentsMdEditor: document.getElementById('agents-md-editor'),
  saveAgentsBtn: document.getElementById('save-agents-btn'),
  agentsSaveFeedback: document.getElementById('agents-save-feedback'),

  // Skills
  skillsGrid: document.getElementById('skills-grid'),
  syncSkillsBtn: document.getElementById('sync-skills-btn'),
  openInstallSkillBtn: document.getElementById('open-install-skill-btn'),
  skillsSyncBanner: document.getElementById('skills-sync-banner'),
  skillsSyncText: document.getElementById('skills-sync-text'),
  closeSkillsSyncBannerBtn: document.getElementById('close-skills-sync-banner-btn'),
  skillsSearchInput: document.getElementById('skills-search-input'),
  skillsStatusBadge: document.getElementById('skills-status-badge'),
  installSkillModal: document.getElementById('install-skill-modal'),
  closeInstallSkillBtn: document.getElementById('close-install-skill-btn'),
  cancelInstallSkillBtn: document.getElementById('cancel-install-skill-btn'),
  confirmInstallSkillBtn: document.getElementById('confirm-install-skill-btn'),
  skillTabGit: document.getElementById('skill-tab-git'),
  skillTabCustom: document.getElementById('skill-tab-custom'),
  skillFormGit: document.getElementById('skill-form-git'),
  skillFormCustom: document.getElementById('skill-form-custom'),
  skillGitUrl: document.getElementById('skill-git-url'),
  skillGitName: document.getElementById('skill-git-name'),
  skillCustomName: document.getElementById('skill-custom-name'),
  skillCustomDesc: document.getElementById('skill-custom-desc'),
  skillCustomContent: document.getElementById('skill-custom-content'),
  skillInstallFeedback: document.getElementById('skill-install-feedback'),

  // Diagnostics & Status
  diagnosticsTableBody: document.getElementById('diagnostics-table-body'),
  harnessStatusPills: document.getElementById('harness-status-pills'),

  // Add Route Modal
  addRouteModal: document.getElementById('add-route-modal'),
  closeRouteModalBtn: document.getElementById('close-route-modal-btn'),
  newRouteHarness: document.getElementById('new-route-harness'),
  newRouteModel: document.getElementById('new-route-model'),
  newRouteName: document.getElementById('new-route-name'),
  confirmAddRouteBtn: document.getElementById('confirm-add-route-btn'),

  // Usage & Quota & Telemetry
  topUsageBtn: document.getElementById('top-usage-btn'),
  topUsageBadge: document.getElementById('top-usage-badge'),
  routeUsagePill: document.getElementById('route-usage-pill'),
  routeUsageText: document.getElementById('route-usage-text'),
  usageTableBody: document.getElementById('usage-table-body'),
  refreshUsageBtn: document.getElementById('refresh-usage-btn'),
  statOmniCost: document.getElementById('stat-omni-cost'),
  statOmniTokens: document.getElementById('stat-omni-tokens'),
  statOpencodeTokens: document.getElementById('stat-opencode-tokens'),
  omnirouteProvidersList: document.getElementById('omniroute-providers-list'),
  opencodeModelsList: document.getElementById('opencode-models-list'),

  // Mobile & Remote
  sidebar: document.getElementById('sidebar'),
  mobileSidebarToggle: document.getElementById('mobile-sidebar-toggle'),
  mobileDrawerOverlay: document.getElementById('mobile-drawer-overlay'),
  voiceInputBtn: document.getElementById('voice-input-btn'),
  remoteQrCode: document.getElementById('remote-qr-code'),
  remoteLanUrl: document.getElementById('remote-lan-url'),
  copyLanUrlBtn: document.getElementById('copy-lan-url-btn'),
  tailscaleStatusBadge: document.getElementById('tailscale-status-badge'),
  tailscaleUrlPreview: document.getElementById('tailscale-url-preview'),
  telegramBotBadge: document.getElementById('telegram-bot-badge'),
  telegramBotEnable: document.getElementById('telegram-bot-enable'),
  telegramTokenInput: document.getElementById('telegram-token-input'),
  telegramUserInput: document.getElementById('telegram-user-input'),
  saveTelegramBtn: document.getElementById('save-telegram-btn'),
  testTelegramBtn: document.getElementById('test-telegram-btn'),
  telegramFeedback: document.getElementById('telegram-feedback'),

  // Multimodal Image Attachment
  imageUploadInput: document.getElementById('image-upload-input'),
  imageUploadBtn: document.getElementById('image-upload-btn'),
  imagePreviewTray: document.getElementById('image-preview-tray'),
  previewThumbnail: document.getElementById('preview-thumbnail'),
  previewFilename: document.getElementById('preview-filename'),
  removeImageBtn: document.getElementById('remove-image-btn'),

  // Schedules (Cron)
  schedNameInput: document.getElementById('sched-name-input'),
  schedProjectSelect: document.getElementById('sched-project-select'),
  schedIntervalSelect: document.getElementById('sched-interval-select'),
  schedHarnessSelect: document.getElementById('sched-harness-select'),
  schedPromptInput: document.getElementById('sched-prompt-input'),
  schedTelegramNotify: document.getElementById('sched-telegram-notify'),
  addScheduleBtn: document.getElementById('add-schedule-btn'),
  refreshSchedulesBtn: document.getElementById('refresh-schedules-btn'),
  schedulesTableBody: document.getElementById('schedules-table-body'),

  // 1-Click Installer Modal
  openInstallerBtn: document.getElementById('open-installer-btn'),
  settingsOpenInstallerBtn: document.getElementById('settings-open-installer-btn'),
  installerBadgeCount: document.getElementById('installer-badge-count'),
  installerModal: document.getElementById('installer-modal'),
  closeInstallerModalBtn: document.getElementById('close-installer-modal-btn'),
  closeInstallerFooterBtn: document.getElementById('close-installer-footer-btn'),
  installAllMissingBtn: document.getElementById('install-all-missing-btn'),
  refreshInstallerStatusBtn: document.getElementById('refresh-installer-status-btn'),
  summaryInstalledCount: document.getElementById('summary-installed-count'),
  summaryMissingCount: document.getElementById('summary-missing-count'),
  summaryPillInstalled: document.getElementById('summary-pill-installed'),
  summaryPillMissing: document.getElementById('summary-pill-missing'),
  installerConsoleWrapper: document.getElementById('installer-console-wrapper'),
  installerConsoleTitle: document.getElementById('installer-console-title'),
  installerConsoleBody: document.getElementById('installer-console-body'),
  clearInstallerConsoleBtn: document.getElementById('clear-installer-console-btn'),
  hideInstallerConsoleBtn: document.getElementById('hide-installer-console-btn'),
  installerCardsGrid: document.getElementById('installer-cards-grid')
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
  hydrateIcons();
  // Re-hydrate nur neue Knoten (nicht bei jedem Terminal-Chunk das ganze Dokument)
  const iconObserver = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        if (node.hasAttribute && node.hasAttribute('data-icon')) hydrateIcons(node.parentNode || node);
        hydrateIcons(node);
      });
    }
  });
  iconObserver.observe(document.body, { childList: true, subtree: true });
  setupWebSocket();
  setupEventListeners();

  // Load workspace immediately so projects appear in < 30ms!
  loadWorkspace();
  loadModelPresets();
  loadStatus();
  loadAgentsMd();
  loadSkills();
  loadUsage();
  loadRemoteConfig();
  loadSchedules();
  loadInstallerStatus();
});

// --- SETTINGS MODAL CONTROLS ---
function openSettingsModal(section = 'workspace') {
  if (dom.sidebar) dom.sidebar.classList.remove('open');
  if (dom.mobileDrawerOverlay) dom.mobileDrawerOverlay.classList.remove('active');
  if (!dom.settingsModal) return;
  dom.settingsModal.classList.remove('hidden');
  switchSettingsSection(section);
}

function closeSettingsModal() {
  if (!dom.settingsModal) return;
  dom.settingsModal.classList.add('hidden');
}

function switchSettingsSection(sectionId) {
  dom.settingsNavItems.forEach(item => {
    item.classList.toggle('active', item.dataset.section === sectionId);
  });

  dom.settingsSections.forEach(sec => {
    sec.classList.toggle('active', sec.id === `settings-sec-${sectionId}`);
  });

  if (sectionId === 'workspace') {
    if (dom.settingsRootInput) {
      dom.settingsRootInput.value = state.rootDirectory || '';
    }
  } else if (sectionId === 'harnesses') {
    renderHarnessConfigList();
    refreshHarnessModelsOnTabOpen();
  } else if (sectionId === 'agents') {
    renderAgentsEditor();
  } else if (sectionId === 'diagnostics') {
    renderDiagnosticsTable();
  } else if (sectionId === 'usage') {
    renderUsageUI();
  } else if (sectionId === 'remote') {
    loadRemoteConfig();
  } else if (sectionId === 'schedules') {
    loadSchedules();
  } else if (sectionId === 'skills') {
    loadSkills();
  }
}

function renderDiagnosticsTable() {
  if (!dom.diagnosticsTableBody) return;
  dom.diagnosticsTableBody.innerHTML = '';

  state.health.forEach(h => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${escapeHtml(h.name)}</strong></td>
      <td><code>${escapeHtml(h.cmd)}</code></td>
      <td>
        <span class="diagnostics-status-badge ${h.available ? 'online' : 'offline'}">
          <span class="dot"></span> ${h.available ? 'Bereit' : 'Nicht gefunden'}
        </span>
      </td>
      <td style="color:var(--text-muted); font-size:11px;">
        ${h.available ? (escapeHtml(h.path || '') + (h.version ? ` (${escapeHtml(h.version)})` : '')) : 'Binary nicht im Pfad gefunden'}
      </td>
      <td style="text-align:right;">
        <button class="btn btn-secondary-sm" onclick="openInstallerModal('${h.id}')" style="padding:4px 9px; font-size:11px; white-space:nowrap;">
          ${h.available ? 'Neu installieren' : '1-Klick Install'}
        </button>
      </td>
    `;
    dom.diagnosticsTableBody.appendChild(tr);
  });
}

function switchTab(tabId) {
  // Backward compatibility
  if (tabId !== 'studio') {
    const sectionMap = {
      settings: 'harnesses',
      agents: 'agents',
      skills: 'skills'
    };
    openSettingsModal(sectionMap[tabId] || 'workspace');
  }
}

// --- WEBSOCKET CONNECTION ---
function setupWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  state.ws = new WebSocket(wsUrl);

  state.ws.onopen = () => {
    dom.connectionStatus.textContent = 'Verbunden';
    dom.connectionStatus.className = 'status-indicator connected';
  };

  state.ws.onclose = () => {
    dom.connectionStatus.textContent = 'Getrennt (neu verbinden...)';
    dom.connectionStatus.className = 'status-indicator';
    setTimeout(setupWebSocket, 2000);
  };

  state.ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'task_created') {
      state.activeTaskId = data.task.id;
      // Prepend task to task list if not exists
      const existingIdx = state.tasks.findIndex(t => t.id === data.task.id);
      if (existingIdx === -1) {
        state.tasks.unshift(data.task);
      } else {
        state.tasks[existingIdx] = data.task;
      }
      renderProjectTree();
    } else if (data.type === 'route_selected') {
      dom.activeRoutingCard.classList.remove('hidden');
      dom.routeHarnessTitle.textContent = `Ausführung mit: ${data.harness} (${data.command})`;
      dom.routeModelTitle.textContent = data.model || 'Standard';
      if (dom.routeAgentsBadge) {
        dom.routeAgentsBadge.textContent = (data.agentsInfo || 'AGENTS.md aktiv');
      }
      state.isRunning = true;
      dom.sendPromptBtn.disabled = true;
      dom.sendPromptBtn.innerHTML = '<span>Läuft…</span>';
      if (dom.imageUploadBtn) dom.imageUploadBtn.disabled = true;
      if (dom.voiceInputBtn) dom.voiceInputBtn.disabled = true;
      dom.terminalSessionTitle.textContent = `Live: ${data.harness} [${data.model || 'Standard'}]`;
    } else if (data.type === 'output') {
      appendTerminalOutput(data.html || data.raw);
      // Also append to active task in state
      if (state.activeTaskId) {
        const task = state.tasks.find(t => t.id === state.activeTaskId);
        if (task) {
          task.outputHtml = (task.outputHtml || '') + (data.html || data.raw);
        }
      }
    } else if (data.type === 'done' || data.type === 'error') {
      state.isRunning = false;
      dom.sendPromptBtn.disabled = false;
      dom.sendPromptBtn.innerHTML = `<span>Ausführen</span> ${typeof icon === 'function' ? icon('send') : ''}`;
      if (dom.imageUploadBtn) dom.imageUploadBtn.disabled = false;
      if (dom.voiceInputBtn) dom.voiceInputBtn.disabled = false;
      dom.activeRoutingCard.classList.add('hidden');

      if (state.activeTaskId) {
        const task = state.tasks.find(t => t.id === state.activeTaskId);
        if (task) {
          task.status = data.type === 'done' ? 'completed' : 'error';
          if (data.usage) {
            task.usage = data.usage;
          }
        }
        renderProjectTree();
      }
      loadUsage();

      if (data.message) {
        const color = data.type === 'error' ? '#ef4444' : '#10b981';
        appendTerminalOutput(`\n<div style="color:${color}; font-weight:bold; margin-top:10px;">[${escapeHtml(data.message)}]</div>\n`);
      }
    } else if (data.type === 'install_start') {
      state.installingTools.add(data.toolId);
      if (dom.installerConsoleWrapper) dom.installerConsoleWrapper.classList.remove('hidden');
      if (dom.installerConsoleTitle) dom.installerConsoleTitle.textContent = `Installation: ${data.name || data.toolId}`;
      appendInstallerConsoleOutput(`\n----------------------------------------\n[Start] Installation von ${data.name || data.toolId}...\n----------------------------------------\n`);
      renderInstallerCards(state.installerTools);
    } else if (data.type === 'install_output') {
      if (dom.installerConsoleWrapper) dom.installerConsoleWrapper.classList.remove('hidden');
      if (data.html) {
        appendInstallerConsoleOutput(data.html, true);
      } else {
        appendInstallerConsoleOutput(data.text || '');
      }
    } else if (data.type === 'install_done') {
      state.installingTools.delete(data.toolId);
      if (data.err) {
        appendInstallerConsoleOutput(`\n[Fehler] Installation beendet mit Fehler: ${data.err}\n`);
      } else {
        appendInstallerConsoleOutput(`\n[Erfolg] ${data.toolId} erfolgreich bereitgestellt!\n`);
      }
      loadInstallerStatus();
    } else if (data.type === 'install_all_done') {
      state.isInstallingAll = false;
      state.installingTools.clear();
      appendInstallerConsoleOutput(`\n========================================\n[Fertig] ${data.message || 'Alle Installationen abgeschlossen!'}\n========================================\n`);
      loadInstallerStatus(true);
    }
  };
}

// --- TERMINAL HELPERS & REASONING FORMATTER ---
let streamBuffer = '';

function formatReasoningAndOutput(html) {
  if (!html) return '';

  // 1. Explicit closed think tags (both raw <think> and escaped &lt;think&gt;)
  const explicitThinkRegex = /(?:<think>|&lt;think&gt;)([\s\S]*?)(?:<\/think>|&lt;\/think&gt;)/gi;
  if (explicitThinkRegex.test(html)) {
    return html.replace(explicitThinkRegex, (match, thinkText) => {
      const clean = thinkText.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").trim();
      return '<details class="reasoning-drawer" open>' +
        '<summary class="reasoning-summary">' +
          '<div class="reasoning-summary-left">' +
            '<span class="reasoning-icon">🧠</span>' +
            '<span class="reasoning-label">Gedankengang (Reasoning)</span>' +
            '<span class="reasoning-pill">Denkprozess</span>' +
          '</div>' +
          '<span class="reasoning-hint">Klicken zum Einklappen</span>' +
        '</summary>' +
        '<div class="reasoning-content">' + clean + '</div>' +
      '</details>';
    });
  }

  // 2. Open think tag (check if followed by double line break separating reasoning from final output)
  const openThinkMatch = html.match(/(?:<think>|&lt;think&gt;)([\s\S]*)$/i);
  if (openThinkMatch) {
    const before = html.substring(0, openThinkMatch.index);
    const allAfter = openThinkMatch[1];
    const splitMatch = allAfter.match(/(?:<br\s*\/?>\s*){2,}|\n\s*\n/i);
    if (splitMatch) {
      const thought = allAfter.substring(0, splitMatch.index).replace(/&quot;/g, '"').replace(/&#x27;/g, "'").trim();
      const answer = allAfter.substring(splitMatch.index + splitMatch[0].length).trim();
      return before +
        '<details class="reasoning-drawer" open>' +
          '<summary class="reasoning-summary">' +
            '<div class="reasoning-summary-left">' +
              '<span class="reasoning-icon">🧠</span>' +
              '<span class="reasoning-label">Gedankengang (Reasoning)</span>' +
              '<span class="reasoning-pill">Denkprozess</span>' +
            '</div>' +
            '<span class="reasoning-hint">Klicken zum Einklappen</span>' +
          '</summary>' +
          '<div class="reasoning-content">' + thought + '</div>' +
        '</details>' +
        '<div class="model-output-block">' + answer + '</div>';
    } else {
      // Actively streaming live thinking
      return before +
        '<details class="reasoning-drawer is-streaming" open>' +
          '<summary class="reasoning-summary">' +
            '<div class="reasoning-summary-left">' +
              '<span class="reasoning-icon pulse-brain">🧠</span>' +
              '<span class="reasoning-label">Gedankengang (Reasoning)...</span>' +
              '<span class="reasoning-pill streaming-pill">Denkt nach...</span>' +
            '</div>' +
            '<span class="reasoning-hint">Live</span>' +
          '</summary>' +
          '<div class="reasoning-content">' + allAfter + '</div>' +
        '</details>';
    }
  }

  return html;
}

function appendTerminalOutput(htmlContent) {
  const placeholder = dom.terminalBody.querySelector('.terminal-placeholder');
  if (placeholder) placeholder.remove();

  streamBuffer += htmlContent;
  dom.terminalBody.innerHTML = formatReasoningAndOutput(streamBuffer);
  dom.terminalBody.scrollTop = dom.terminalBody.scrollHeight;
}

function setTerminalContent(htmlContent, title) {
  streamBuffer = htmlContent || '';
  if (title) {
    dom.terminalSessionTitle.textContent = title;
  }
  dom.terminalBody.innerHTML = htmlContent ? formatReasoningAndOutput(htmlContent) : '<div class="terminal-placeholder">Keine Ausgabe für diesen Task vorhanden.</div>';
  dom.terminalBody.scrollTop = 0;
}

// --- SVG ICON HYDRATION ---
function hydrateIcons(root) {
  const scope = root || document;
  scope.querySelectorAll('[data-icon]').forEach(el => {
    if (el.dataset.iconHydrated) return;
    const name = el.getAttribute('data-icon');
    if (typeof icon === 'function' && window.ICONS && window.ICONS[name]) {
      el.insertAdjacentHTML('afterbegin', icon(name));
      el.dataset.iconHydrated = '1';
    } else if (typeof window.icon === 'function') {
      try {
        el.insertAdjacentHTML('afterbegin', window.icon(name));
        el.dataset.iconHydrated = '1';
      } catch {}
    }
  });
}

// --- MODEL PRESETS & STATUS ---
async function loadModelPresets(forceRefresh = false) {
  try {
    const url = forceRefresh ? '/api/model-presets?refresh=1' : '/api/model-presets';
    const res = await fetch(url);
    state.modelPresets = await res.json();
    return state.modelPresets;
  } catch (err) {
    console.error("Fehler beim Laden der Modell-Presets:", err);
    return state.modelPresets;
  }
}

let lastHarnessModelRefresh = 0;
let refreshModelsPromise = null;

async function refreshHarnessModelsOnTabOpen(force = false) {
  const now = Date.now();
  if (refreshModelsPromise) {
    return refreshModelsPromise;
  }
  // If refreshed within the last 30 seconds and not a manual button click, skip to avoid repeating CLI queries
  if (!force && (now - lastHarnessModelRefresh < 30000)) {
    return state.modelPresets;
  }

  lastHarnessModelRefresh = now;

  refreshModelsPromise = (async () => {
    if (dom.refreshModelsBtn) {
      dom.refreshModelsBtn.disabled = true;
      dom.refreshModelsBtn.textContent = 'Frage CLIs ab...';
    }
    if (dom.modelsRefreshBanner && dom.modelsRefreshText) {
      dom.modelsRefreshText.innerHTML = `⏳ <em>Lese Modelle dynamisch aus CLIs (OpenCode, Codex, Qoder)...</em>`;
      dom.modelsRefreshBanner.classList.remove('hidden');
    }

    try {
      const presets = await loadModelPresets(true);
      renderHarnessConfigList();
      updateNewRouteModelOptions();

      const openCodeCount = presets.opencode ? presets.opencode.length - 1 : 0;
      const qoderCount = presets.qoder ? presets.qoder.length - 1 : 0;
      const codexCount = presets.codex ? presets.codex.length - 1 : 0;

      if (dom.modelsRefreshBanner && dom.modelsRefreshText) {
        dom.modelsRefreshText.innerHTML = `✓ <strong>Modelle live synchronisiert:</strong> ${openCodeCount} OpenCode-, ${codexCount} Codex- & ${qoderCount} Qoder-Modelle erkannt.`;
        dom.modelsRefreshBanner.classList.remove('hidden');
        setTimeout(() => {
          if (dom.modelsRefreshBanner) dom.modelsRefreshBanner.classList.add('hidden');
        }, 5000);
      }
      return presets;
    } catch (err) {
      console.error("Fehler beim Abrufen der Modelle:", err);
      if (dom.modelsRefreshBanner && dom.modelsRefreshText) {
        dom.modelsRefreshText.innerHTML = `⚠️ <em>Modelle konnten nicht aktualisiert werden: ${escapeHtml(err.message)}</em>`;
        setTimeout(() => {
          if (dom.modelsRefreshBanner) dom.modelsRefreshBanner.classList.add('hidden');
        }, 4000);
      }
      return state.modelPresets;
    } finally {
      refreshModelsPromise = null;
      if (dom.refreshModelsBtn) {
        dom.refreshModelsBtn.disabled = false;
        dom.refreshModelsBtn.textContent = 'Modelle aus CLIs neu laden';
      }
    }
  })();

  return refreshModelsPromise;
}

async function loadStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    state.health = data.health || [];
    state.clis = data.clis || [];

    renderHarnessStatusPills();
    renderHarnessOverrideSelect();
    renderHarnessConfigList();
  } catch (err) {
    console.error("Fehler beim Laden des Status:", err);
  }
}

function renderHarnessStatusPills() {
  dom.harnessStatusPills.innerHTML = '';
  state.health.forEach(h => {
    const pill = document.createElement('div');
    pill.className = `status-pill ${h.available ? 'online' : 'offline'}`;
    pill.innerHTML = `
      <span class="dot"></span>
      <span>${h.name}</span>
    `;
    dom.harnessStatusPills.appendChild(pill);
  });
}

function renderHarnessOverrideSelect() {
  dom.harnessOverride.innerHTML = `
    <option value="auto">Auto-Route (Prioritätskette)</option>
    <option value="consensus">Konsens-Modus (Dual-Agent)</option>
  `;
  state.clis.forEach(c => {
    if (c.enabled !== false) {
      const opt = document.createElement('option');
      opt.value = c.name;
      const modelStr = (c.model && c.model !== 'Standard') ? ` [${c.model}]` : '';
      opt.textContent = `${c.name} (${c.command})${modelStr}`;
      dom.harnessOverride.appendChild(opt);
    }
  });
  updateRouteUsagePill();
}

function getHarnessKey(item) {
  if (item.harness && state.modelPresets[item.harness]) return item.harness;
  if (item.command === 'claude') return 'claude_code';
  if (item.command === 'codex') return 'codex';
  if (item.command === 'cline') return 'cline';
  if (item.command === 'opencode') return 'opencode';
  if (item.command === 'agy') return 'antigravity_cli';
  if (item.command === 'qodercli' || item.command === 'qoder') return 'qoder';
  if (item.command === 'freebuff') return 'freebuff';
  if (item.command === 'codebuddy' || item.command === 'cbc') return 'codebuddy';
  return 'claude_code';
}

function renderHarnessConfigList() {
  dom.harnessConfigList.innerHTML = '';

  state.clis.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'harness-row';
    const isChecked = item.enabled !== false ? 'checked' : '';
    const harnessKey = getHarnessKey(item);
    const presets = state.modelPresets[harnessKey] || [
      { id: 'Standard', label: 'Standard' }
    ];

    const currentModel = item.model || 'Standard';
    const isPreset = presets.some(p => p.id === currentModel);

    // Build model select options
    let modelOptionsHtml = '';
    presets.forEach(p => {
      const sel = p.id === currentModel ? 'selected' : '';
      modelOptionsHtml += `<option value="${escapeHtml(p.id)}" ${sel}>${escapeHtml(p.label)}</option>`;
    });
    modelOptionsHtml += `<option value="__custom__" ${!isPreset && currentModel !== 'Standard' ? 'selected' : ''}>Benutzerdefiniert...</option>`;

    row.innerHTML = `
      <div><span class="order-badge">${index + 1}</span></div>
      <div><input type="checkbox" class="harness-active-chk" data-idx="${index}" ${isChecked} title="Aktivieren / Deaktivieren" /></div>
      <div>
        <input type="text" class="custom-select" style="width: 100%; font-size:12px; padding:4px 6px;" value="${escapeHtml(item.name || '')}" data-name-idx="${index}" title="Routenname bearbeiten" />
      </div>
      <div><code>${escapeHtml(item.command || item.harness || 'cli')}</code></div>
      <div>
        <div class="model-select-wrapper">
          <select class="model-dropdown" data-idx="${index}">
            ${modelOptionsHtml}
          </select>
          <input type="text" class="model-custom-input ${!isPreset && currentModel !== 'Standard' ? '' : 'hidden'}" data-idx="${index}" value="${!isPreset ? escapeHtml(currentModel) : ''}" placeholder="Modell-ID" />
        </div>
        <div class="model-test-line">
          <button class="btn-model-test" data-idx="${index}" title="Testet, ob ${escapeHtml(item.model || 'Standard')} über ${escapeHtml(item.command || '')} antwortet">Test</button>
          <span class="model-test-result"></span>
        </div>
      </div>
      <div class="row-actions">
        <button class="btn-arrow" data-dir="up" data-idx="${index}" title="Nach oben" ${index === 0 ? 'disabled' : ''}>↑</button>
        <button class="btn-arrow" data-dir="down" data-idx="${index}" title="Nach unten" ${index === state.clis.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="btn-delete-row" data-idx="${index}" title="Route entfernen">×</button>
      </div>
    `;

    dom.harnessConfigList.appendChild(row);
    row.dataset.testKey = modelTestKey(item);
    paintModelTest(row);
  });

  // Re-bind row events
  dom.harnessConfigList.querySelectorAll('.btn-arrow').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      const dir = btn.dataset.dir;
      if (dir === 'up' && idx > 0) {
        swapClis(idx, idx - 1);
      } else if (dir === 'down' && idx < state.clis.length - 1) {
        swapClis(idx, idx + 1);
      }
    });
  });

  dom.harnessConfigList.querySelectorAll('.btn-delete-row').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      if (confirm(`Route "${state.clis[idx].name}" wirklich löschen?`)) {
        state.clis.splice(idx, 1);
        renderHarnessConfigList();
        renderHarnessOverrideSelect();
      }
    });
  });

  dom.harnessConfigList.querySelectorAll('.harness-active-chk').forEach(chk => {
    chk.addEventListener('change', () => {
      const idx = parseInt(chk.dataset.idx, 10);
      state.clis[idx].enabled = chk.checked;
      renderHarnessOverrideSelect();
    });
  });

  dom.harnessConfigList.querySelectorAll('input[data-name-idx]').forEach(inp => {
    inp.addEventListener('input', () => {
      const idx = parseInt(inp.dataset.nameIdx, 10);
      state.clis[idx].name = inp.value.trim();
      renderHarnessOverrideSelect();
    });
  });

  dom.harnessConfigList.querySelectorAll('.model-dropdown').forEach(sel => {
    sel.addEventListener('change', () => {
      const idx = parseInt(sel.dataset.idx, 10);
      const row = sel.closest('.harness-row');
      const customInp = row.querySelector('.model-custom-input');

      if (sel.value === '__custom__') {
        customInp.classList.remove('hidden');
        customInp.focus();
        state.clis[idx].model = customInp.value.trim() || 'Standard';
      } else {
        customInp.classList.add('hidden');
        state.clis[idx].model = sel.value;
      }
      row.dataset.testKey = modelTestKey(state.clis[idx]);
      paintModelTest(row);
      renderHarnessOverrideSelect();
    });
  });

  dom.harnessConfigList.querySelectorAll('.model-custom-input').forEach(inp => {
    inp.addEventListener('input', () => {
      const idx = parseInt(inp.dataset.idx, 10);
      state.clis[idx].model = inp.value.trim() || 'Standard';
      const row = inp.closest('.harness-row');
      row.dataset.testKey = modelTestKey(state.clis[idx]);
      paintModelTest(row);
      renderHarnessOverrideSelect();
    });
  });

  dom.harnessConfigList.querySelectorAll('.btn-model-test').forEach(btn => {
    btn.addEventListener('click', () => runModelTest(btn));
  });
}

const MODEL_TEST_LABELS = {
  unknown_model: 'Modell unbekannt',
  auth: 'Login fehlt',
  rate_limit: 'Quota erschöpft',
  context_limit: 'Kontext voll',
  service: 'Dienstfehler',
  timeout: 'Timeout',
  not_installed: 'nicht installiert',
  tui_only: 'nur TUI',
  unknown: 'Fehler'
};

// Results are keyed by command+model instead of by row, so the dynamic model
// refresh (and route reordering) can re-render the list without losing a test.
function modelTestKey(item) {
  return `${item.command || item.harness || ''}|${item.model || 'Standard'}`;
}

function paintModelTest(row) {
  if (!row) return;
  const key = row.dataset.testKey;
  const entry = state.modelTests[key];
  const span = row.querySelector('.model-test-result');
  const btn = row.querySelector('.btn-model-test');
  if (!span || !btn) return;

  const running = entry && entry.status === 'running';
  span.className = 'model-test-result' + (entry ? ` ${running ? 'running' : (entry.ok ? 'ok' : 'fail')}` : '');
  span.textContent = entry ? entry.text : '';
  span.title = entry ? (entry.title || '') : '';
  btn.disabled = !!running;
  btn.textContent = running ? '…' : 'Test';
}

async function runModelTest(btn) {
  const idx = parseInt(btn.dataset.idx, 10);
  const route = state.clis[idx];
  const row = btn.closest('.harness-row');
  if (!route || !row) return;

  const key = row.dataset.testKey;
  if (state.modelTests[key] && state.modelTests[key].status === 'running') return;

  const model = route.model || 'Standard';
  state.modelTests[key] = { status: 'running', text: 'läuft…', title: `${route.command} · ${model}` };
  paintModelTest(row);

  let data;
  try {
    const res = await fetch('/api/harness/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: route.command, harness: route.harness, model })
    });
    data = await res.json();
  } catch (err) {
    data = { ok: false, errorKind: 'unknown', error: err.message };
  }

  const secs = data.latencyMs ? ` ${(data.latencyMs / 1000).toFixed(1)}s` : '';
  state.modelTests[key] = {
    status: 'done',
    ok: !!data.ok,
    text: data.ok ? `✓ antwortet${secs}` : `✕ ${MODEL_TEST_LABELS[data.errorKind] || 'Fehler'}${secs}`,
    title: [`${route.command} · ${model}`, data.error, data.sample].filter(Boolean).join('\n')
  };
  paintModelTest(dom.harnessConfigList.querySelector(`[data-test-key="${CSS.escape(key)}"]`));
}

function swapClis(i, j) {
  const temp = state.clis[i];
  state.clis[i] = state.clis[j];
  state.clis[j] = temp;
  renderHarnessConfigList();
  renderHarnessOverrideSelect();
}

// --- WORKSPACE & PROJECT TREE ---
async function loadWorkspace() {
  try {
    const res = await fetch('/api/workspace');
    const data = await res.json();
    state.rootDirectory = data.rootDirectory || '';
    state.activeProject = data.activeProject || '';
    state.projects = data.projects || [];
    state.tasks = data.tasks || [];

    // Automatically expand the active project
    if (state.activeProject) {
      state.expandedProjects.add(state.activeProject);
    }

    updateWorkspaceUI();
    renderProjectTree();
  } catch (err) {
    console.error("Fehler beim Laden des Workspaces:", err);
  }
}

function updateWorkspaceUI() {
  const rootBase = state.rootDirectory ? state.rootDirectory.split('/').pop() || state.rootDirectory : 'Developer';
  if (dom.rootDirText) {
    dom.rootDirText.textContent = rootBase;
  }
  if (dom.rootDirDisplay) {
    dom.rootDirDisplay.title = `Root-Verzeichnis: ${state.rootDirectory} (Klicken für Einstellungen)`;
  }

  if (dom.projectsCountBadge) {
    dom.projectsCountBadge.textContent = state.projects.length;
  }

  const current = state.projects.find(p => p.path === state.activeProject) || {
    name: state.activeProject ? state.activeProject.split('/').pop() : 'Kein Projekt',
    path: state.activeProject || state.rootDirectory
  };

  dom.currentProjectName.textContent = current.name;
  dom.currentProjectPath.textContent = `(${current.path})`;
  dom.promptTargetFolder.textContent = current.name;

  if (dom.rootAgentsText) {
    dom.rootAgentsText.textContent = `AGENTS.md aktiv`;
  }

  if (dom.agentsContextText) {
    const hasProjAgents = current && current.hasAgentsMd;
    if (hasProjAgents) {
      dom.agentsContextText.textContent = `Global + ${current.name}/AGENTS.md`;
    } else {
      dom.agentsContextText.textContent = `Global aktiv`;
    }
  }

  // Update Stats in Settings Dialog
  if (dom.statRootPath) dom.statRootPath.textContent = state.rootDirectory || '-';
  if (dom.statProjectsCount) dom.statProjectsCount.textContent = state.projects.length;
  if (dom.statActiveProject) dom.statActiveProject.textContent = current.name;
  if (dom.settingsRootInput && !dom.settingsRootInput.value) {
    dom.settingsRootInput.value = state.rootDirectory || '';
  }
}

function renderProjectTree() {
  dom.projectTree.innerHTML = '';

  if (state.projects.length === 0) {
    dom.projectTree.innerHTML = '<div class="empty-task-hint">Keine Unterordner in diesem Verzeichnis gefunden.</div>';
    return;
  }

  state.projects.forEach(p => {
    const isExpanded = state.expandedProjects.has(p.path);
    const isActive = p.path === state.activeProject;
    const projectTasks = state.tasks.filter(t => t.projectPath === p.path);

    const node = document.createElement('div');
    node.className = `project-node ${isActive ? 'active' : ''}`;
    node.dataset.path = p.path;

    // Header
    const header = document.createElement('div');
    header.className = 'project-header';
    header.innerHTML = `
      <span class="toggle-arrow">${isExpanded ? '▾' : '▸'}</span>
      <span class="folder-icon" data-icon="folder"></span>
      <span class="project-title" title="${escapeHtml(p.path)}">${escapeHtml(p.name)}</span>
      ${p.hasAgentsMd ? '<span class="badge-tag">AGENTS</span>' : ''}
      <button class="add-task-btn" title="Neuen Task in '${escapeHtml(p.name)}' starten">＋</button>
    `;

    // Task List (Indented)
    const taskList = document.createElement('div');
    taskList.className = `task-list ${isExpanded ? '' : 'hidden'}`;

    if (projectTasks.length === 0) {
      taskList.innerHTML = '<div class="empty-task-hint">Keine Tasks vorhanden</div>';
    } else {
      projectTasks.forEach(task => {
        const isTaskActive = task.id === state.activeTaskId;
        const taskItem = document.createElement('div');
        taskItem.className = `task-item ${isTaskActive ? 'active' : ''}`;
        taskItem.dataset.taskId = task.id;

        const timeStr = formatTimestamp(task.timestamp);
        const statusIcon = task.status === 'completed' ? '●' : (task.status === 'running' ? '◐' : '○');

        let usageMeta = '';
        if (task.usage && task.usage.totalTokens) {
          const tokK = Math.round(task.usage.totalTokens / 100) / 10;
          usageMeta = ` · <span style="color:#10b981; font-weight:600;">${tokK}k Tok</span>`;
          if (task.usage.remainingPercent !== undefined) {
            usageMeta += ` <span style="color:var(--text-dim); font-size:10px;">(${task.usage.remainingPercent}% frei)</span>`;
          }
        }

        taskItem.innerHTML = `
          <span class="task-icon">↳</span>
          <div class="task-meta">
            <span class="task-prompt" title="${escapeHtml(task.prompt)}">${escapeHtml(task.prompt)}</span>
            <span class="task-badge">${statusIcon} ${escapeHtml(task.harness || 'cli')} · ${escapeHtml(task.model || 'Standard')}${usageMeta} · ${timeStr}</span>
          </div>
        `;

        // Click task: show recorded terminal output
        taskItem.addEventListener('click', (e) => {
          e.stopPropagation();
          selectTask(task);
        });

        taskList.appendChild(taskItem);
      });
    }

    // Toggle expand/collapse or select project
    header.addEventListener('click', (e) => {
      if (e.target.classList.contains('add-task-btn')) {
        e.stopPropagation();
        selectProject(p.path);
        startNewTaskInProject();
        return;
      }

      if (e.target.classList.contains('toggle-arrow')) {
        e.stopPropagation();
        toggleProjectExpand(p.path);
        return;
      }

      // Clicking the header selects project and expands it
      selectProject(p.path);
      state.expandedProjects.add(p.path);
      renderProjectTree();
    });

    node.appendChild(header);
    node.appendChild(taskList);
    dom.projectTree.appendChild(node);
  });
}

function toggleProjectExpand(projectPath) {
  if (state.expandedProjects.has(projectPath)) {
    state.expandedProjects.delete(projectPath);
  } else {
    state.expandedProjects.add(projectPath);
  }
  renderProjectTree();
}

async function selectProject(projectPath) {
  if (state.activeProject === projectPath) {
    if (window.innerWidth <= 768 && dom.sidebar) {
      dom.sidebar.classList.remove('open');
      if (dom.mobileDrawerOverlay) dom.mobileDrawerOverlay.classList.remove('active');
    }
    return;
  }
  state.activeProject = projectPath;
  updateWorkspaceUI();
  renderProjectTree();
  loadAgentsMd(); // refresh AGENTS.md for the new project

  if (window.innerWidth <= 768 && dom.sidebar) {
    dom.sidebar.classList.remove('open');
    if (dom.mobileDrawerOverlay) dom.mobileDrawerOverlay.classList.remove('active');
  }

  try {
    await fetch('/api/workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeProject: projectPath })
    });
  } catch (err) {
    console.error("Fehler beim Synchronisieren des aktiven Projekts:", err);
  }
}

function selectTask(task) {
  state.activeTaskId = task.id;
  if (task.projectPath && state.activeProject !== task.projectPath) {
    state.activeProject = task.projectPath;
    state.expandedProjects.add(task.projectPath);
    updateWorkspaceUI();
  }

  if (window.innerWidth <= 768 && dom.sidebar) {
    dom.sidebar.classList.remove('open');
    if (dom.mobileDrawerOverlay) dom.mobileDrawerOverlay.classList.remove('active');
  }

  renderProjectTree();
  setTerminalContent(task.outputHtml, `Task: ${task.prompt.slice(0, 32)}... (${task.harness})`);
  switchTab('studio');
}

function startNewTaskInProject() {
  state.activeTaskId = null;
  renderProjectTree();
  setTerminalContent(
    `<div class="terminal-placeholder">Frischer Task für <strong>${escapeHtml(dom.currentProjectName.textContent)}</strong>. Gib unten deine Aufgabe ein.</div>`,
    'Neuer Task'
  );
  switchTab('studio');
  dom.promptInput.focus();
}

function formatTimestamp(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- AGENTS.MD EDITOR ---
async function loadAgentsMd() {
  try {
    const url = state.activeProject 
      ? `/api/agents-md?project=${encodeURIComponent(state.activeProject)}`
      : '/api/agents-md';
    const res = await fetch(url);
    state.agentsData = await res.json();
    renderAgentsEditor();
    updateWorkspaceUI();
  } catch (err) {
    console.error("Fehler beim Laden von AGENTS.md:", err);
  }
}

function renderAgentsEditor() {
  if (!state.agentsData) return;

  const target = state.activeAgentsTab;
  let targetObj = state.agentsData[target] || { path: '', content: '' };

  dom.agentsTabBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.target === target);

    if (btn.dataset.target === 'rootDev' && state.agentsData.rootDev) {
      const kb = Math.round((state.agentsData.rootDev.size || 0) / 1024 * 10) / 10;
      btn.textContent = `Developer/AGENTS.md (${kb} KB, Übergeordnet)`;
    } else if (btn.dataset.target === 'project' && state.agentsData.project) {
      if (state.agentsData.project.exists) {
        const kb = Math.round((state.agentsData.project.size || 0) / 1024 * 10) / 10;
        btn.textContent = `Projekt/AGENTS.md (${kb} KB aktiv)`;
      } else {
        btn.textContent = `Projekt/AGENTS.md (Keine Datei)`;
      }
    } else if (btn.dataset.target === 'global' && state.agentsData.global) {
      const kb = Math.round((state.agentsData.global.size || 0) / 1024 * 10) / 10;
      btn.textContent = `Global (~/.harness-dispatch/AGENTS.md, ${kb} KB)`;
    }
  });

  dom.editorFilePathDisplay.textContent = targetObj.path
    ? `Pfad: ${targetObj.path} ${targetObj.exists === false ? '(wird neu angelegt)' : `(${Math.round((targetObj.size || 0) / 1024 * 10) / 10} KB)`}`
    : 'Kein Zielpfad vorhanden';

  dom.agentsMdEditor.value = targetObj.content || '';
}

// --- SKILLS & PLUGINS ---
async function loadSkills(filterQuery = '') {
  try {
    const res = await fetch('/api/skills');
    const data = await res.json();
    state.skillsData = data;
    dom.skillsGrid.innerHTML = '';

    if (dom.skillsStatusBadge) {
      dom.skillsStatusBadge.textContent = `${data.totalSkills || (data.skills && data.skills.length) || 0} Skills aktiv auf allen 8 CLIs`;
    }

    let skillsList = data.skills || [];
    const q = (filterQuery !== '' ? filterQuery : (dom.skillsSearchInput ? dom.skillsSearchInput.value : '')).toLowerCase().trim();
    if (q) {
      skillsList = skillsList.filter(s =>
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.displayName && s.displayName.toLowerCase().includes(q)) ||
        (s.description && s.description.toLowerCase().includes(q))
      );
    }

    if (skillsList.length === 0) {
      dom.skillsGrid.innerHTML = `<div style="grid-column:1/-1; padding:30px; text-align:center; color:var(--text-dim); background:var(--bg-card); border-radius:8px; border:1px solid var(--border-color);">
        Keine Skills gefunden für <strong>"${escapeHtml(q)}"</strong>.
      </div>`;
      return;
    }

    skillsList.forEach(s => {
      const card = document.createElement('div');
      card.className = 'skill-card';
      
      const harnessesHtml = (s.activeHarnesses || []).map(h => 
        `<span class="badge" style="background:rgba(59,130,246,0.12); color:#60a5fa; font-size:10px; padding:2px 6px; border:1px solid rgba(59,130,246,0.25); white-space:nowrap;">${escapeHtml(h.name)}</span>`
      ).join(' ');

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
          <div class="skill-title" style="font-size:14px; font-weight:700; color:#fff; display:flex; align-items:center; gap:6px;">
            <span style="color:var(--accent); font-size:15px;">🧩</span> ${escapeHtml(s.displayName || s.name)}
          </div>
          <span class="badge ${s.isFullySynced ? 'badge-success' : 'badge-accent'}" style="font-size:10px; padding:2px 6px; white-space:nowrap;">
            ${s.isFullySynced ? '✓ Alle 8 CLIs' : `${(s.activeHarnesses || []).length}/8 CLIs`}
          </span>
        </div>
        <div class="skill-desc" style="font-size:12px; color:var(--text-muted); line-height:1.45; margin:6px 0 10px 0; min-height:34px;">
          ${escapeHtml(s.description || 'Keine Beschreibung vorhanden.')}
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:10px;">
          ${harnessesHtml}
        </div>
        <div style="font-size:10px; color:var(--text-dim); font-family:var(--font-mono); word-break:break-all; border-top:1px solid rgba(255,255,255,0.06); padding-top:6px; margin-top:auto;">
          📂 ${escapeHtml(s.sourcePath || s.path || '')}
        </div>
      `;
      dom.skillsGrid.appendChild(card);
    });
  } catch (err) {
    console.error("Fehler beim Laden der Skills:", err);
  }
}

async function syncSkills() {
  if (dom.syncSkillsBtn) {
    dom.syncSkillsBtn.disabled = true;
    dom.syncSkillsBtn.innerHTML = '🔄 Synchronisiere...';
  }
  try {
    const res = await fetch('/api/skills/sync', { method: 'POST' });
    const data = await res.json();
    state.skillsData = data;
    await loadSkills();

    if (dom.skillsSyncBanner && dom.skillsSyncText) {
      dom.skillsSyncText.textContent = `✅ ${data.totalSkills} Skills erfolgreich über alle ${data.harnesses.length} Harnesses synchronisiert! (${data.newlyLinked} neu verlinkt)`;
      dom.skillsSyncBanner.classList.remove('hidden');
    }
  } catch (err) {
    alert('Fehler beim Synchronisieren: ' + err.message);
  } finally {
    if (dom.syncSkillsBtn) {
      dom.syncSkillsBtn.disabled = false;
      dom.syncSkillsBtn.innerHTML = '<span data-icon="refresh"></span> Skills für alle 8 CLIs synchronisieren';
      if (typeof refreshIcons === 'function') refreshIcons(dom.syncSkillsBtn);
    }
  }
}

async function handleInstallSkill() {
  const isGit = dom.skillTabGit && dom.skillTabGit.classList.contains('active');
  const feedback = dom.skillInstallFeedback;
  if (!feedback) return;
  feedback.style.display = 'block';
  feedback.style.background = 'rgba(59,130,246,0.15)';
  feedback.style.border = '1px solid rgba(59,130,246,0.3)';
  feedback.style.color = '#60a5fa';
  feedback.textContent = '⏳ Installiere Skill und verteile per Symlink auf alle 8 Harnesses...';

  const payload = {
    mode: isGit ? 'git' : 'custom',
    repoUrl: dom.skillGitUrl ? dom.skillGitUrl.value.trim() : '',
    name: isGit ? (dom.skillGitName ? dom.skillGitName.value.trim() : '') : (dom.skillCustomName ? dom.skillCustomName.value.trim() : ''),
    description: dom.skillCustomDesc ? dom.skillCustomDesc.value.trim() : '',
    content: dom.skillCustomContent ? dom.skillCustomContent.value.trim() : ''
  };

  try {
    const res = await fetch('/api/skills/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || 'Fehler beim Installieren');

    feedback.style.background = 'rgba(34,197,94,0.15)';
    feedback.style.border = '1px solid rgba(34,197,94,0.3)';
    feedback.style.color = '#4ade80';
    feedback.textContent = `✅ ${data.message}`;

    state.skillsData = data.sync;
    await loadSkills();

    setTimeout(() => {
      if (dom.installSkillModal) dom.installSkillModal.classList.add('hidden');
      feedback.style.display = 'none';
      if (dom.skillGitUrl) dom.skillGitUrl.value = '';
      if (dom.skillGitName) dom.skillGitName.value = '';
      if (dom.skillCustomName) dom.skillCustomName.value = '';
      if (dom.skillCustomDesc) dom.skillCustomDesc.value = '';
      if (dom.skillCustomContent) dom.skillCustomContent.value = '';
    }, 1200);
  } catch (err) {
    feedback.style.background = 'rgba(239,68,68,0.15)';
    feedback.style.border = '1px solid rgba(239,68,68,0.3)';
    feedback.style.color = '#f87171';
    feedback.textContent = `✕ ${err.message}`;
  }
}

// --- USAGE & QUOTA ---
async function loadUsage(forceRefresh = false) {
  try {
    const url = forceRefresh ? '/api/costs?refresh=1' : '/api/costs';
    const res = await fetch(url);
    const data = await res.json();
    state.costsData = data;
    state.usageData = data.usage || data;
    renderUsageUI();
  } catch (err) {
    console.error("Fehler beim Laden der Usage:", err);
  }
}

function renderUsageUI() {
  if (!state.usageData) return;

  // 1. Top Bar Badge
  if (dom.topUsageBadge) {
    const totalReady = Object.values(state.usageData).filter(u => u.available).length;
    dom.topUsageBadge.textContent = `${totalReady}/8 Bereit`;
  }

  // 2. Telemetry Stats Grid
  if (state.costsData) {
    if (dom.statOmniCost && state.costsData.omniroute) {
      dom.statOmniCost.textContent = state.costsData.omniroute.totalCost || '$0.00';
    }
    if (dom.statOmniTokens && state.costsData.omniroute) {
      dom.statOmniTokens.textContent = state.costsData.omniroute.totalTokensFormatted || '0 Tokens';
    }
    if (dom.statOpencodeTokens && state.costsData.opencode) {
      dom.statOpencodeTokens.textContent = state.costsData.opencode.totalTokensFormatted || '0 Tokens';
    }

    // 3. OmniRoute Providers Mini-Table
    if (dom.omnirouteProvidersList && state.costsData.omniroute && state.costsData.omniroute.providers) {
      const provs = state.costsData.omniroute.providers.slice(0, 10);
      if (provs.length === 0) {
        dom.omnirouteProvidersList.innerHTML = '<em>Keine Proxy-Aufrufe verzeichnet</em>';
      } else {
        let html = `
          <div style="margin-bottom:6px; font-size:12px;">
            <span><strong>Gesamt geroutet:</strong> ${state.costsData.omniroute.totalTokensFormatted}</span> · 
            <span><strong>Anfragen:</strong> ${state.costsData.omniroute.totalReqs.toLocaleString()}</span> · 
            <span><strong>Kosten:</strong> <strong style="color:var(--accent);">${state.costsData.omniroute.totalCost}</strong></span>
          </div>
          <table style="width:100%; border-collapse:collapse; margin-top:4px; font-size:11px;">
            <thead>
              <tr style="border-bottom:1px solid var(--border-color); text-align:left; color:var(--text-muted);">
                <th style="padding:4px 6px;">Provider / Gruppe</th>
                <th style="padding:4px 6px;">Requests</th>
                <th style="padding:4px 6px;">Tokens In</th>
                <th style="padding:4px 6px;">Tokens Out</th>
                <th style="padding:4px 6px;">Kosten (USD)</th>
              </tr>
            </thead>
            <tbody>
        `;
        provs.forEach(p => {
          html += `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
              <td style="padding:4px 6px; font-weight:600; color:var(--text-main);">${escapeHtml(p.group)}</td>
              <td style="padding:4px 6px; font-family:monospace;">${escapeHtml(p.reqs)}</td>
              <td style="padding:4px 6px; font-family:monospace; color:#60a5fa;">${escapeHtml(p.tokensIn)}</td>
              <td style="padding:4px 6px; font-family:monospace; color:#34d399;">${escapeHtml(p.tokensOut)}</td>
              <td style="padding:4px 6px; font-weight:600; color:${p.costNum > 0 ? 'var(--accent)' : 'var(--text-muted)'};">${escapeHtml(p.cost)}</td>
            </tr>
          `;
        });
        html += `</tbody></table>`;
        dom.omnirouteProvidersList.innerHTML = html;
      }
    }

    // 4. OpenCode Telemetry Details
    if (dom.opencodeModelsList && state.costsData.opencode) {
      const oc = state.costsData.opencode;
      const models = (oc.models || []).slice(0, 6);
      let html = `
        <div style="display:flex; flex-wrap:wrap; gap:16px; margin-bottom:8px; font-size:12px;">
          <span><strong>Sessions:</strong> ${oc.sessions || 0}</span>
          <span><strong>Prompts:</strong> ${oc.prompts || 0}</span>
          <span><strong>Input Tokens:</strong> ${(oc.inputTokens || 0).toLocaleString()}</span>
          <span><strong>Output Tokens:</strong> ${(oc.outputTokens || 0).toLocaleString()}</span>
          <span><strong>Cache Read:</strong> ${(oc.cacheTokens || 0).toLocaleString()}</span>
        </div>
      `;
      if (models.length > 0) {
        html += `
          <table style="width:100%; border-collapse:collapse; margin-top:4px; font-size:11px;">
            <thead>
              <tr style="border-bottom:1px solid var(--border-color); text-align:left; color:var(--text-muted);">
                <th style="padding:4px 6px;">Modell</th>
                <th style="padding:4px 6px;">Provider</th>
                <th style="padding:4px 6px;">Steps</th>
                <th style="padding:4px 6px;">Input</th>
                <th style="padding:4px 6px;">Output</th>
              </tr>
            </thead>
            <tbody>
        `;
        models.forEach(m => {
          const mid = m.model ? m.model.id : 'default';
          const mprov = m.model ? m.model.providerID : 'opencode';
          const inTok = m.tokens ? (m.tokens.input || 0).toLocaleString() : '0';
          const outTok = m.tokens ? (m.tokens.output || 0).toLocaleString() : '0';
          html += `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
              <td style="padding:4px 6px; font-weight:600; color:var(--text-main);">${escapeHtml(mid)}</td>
              <td style="padding:4px 6px; color:var(--text-muted);">${escapeHtml(mprov)}</td>
              <td style="padding:4px 6px; font-family:monospace;">${m.steps || 0}</td>
              <td style="padding:4px 6px; font-family:monospace; color:#60a5fa;">${inTok}</td>
              <td style="padding:4px 6px; font-family:monospace; color:#34d399;">${outTok}</td>
            </tr>
          `;
        });
        html += `</tbody></table>`;
      }
      dom.opencodeModelsList.innerHTML = html;
    }
  }

  // 5. Route Usage Pill (Prompt area)
  updateRouteUsagePill();

  // 6. Settings Table
  renderUsageTable();
}

function updateRouteUsagePill() {
  if (!dom.routeUsageText || !state.usageData) return;

  const currentSelection = dom.harnessOverride ? dom.harnessOverride.value : 'auto';

  if (currentSelection === 'consensus') {
    dom.routeUsageText.textContent = 'Dual-Engine Konsens';
    if (dom.routeUsagePill) {
      dom.routeUsagePill.title = 'Konsens-Modus: Zwei KI-Engines debattieren und erzeugen die optimale Synthese.';
    }
    return;
  }

  let targetHarness = null;

  if (currentSelection !== 'auto') {
    const matchedRoute = state.clis.find(c => c.name === currentSelection);
    if (matchedRoute) {
      const key = getHarnessKey(matchedRoute);
      targetHarness = state.usageData[key];
    }
  }

  if (!targetHarness) {
    // Pick the first enabled route
    const firstActive = state.clis.find(c => c.enabled !== false);
    if (firstActive) {
      const key = getHarnessKey(firstActive);
      targetHarness = state.usageData[key];
    }
  }

  if (targetHarness) {
    dom.routeUsageText.textContent = `${targetHarness.name}: ${targetHarness.remaining || targetHarness.badge || 'Aktiv'}`;
    if (dom.routeUsagePill) {
      dom.routeUsagePill.title = `${targetHarness.name} · Kontextfenster: ${targetHarness.contextWindow} · Plan: ${targetHarness.plan} (Klicken für Details)`;
    }
  } else {
    dom.routeUsageText.textContent = 'Auto (nach Prioritätskette)';
  }
}

function renderUsageTable() {
  if (!dom.usageTableBody || !state.usageData) return;
  dom.usageTableBody.innerHTML = '';

  const harnessesOrder = [
    'claude_code',
    'codex',
    'opencode',
    'qoder',
    'freebuff',
    'codebuddy',
    'antigravity_cli',
    'cline'
  ];

  harnessesOrder.forEach(key => {
    const item = state.usageData[key];
    if (!item) return;

    let quotaHtml = '';
    if (key === 'claude_code') {
      quotaHtml = `
        <div><strong style="color:var(--text-main);">${escapeHtml(item.remaining || 'Pay-per-Token')}</strong></div>
        <div style="font-size:11px; color:var(--text-muted);">${item.tokensFormatted ? escapeHtml(item.tokensFormatted) + ' geroutet' : ''}${item.cost ? ' · ' + escapeHtml(item.cost) : ''}</div>
      `;
    } else if (key === 'opencode') {
      quotaHtml = `
        <div><strong style="color:#10b981;">${escapeHtml(item.remaining || 'Unbegrenzt')}</strong></div>
        <div style="font-size:11px; color:var(--text-muted);">${item.tokensFormatted ? escapeHtml(item.tokensFormatted) + ' erfasst' : ''}${item.sessions ? ` (${item.sessions} Sessions)` : ''}</div>
      `;
    } else {
      quotaHtml = `
        <div><strong>${escapeHtml(item.remaining || '-')}</strong></div>
        ${item.tokensUsed ? `<div style="font-size:11px; color:var(--text-muted);">${item.tokensUsed.toLocaleString()} Tokens verbraucht${item.sessions ? ` (${item.sessions} Sessions)` : ''}</div>` : ''}
      `;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div style="font-weight:600; display:flex; align-items:center; gap:6px;">
          <span>${escapeHtml(item.name)}</span>
          <code>${escapeHtml(item.command)}</code>
        </div>
      </td>
      <td>
        <span style="font-size:12px; color:var(--text-main); font-weight:600;">${escapeHtml(item.plan)}</span>
        ${item.cost ? `<div style="font-size:11px; color:${key === 'claude_code' ? 'var(--accent)' : 'var(--text-muted)'}; font-weight:500;">${escapeHtml(item.cost)}</div>` : ''}
      </td>
      <td>
        <strong style="color:var(--accent-hover);">${escapeHtml(item.contextWindow || '-')}</strong>
      </td>
      <td>
        ${quotaHtml}
      </td>
      <td>
        <span class="diagnostics-status-badge ${item.available ? 'online' : 'offline'}">
          <span class="dot"></span> ${escapeHtml(item.badge ? item.badge.replace(/^[🟢🔴🟡✓✕\s]+/, '') : (item.available ? 'Bereit' : 'Nicht verfügbar'))}
        </span>
      </td>
    `;
    dom.usageTableBody.appendChild(tr);
  });
}

// --- EVENT LISTENERS ---
function setupEventListeners() {
  // Send prompt
  dom.sendPromptBtn.addEventListener('click', sendPrompt);
  dom.promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendPrompt();
    }
  });

  // Cancel run
  dom.cancelRunBtn.addEventListener('click', () => {
    if (state.ws && state.isRunning) {
      state.ws.send(JSON.stringify({ type: 'cancel' }));
    }
  });

  // Top Bar: New Task
  dom.newTaskTopBtn.addEventListener('click', startNewTaskInProject);

  // Settings Dialog Openers
  if (dom.openSettingsBtn) {
    dom.openSettingsBtn.addEventListener('click', () => openSettingsModal('harnesses'));
  }
  if (dom.topOpenSettingsBtn) {
    dom.topOpenSettingsBtn.addEventListener('click', () => openSettingsModal('workspace'));
  }
  if (dom.sidebarQuickSettingsBtn) {
    dom.sidebarQuickSettingsBtn.addEventListener('click', () => openSettingsModal('workspace'));
  }
  if (dom.rootDirDisplay) {
    dom.rootDirDisplay.addEventListener('click', () => openSettingsModal('workspace'));
  }
  if (dom.rootAgentsBadge) {
    dom.rootAgentsBadge.addEventListener('click', () => openSettingsModal('agents'));
  }
  if (dom.agentsContextPill) {
    dom.agentsContextPill.addEventListener('click', () => openSettingsModal('agents'));
  }
  if (dom.harnessStatusPills) {
    dom.harnessStatusPills.addEventListener('click', () => openSettingsModal('diagnostics'));
  }
  if (dom.topUsageBtn) {
    dom.topUsageBtn.addEventListener('click', () => openSettingsModal('usage'));
  }
  if (dom.routeUsagePill) {
    dom.routeUsagePill.addEventListener('click', () => openSettingsModal('usage'));
  }
  if (dom.refreshUsageBtn) {
    dom.refreshUsageBtn.addEventListener('click', () => loadUsage(true));
  }
  if (dom.refreshModelsBtn) {
    dom.refreshModelsBtn.addEventListener('click', () => {
      refreshHarnessModelsOnTabOpen(true);
    });
  }
  if (dom.harnessOverride) {
    dom.harnessOverride.addEventListener('change', () => updateRouteUsagePill());
  }

  // Multimodal Image Attachment Listeners
  if (dom.imageUploadBtn && dom.imageUploadInput) {
    dom.imageUploadBtn.addEventListener('click', () => dom.imageUploadInput.click());
    dom.imageUploadInput.addEventListener('change', handleImageUpload);
  }
  if (dom.removeImageBtn) {
    dom.removeImageBtn.addEventListener('click', removeAttachedImage);
  }
  if (dom.promptInput) {
    dom.promptInput.addEventListener('paste', handlePromptPaste);
  }

  // Scheduled Tasks Listeners
  if (dom.addScheduleBtn) {
    dom.addScheduleBtn.addEventListener('click', handleAddSchedule);
  }
  if (dom.refreshSchedulesBtn) {
    dom.refreshSchedulesBtn.addEventListener('click', loadSchedules);
  }

  // 1-Click Installer Listeners
  if (dom.openInstallerBtn) {
    dom.openInstallerBtn.addEventListener('click', () => openInstallerModal());
  }
  if (dom.settingsOpenInstallerBtn) {
    dom.settingsOpenInstallerBtn.addEventListener('click', () => openInstallerModal());
  }
  if (dom.closeInstallerModalBtn) {
    dom.closeInstallerModalBtn.addEventListener('click', closeInstallerModal);
  }
  if (dom.closeInstallerFooterBtn) {
    dom.closeInstallerFooterBtn.addEventListener('click', closeInstallerModal);
  }
  if (dom.refreshInstallerStatusBtn) {
    dom.refreshInstallerStatusBtn.addEventListener('click', () => loadInstallerStatus(true));
  }
  if (dom.installAllMissingBtn) {
    dom.installAllMissingBtn.addEventListener('click', installAllMissing);
  }
  if (dom.clearInstallerConsoleBtn) {
    dom.clearInstallerConsoleBtn.addEventListener('click', () => {
      if (dom.installerConsoleBody) dom.installerConsoleBody.innerHTML = '';
    });
  }
  if (dom.hideInstallerConsoleBtn) {
    dom.hideInstallerConsoleBtn.addEventListener('click', () => {
      if (dom.installerConsoleWrapper) dom.installerConsoleWrapper.classList.add('hidden');
    });
  }

  // Settings Dialog Closers
  if (dom.closeSettingsModalBtn) {
    dom.closeSettingsModalBtn.addEventListener('click', closeSettingsModal);
  }
  if (dom.closeSettingsFooterBtn) {
    dom.closeSettingsFooterBtn.addEventListener('click', closeSettingsModal);
  }

  // Universal Skills Hub Listeners
  if (dom.syncSkillsBtn) {
    dom.syncSkillsBtn.addEventListener('click', syncSkills);
  }
  if (dom.closeSkillsSyncBannerBtn) {
    dom.closeSkillsSyncBannerBtn.addEventListener('click', () => {
      if (dom.skillsSyncBanner) dom.skillsSyncBanner.classList.add('hidden');
    });
  }
  if (dom.skillsSearchInput) {
    dom.skillsSearchInput.addEventListener('input', (e) => {
      loadSkills(e.target.value);
    });
  }
  if (dom.openInstallSkillBtn) {
    dom.openInstallSkillBtn.addEventListener('click', () => {
      if (dom.installSkillModal) dom.installSkillModal.classList.remove('hidden');
    });
  }
  if (dom.closeInstallSkillBtn) {
    dom.closeInstallSkillBtn.addEventListener('click', () => {
      if (dom.installSkillModal) dom.installSkillModal.classList.add('hidden');
    });
  }
  if (dom.cancelInstallSkillBtn) {
    dom.cancelInstallSkillBtn.addEventListener('click', () => {
      if (dom.installSkillModal) dom.installSkillModal.classList.add('hidden');
    });
  }
  if (dom.confirmInstallSkillBtn) {
    dom.confirmInstallSkillBtn.addEventListener('click', handleInstallSkill);
  }
  if (dom.skillTabGit && dom.skillTabCustom) {
    dom.skillTabGit.addEventListener('click', () => {
      dom.skillTabGit.classList.add('active');
      dom.skillTabCustom.classList.remove('active');
      if (dom.skillFormGit) dom.skillFormGit.classList.remove('hidden');
      if (dom.skillFormCustom) dom.skillFormCustom.classList.add('hidden');
    });
    dom.skillTabCustom.addEventListener('click', () => {
      dom.skillTabCustom.classList.add('active');
      dom.skillTabGit.classList.remove('active');
      if (dom.skillFormCustom) dom.skillFormCustom.classList.remove('hidden');
      if (dom.skillFormGit) dom.skillFormGit.classList.add('hidden');
    });
  }

  // Settings Section Navigation
  dom.settingsNavItems.forEach(btn => {
    btn.addEventListener('click', () => {
      switchSettingsSection(btn.dataset.section);
    });
  });

  // Settings Workspace: Save Root Directory
  if (dom.settingsSaveRootBtn) {
    dom.settingsSaveRootBtn.addEventListener('click', () => {
      const newRoot = dom.settingsRootInput.value.trim();
      saveRootDirectory(newRoot);
    });
  }

  if (dom.quickPathDevBtn) {
    dom.quickPathDevBtn.addEventListener('click', () => {
      const devPath = '/Users/family/Developer';
      if (dom.settingsRootInput) dom.settingsRootInput.value = devPath;
      saveRootDirectory(devPath);
    });
  }

  if (dom.quickPathHomeBtn) {
    dom.quickPathHomeBtn.addEventListener('click', () => {
      const homePath = '/Users/family';
      if (dom.settingsRootInput) dom.settingsRootInput.value = homePath;
      saveRootDirectory(homePath);
    });
  }

  // Keyboard Shortcuts (Esc closes modals, Cmd+, / Ctrl+, opens settings)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeSettingsModal();
      closeInstallerModal();
      if (dom.addRouteModal) dom.addRouteModal.classList.add('hidden');
    }
    if ((e.metaKey || e.ctrlKey) && e.key === ',') {
      e.preventDefault();
      openSettingsModal('harnesses');
    }
  });

  // Tree: Refresh
  dom.refreshTreeBtn.addEventListener('click', () => {
    loadWorkspace();
  });

  // Terminal buttons
  if (dom.clearTerminalBtn) {
    dom.clearTerminalBtn.addEventListener('click', () => {
      streamBuffer = '';
      dom.terminalBody.innerHTML = '<div class="terminal-placeholder">Ausgabe geleert. Bereit für neue Aufgaben.</div>';
    });
  }

  if (dom.copyTerminalBtn) {
    dom.copyTerminalBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(dom.terminalBody.innerText);
      dom.copyTerminalBtn.textContent = 'Kopiert!';
      setTimeout(() => dom.copyTerminalBtn.textContent = 'Kopieren', 1500);
    });
  }

  // Save Settings (Harness Priorities & Models)
  if (dom.saveSettingsBtn) {
    dom.saveSettingsBtn.addEventListener('click', async () => {
      try {
        dom.settingsSaveFeedback.textContent = 'Speichere...';
        const res = await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clis: state.clis })
        });
        if (res.ok) {
          dom.settingsSaveFeedback.textContent = 'Gespeichert in ~/.harness-dispatch/config.yaml!';
          renderHarnessOverrideSelect();
        } else {
          dom.settingsSaveFeedback.textContent = 'Fehler beim Speichern!';
        }
        setTimeout(() => dom.settingsSaveFeedback.textContent = '', 3000);
      } catch (err) {
        dom.settingsSaveFeedback.textContent = `Fehler: ${err.message}`;
      }
    });
  }

  // AGENTS.md subtabs in Settings
  dom.agentsTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.agentsData && state.agentsData[state.activeAgentsTab]) {
        state.agentsData[state.activeAgentsTab].content = dom.agentsMdEditor.value;
      }
      state.activeAgentsTab = btn.dataset.target;
      renderAgentsEditor();
    });
  });

  // Save AGENTS.md in Settings
  if (dom.saveAgentsBtn) {
    dom.saveAgentsBtn.addEventListener('click', async () => {
      try {
        dom.agentsSaveFeedback.textContent = 'Speichere...';
        const target = state.activeAgentsTab;
        const customPath = state.agentsData[target]?.path;

        const res = await fetch('/api/agents-md', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            target: target,
            customPath: customPath,
            content: dom.agentsMdEditor.value
          })
        });
        if (res.ok) {
          if (state.agentsData[target]) {
            state.agentsData[target].content = dom.agentsMdEditor.value;
            state.agentsData[target].exists = true;
          }
          dom.agentsSaveFeedback.textContent = 'Gespeichert!';
          loadAgentsMd();
        } else {
          dom.agentsSaveFeedback.textContent = 'Fehler beim Speichern!';
        }
        setTimeout(() => dom.agentsSaveFeedback.textContent = '', 3000);
      } catch (err) {
        dom.agentsSaveFeedback.textContent = `Fehler: ${err.message}`;
      }
    });
  }

  // Add Route Modal
  dom.addRouteBtn.addEventListener('click', () => {
    updateNewRouteModelOptions();
    dom.addRouteModal.classList.remove('hidden');
  });

  dom.closeRouteModalBtn.addEventListener('click', () => {
    dom.addRouteModal.classList.add('hidden');
  });

  dom.newRouteHarness.addEventListener('change', () => {
    updateNewRouteModelOptions();
  });

  dom.confirmAddRouteBtn.addEventListener('click', async () => {
    const harnessKey = dom.newRouteHarness.value;
    const model = dom.newRouteModel.value;
    let name = dom.newRouteName.value.trim();

    if (!name) {
      const modelSlug = (model && model !== 'Standard') ? model.replace(/[^a-zA-Z0-9]/g, '_') : 'default';
      name = `${harnessKey}_${modelSlug}`;
    }

    const cmdMap = {
      claude_code: 'claude',
      codex: 'codex',
      cline: 'cline',
      opencode: 'opencode',
      antigravity_cli: 'agy',
      qoder: 'qodercli',
      freebuff: 'freebuff',
      codebuddy: 'codebuddy'
    };

    const newRoute = {
      name: name,
      harness: harnessKey,
      command: cmdMap[harnessKey] || 'claude',
      model: model,
      enabled: true
    };

    state.clis.push(newRoute);
    renderHarnessConfigList();
    renderHarnessOverrideSelect();
    dom.addRouteModal.classList.add('hidden');
    dom.newRouteName.value = '';

    // Auto-save to config
    try {
      await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clis: state.clis })
      });
    } catch {}
  });

  setupMobileAndVoice();
}

async function saveRootDirectory(newRoot) {
  if (!newRoot) return;
  try {
    if (dom.settingsRootFeedback) {
      dom.settingsRootFeedback.textContent = 'Aktualisiere & Scanne...';
    }
    const res = await fetch('/api/workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rootDirectory: newRoot })
    });
    const data = await res.json();
    state.rootDirectory = data.rootDirectory;
    state.activeProject = data.activeProject;
    state.projects = data.projects;
    state.tasks = data.tasks;
    updateWorkspaceUI();
    renderProjectTree();
    loadAgentsMd();
    if (dom.settingsRootFeedback) {
      dom.settingsRootFeedback.textContent = `Root-Verzeichnis übernommen (${state.projects.length} Projekte gefunden)`;
      setTimeout(() => dom.settingsRootFeedback.textContent = '', 3000);
    }
  } catch (err) {
    if (dom.settingsRootFeedback) {
      dom.settingsRootFeedback.textContent = `Fehler: ${err.message}`;
    }
  }
}

function updateNewRouteModelOptions() {
  const harnessKey = dom.newRouteHarness.value;
  const presets = state.modelPresets[harnessKey] || [{ id: 'Standard', label: 'Standard' }];

  dom.newRouteModel.innerHTML = '';
  presets.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.label;
    dom.newRouteModel.appendChild(opt);
  });

  // Suggest a default name
  const model = dom.newRouteModel.value;
  const modelSlug = (model && model !== 'Standard') ? model.replace(/[^a-zA-Z0-9]/g, '_') : 'default';
  dom.newRouteName.placeholder = `${harnessKey}_${modelSlug}`;
}

// --- DISPATCH TASK ---
function sendPrompt() {
  const prompt = dom.promptInput.value.trim();
  if ((!prompt && !state.attachedImage) || state.isRunning) return;

  const harnessOverride = dom.harnessOverride.value;

  const payload = {
    type: 'dispatch',
    prompt: prompt || 'Analysiere dieses beigefügte Bild / diesen Screenshot und führe die erforderlichen Anpassungen im Code durch.',
    harnessOverride,
    projectPath: state.activeProject,
    imagePath: state.attachedImage ? state.attachedImage.path : null
  };

  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    state.ws.send(JSON.stringify(payload));
    dom.promptInput.value = '';
    removeAttachedImage();
  } else {
    alert("Verbindung zum Server unterbrochen.");
  }
}

// --- REMOTE & MOBILE MANAGEMENT ---
async function loadRemoteConfig() {
  try {
    const res = await fetch('/api/remote');
    const data = await res.json();

    if (dom.remoteLanUrl) {
      dom.remoteLanUrl.value = data.lanUrl || `http://${data.lanIp}:${data.port}`;
    }

    if (dom.remoteQrCode) {
      try {
        const qrRes = await fetch(`/api/remote/qr.svg?t=${Date.now()}`);
        if (qrRes.ok) {
          const qrSvg = await qrRes.text();
          dom.remoteQrCode.innerHTML = qrSvg;
        }
      } catch (e) {
        console.error('QR code fetch error:', e);
      }
    }

    if (dom.tailscaleStatusBadge) {
      if (data.tailscaleUrl) {
        dom.tailscaleStatusBadge.className = 'diagnostics-status-badge online';
        dom.tailscaleStatusBadge.innerHTML = `<span class="dot"></span> Aktiv (${escapeHtml(data.tailscaleIp)})`;
        if (dom.tailscaleUrlPreview) dom.tailscaleUrlPreview.textContent = data.tailscaleUrl;
      } else {
        dom.tailscaleStatusBadge.className = 'diagnostics-status-badge offline';
        dom.tailscaleStatusBadge.innerHTML = `<span class="dot"></span> VPN einrichten`;
      }
    }

    if (dom.telegramBotEnable) {
      dom.telegramBotEnable.checked = Boolean(data.telegram?.enabled);
    }

    if (dom.telegramTokenInput) {
      dom.telegramTokenInput.value = data.telegram?.hasToken ? (data.telegram.botTokenMasked || '••••••••••••••••') : '';
    }

    if (dom.telegramUserInput) {
      const users = data.telegram?.allowedUsers || [];
      dom.telegramUserInput.value = users.join(', ');
    }

    if (dom.telegramBotBadge) {
      if (data.telegram?.isRunning) {
        dom.telegramBotBadge.className = 'diagnostics-status-badge online';
        dom.telegramBotBadge.style.background = '';
        dom.telegramBotBadge.style.color = '';
        dom.telegramBotBadge.innerHTML = `<span class="dot"></span> Online (@${escapeHtml(data.telegram.botUsername || 'Bot')})`;
      } else if (data.telegram?.enabled) {
        dom.telegramBotBadge.className = 'diagnostics-status-badge';
        dom.telegramBotBadge.style.background = 'rgba(245, 158, 11, 0.15)';
        dom.telegramBotBadge.style.color = 'var(--warning)';
        dom.telegramBotBadge.innerHTML = `<span class="dot"></span> ${escapeHtml(data.telegram?.lastError || 'Wartet auf Verbindung...')}`;
      } else {
        dom.telegramBotBadge.className = 'diagnostics-status-badge offline';
        dom.telegramBotBadge.style.background = '';
        dom.telegramBotBadge.style.color = '';
        dom.telegramBotBadge.innerHTML = `<span class="dot"></span> Inaktiv`;
      }
    }
  } catch (err) {
    console.error('Fehler beim Laden der Remote-Konfiguration:', err);
  }
}

async function saveTelegramSettings() {
  if (!dom.telegramFeedback) return;
  dom.telegramFeedback.textContent = 'Speichere...';
  dom.telegramFeedback.style.color = 'var(--text-muted)';

  const enabled = dom.telegramBotEnable ? dom.telegramBotEnable.checked : false;
  let tokenVal = dom.telegramTokenInput ? dom.telegramTokenInput.value.trim() : '';
  const userVal = dom.telegramUserInput ? dom.telegramUserInput.value.trim() : '';

  const payload = { enabled };

  // Only send token if changed (not masked placeholder)
  if (tokenVal && !tokenVal.includes('•••')) {
    payload.botToken = tokenVal;
  } else if (!tokenVal) {
    payload.botToken = '';
  }

  if (userVal) {
    payload.allowedUsers = userVal.split(/[,;\s]+/).filter(Boolean).map(u => isNaN(u) ? u : Number(u));
  } else {
    payload.allowedUsers = [];
  }

  try {
    const res = await fetch('/api/remote/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      dom.telegramFeedback.textContent = 'Gespeichert!';
      dom.telegramFeedback.style.color = 'var(--success)';
      await loadRemoteConfig();
      setTimeout(() => { if (dom.telegramFeedback) dom.telegramFeedback.textContent = ''; }, 3000);
    } else {
      dom.telegramFeedback.textContent = `Fehler: ${result.error || 'Fehlgeschlagen'}`;
      dom.telegramFeedback.style.color = 'var(--danger)';
    }
  } catch (err) {
    dom.telegramFeedback.textContent = `Fehler: ${err.message}`;
    dom.telegramFeedback.style.color = 'var(--danger)';
  }
}

async function testTelegramSettings() {
  if (!dom.telegramFeedback) return;
  dom.telegramFeedback.textContent = 'Sende Test-Nachricht...';
  dom.telegramFeedback.style.color = 'var(--text-muted)';

  try {
    const res = await fetch('/api/remote/telegram/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const result = await res.json();
    if (result.success) {
      dom.telegramFeedback.textContent = `${result.message}`;
      dom.telegramFeedback.style.color = 'var(--success)';
      await loadRemoteConfig();
    } else {
      dom.telegramFeedback.textContent = `${result.error || 'Test fehlgeschlagen'}`;
      dom.telegramFeedback.style.color = 'var(--danger)';
    }
  } catch (err) {
    dom.telegramFeedback.textContent = `Fehler: ${err.message}`;
    dom.telegramFeedback.style.color = 'var(--danger)';
  }
}

function setupMobileAndVoice() {
  // Service Worker Registration for PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.log('SW Registration Hinweis:', err);
    });
  }

  // Mobile Drawer Toggle
  if (dom.mobileSidebarToggle && dom.sidebar) {
    dom.mobileSidebarToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dom.sidebar.classList.toggle('open');
      if (dom.mobileDrawerOverlay) {
        dom.mobileDrawerOverlay.classList.toggle('active', isOpen);
      }
    });
  }

  if (dom.mobileDrawerOverlay && dom.sidebar) {
    dom.mobileDrawerOverlay.addEventListener('click', () => {
      dom.sidebar.classList.remove('open');
      dom.mobileDrawerOverlay.classList.remove('active');
    });
  }

  // Copy LAN URL
  if (dom.copyLanUrlBtn && dom.remoteLanUrl) {
    dom.copyLanUrlBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(dom.remoteLanUrl.value).then(() => {
        const orig = dom.copyLanUrlBtn.textContent;
        dom.copyLanUrlBtn.textContent = 'Kopiert!';
        setTimeout(() => dom.copyLanUrlBtn.textContent = orig, 2000);
      });
    });
  }

  // Telegram save & test buttons
  if (dom.saveTelegramBtn) {
    dom.saveTelegramBtn.addEventListener('click', saveTelegramSettings);
  }
  if (dom.testTelegramBtn) {
    dom.testTelegramBtn.addEventListener('click', testTelegramSettings);
  }

  // Voice Dictation (Web Speech API)
  if (dom.voiceInputBtn) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      let recognition = null;
      let isRecording = false;

      dom.voiceInputBtn.addEventListener('click', () => {
        if (isRecording && recognition) {
          recognition.stop();
          return;
        }

        try {
          recognition = new SpeechRecognition();
          recognition.continuous = false;
          recognition.interimResults = false;
          recognition.lang = 'de-DE';

          recognition.onstart = () => {
            isRecording = true;
            dom.voiceInputBtn.classList.add('recording');
            dom.voiceInputBtn.title = 'Aufnahme läuft... Bitte sprechen (Klick zum Beenden)';
          };

          recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            if (transcript && dom.promptInput) {
              const currentVal = dom.promptInput.value.trim();
              dom.promptInput.value = currentVal ? `${currentVal} ${transcript}` : transcript;
              dom.promptInput.focus();
            }
          };

          recognition.onerror = (event) => {
            console.warn('Speech recognition notice:', event.error);
            isRecording = false;
            dom.voiceInputBtn.classList.remove('recording');
            dom.voiceInputBtn.title = 'Befehl per Sprache diktieren (Web Speech API)';
          };

          recognition.onend = () => {
            isRecording = false;
            dom.voiceInputBtn.classList.remove('recording');
            dom.voiceInputBtn.title = 'Befehl per Sprache diktieren (Web Speech API)';
          };

          recognition.start();
        } catch (err) {
          console.error('Speech recognition error:', err);
          isRecording = false;
          dom.voiceInputBtn.classList.remove('recording');
        }
      });
    } else {
      dom.voiceInputBtn.addEventListener('click', () => {
        alert('Spracheingabe wird von diesem Desktop-Browser nicht nativ unterstützt. Auf deinem Smartphone (Chrome / Safari / Edge) funktioniert das Mikrofon direkt!');
      });
    }
  }
}

// --- MULTIMODAL IMAGE UPLOAD HELPERS ---

function handleImageUpload(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  uploadImageFile(file);
}

function handlePromptPaste(e) {
  const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
  if (!items) return;
  for (let i = 0; i < items.length; i++) {
    if (items[i].type && items[i].type.indexOf('image') !== -1) {
      const file = items[i].getAsFile();
      if (file) {
        uploadImageFile(file);
        break;
      }
    }
  }
}

async function uploadImageFile(file) {
  try {
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const base64Data = evt.target.result;
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: base64Data,
          filename: file.name || 'screenshot.png'
        })
      });
      const data = await res.json();
      if (data.success && data.file) {
        state.attachedImage = data.file;
        showAttachedImage(data.file.url, file.name || 'screenshot.png');
      }
    };
    reader.readAsDataURL(file);
  } catch (err) {
    console.error('Image upload failed:', err);
  }
}

function showAttachedImage(url, name) {
  if (dom.previewThumbnail) dom.previewThumbnail.src = url;
  if (dom.previewFilename) dom.previewFilename.textContent = name;
  if (dom.imagePreviewTray) dom.imagePreviewTray.classList.remove('hidden');
  if (dom.imageUploadBtn) dom.imageUploadBtn.classList.add('has-image');
}

function removeAttachedImage() {
  state.attachedImage = null;
  if (dom.previewThumbnail) dom.previewThumbnail.src = '';
  if (dom.previewFilename) dom.previewFilename.textContent = '';
  if (dom.imagePreviewTray) dom.imagePreviewTray.classList.add('hidden');
  if (dom.imageUploadBtn) dom.imageUploadBtn.classList.remove('has-image');
  if (dom.imageUploadInput) dom.imageUploadInput.value = '';
}

// --- SCHEDULES & CRON MANAGEMENT ---

function getProjectBaseName(filePath) {
  if (!filePath) return 'Projekt';
  return filePath.split('/').filter(Boolean).pop() || filePath;
}

function formatIntervalName(interval) {
  switch (interval) {
    case 'every_15_mins': return 'Alle 15 Min';
    case 'hourly': return 'Stündlich';
    case 'every_6_hours': return 'Alle 6 Std';
    case 'daily_02_00': return 'Täglich um 02:00';
    case 'daily_08_00': return 'Täglich um 08:00';
    case 'weekly_monday': return 'Wöchentlich (Mo 08:00)';
    default: return interval || 'Stündlich';
  }
}

async function loadSchedules() {
  try {
    const res = await fetch('/api/schedules');
    const data = await res.json();
    state.schedules = data.schedules || [];
    renderSchedulesTable();
    populateScheduleProjectOptions();
    populateScheduleHarnessOptions();
  } catch (err) {
    console.error('Failed to load schedules:', err);
  }
}

function populateScheduleProjectOptions() {
  if (!dom.schedProjectSelect) return;
  dom.schedProjectSelect.innerHTML = '';

  // Current active project first
  if (state.activeProject) {
    const opt = document.createElement('option');
    opt.value = state.activeProject;
    opt.textContent = `${getProjectBaseName(state.activeProject)} (Aktives Projekt)`;
    dom.schedProjectSelect.appendChild(opt);
  }

  // Scanned projects
  state.projects.forEach(p => {
    if (p.path !== state.activeProject) {
      const opt = document.createElement('option');
      opt.value = p.path;
      opt.textContent = `${p.name}`;
      dom.schedProjectSelect.appendChild(opt);
    }
  });

  if (dom.schedProjectSelect.children.length === 0) {
    const opt = document.createElement('option');
    opt.value = state.rootDirectory || '';
    opt.textContent = `Standard (${state.rootDirectory ? getProjectBaseName(state.rootDirectory) : 'Developer'})`;
    dom.schedProjectSelect.appendChild(opt);
  }
}

function populateScheduleHarnessOptions() {
  if (!dom.schedHarnessSelect) return;
  dom.schedHarnessSelect.innerHTML = `
    <option value="auto">Auto-Route (Prioritätskette)</option>
    <option value="consensus">Konsens-Modus (Dual-Agent)</option>
  `;
  state.clis.forEach(c => {
    if (c.enabled !== false) {
      const opt = document.createElement('option');
      opt.value = c.name;
      opt.textContent = `${c.name} (${c.command})`;
      dom.schedHarnessSelect.appendChild(opt);
    }
  });
}

function renderSchedulesTable() {
  if (!dom.schedulesTableBody) return;
  dom.schedulesTableBody.innerHTML = '';

  if (!state.schedules || state.schedules.length === 0) {
    dom.schedulesTableBody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align:center; padding:24px; color:var(--text-dim); font-style:italic;">
          Noch keine automatisierten Hintergrund-Tasks eingerichtet. Lege oben deinen ersten Cron-Job an!
        </td>
      </tr>
    `;
    return;
  }

  state.schedules.forEach(job => {
    const tr = document.createElement('tr');
    const isRunning = job.lastStatus === 'running';
    const isFailed = job.lastStatus === 'failed';
    const statusIcon = isRunning ? '◐' : (isFailed ? '○' : '●');
    const statusClass = job.enabled ? 'active' : 'paused';
    const statusText = job.enabled ? (isRunning ? 'Läuft...' : 'Aktiv') : 'Pausiert';

    const lastRunStr = job.lastRun
      ? new Date(job.lastRun).toLocaleString('de-DE', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
      : 'Noch nie';

    tr.innerHTML = `
      <td style="padding:10px;">
        <span class="sched-status-badge ${statusClass}">
          ${statusIcon} ${statusText}
        </span>
      </td>
      <td style="padding:10px;">
        <strong>${escapeHtml(job.name)}</strong>
        <div style="font-size:11px; color:var(--text-muted); max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(job.prompt)}">
          ${escapeHtml(job.prompt)}
        </div>
      </td>
      <td style="padding:10px; font-family:var(--font-sans); font-size:12px;">
        ${escapeHtml(job.projectName || getProjectBaseName(job.projectPath))}
      </td>
      <td style="padding:10px; color:var(--text-muted); font-size:12px;">
        ${formatIntervalName(job.interval)}
      </td>
      <td style="padding:10px; font-size:12px; color:var(--text-dim);">
        ${lastRunStr}
      </td>
      <td style="padding:10px; text-align:right;">
        <div style="display:flex; align-items:center; justify-content:flex-end; gap:6px;">
          <button class="sched-action-btn run-sched-now-btn" data-id="${job.id}" title="Job sofort jetzt ausführen">Jetzt starten</button>
          <button class="sched-action-btn sched-delete-btn delete-sched-btn" data-id="${job.id}" title="Job löschen">Löschen</button>
        </div>
      </td>
    `;
    dom.schedulesTableBody.appendChild(tr);
  });

  // Attach event listeners for row buttons
  dom.schedulesTableBody.querySelectorAll('.run-sched-now-btn').forEach(btn => {
    btn.addEventListener('click', () => runScheduleNow(btn.dataset.id));
  });
  dom.schedulesTableBody.querySelectorAll('.delete-sched-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteSchedule(btn.dataset.id));
  });
}

async function handleAddSchedule() {
  const name = dom.schedNameInput ? dom.schedNameInput.value.trim() : '';
  const projectPath = dom.schedProjectSelect ? dom.schedProjectSelect.value : state.activeProject;
  const interval = dom.schedIntervalSelect ? dom.schedIntervalSelect.value : 'daily_02_00';
  const harness = dom.schedHarnessSelect ? dom.schedHarnessSelect.value : 'auto';
  const prompt = dom.schedPromptInput ? dom.schedPromptInput.value.trim() : '';
  const notifyTelegram = dom.schedTelegramNotify ? dom.schedTelegramNotify.checked : true;

  if (!name || !prompt) {
    alert('Bitte gib eine Bezeichnung und einen Prompt für den geplanten Task ein.');
    return;
  }

  try {
    const res = await fetch('/api/schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        projectPath,
        interval,
        harness,
        prompt,
        notifyTelegram
      })
    });
    const data = await res.json();
    if (data.success) {
      if (dom.schedNameInput) dom.schedNameInput.value = '';
      if (dom.schedPromptInput) dom.schedPromptInput.value = '';
      loadSchedules();
    }
  } catch (err) {
    console.error('Failed to add schedule:', err);
  }
}

async function deleteSchedule(id) {
  if (!confirm('Diesen geplanten Task wirklich löschen?')) return;
  try {
    const res = await fetch(`/api/schedules/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      loadSchedules();
    }
  } catch (err) {
    console.error('Failed to delete schedule:', err);
  }
}

async function runScheduleNow(id) {
  try {
    const res = await fetch(`/api/schedules/${id}/run`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert(data.message || 'Task wurde im Hintergrund gestartet!');
      loadSchedules();
    }
  } catch (err) {
    console.error('Failed to run schedule now:', err);
  }
}



// ==========================================
// 1-CLICK CLI INSTALLER FUNCTIONS
// ==========================================
const CLI_ICON_KEYS = {
  claude_code_cli: 'claude_code_cli',
  claude: 'claude_code_cli',
  codex_cli: 'codex_cli',
  codex: 'codex_cli',
  cline_cli: 'cline_cli',
  cline: 'cline_cli',
  opencode_cli: 'opencode_cli',
  opencode: 'opencode_cli',
  antigravity_cli: 'antigravity_cli',
  agy: 'antigravity_cli',
  qoder_cli: 'qoder_cli',
  qodercli: 'qoder_cli',
  freebuff_cli: 'freebuff_cli',
  freebuff: 'freebuff_cli',
  codebuddy_cli: 'codebuddy_cli',
  codebuddy: 'codebuddy_cli'
};

async function openInstallerModal(focusToolId = null) {
  if (dom.sidebar) dom.sidebar.classList.remove('open');
  if (dom.mobileDrawerOverlay) dom.mobileDrawerOverlay.classList.remove('active');
  if (!dom.installerModal) return;
  dom.installerModal.classList.remove('hidden');
  await loadInstallerStatus();
  if (focusToolId) {
    setTimeout(() => {
      const card = document.getElementById(`installer-card-${focusToolId}`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.style.outline = '2px solid var(--accent)';
        setTimeout(() => { if (card) card.style.outline = 'none'; }, 2000);
      }
    }, 100);
  }
}

function closeInstallerModal() {
  if (!dom.installerModal) return;
  dom.installerModal.classList.add('hidden');
}

async function loadInstallerStatus(forceRefresh = false) {
  try {
    const url = `/api/installer/status${forceRefresh ? '?refresh=true' : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.installerTools = data.tools || [];

    // Summary counts
    if (dom.summaryInstalledCount) dom.summaryInstalledCount.textContent = data.installed;
    if (dom.summaryMissingCount) dom.summaryMissingCount.textContent = data.missing;

    // Sidebar badge
    if (dom.installerBadgeCount) {
      if (data.missing > 0) {
        dom.installerBadgeCount.textContent = `${data.missing} Fehlt`;
        dom.installerBadgeCount.className = 'count-pill has-missing';
      } else {
        dom.installerBadgeCount.textContent = `${data.installed} Bereit`;
        dom.installerBadgeCount.className = 'count-pill';
      }
    }

    // Install all button
    if (dom.installAllMissingBtn) {
      if (data.missing === 0) {
        dom.installAllMissingBtn.disabled = true;
        dom.installAllMissingBtn.innerHTML = '<span>Alle 8 CLIs bereit</span>';
      } else {
        dom.installAllMissingBtn.disabled = state.isInstallingAll;
        dom.installAllMissingBtn.innerHTML = `<span>Alle ${data.missing} fehlenden CLIs installieren</span>`;
      }
    }

    renderInstallerCards(state.installerTools);

    // Synchronize health state & diagnostics view
    state.health = state.installerTools;
    renderHarnessStatusPills();
    renderDiagnosticsTable();

    return data;
  } catch (err) {
    console.error('Fehler beim Laden des Installer-Status:', err);
  }
}

// Harness-Monogramme kommen aus icons.js (HARNESS_META)
function renderInstallerCards(tools) {
  if (!dom.installerCardsGrid) return;
  dom.installerCardsGrid.innerHTML = '';

  tools.forEach(tool => {
    const isInstalling = state.installingTools.has(tool.id);
    const isReady = tool.available && !isInstalling;
    const isMissing = !tool.available && !isInstalling;

    const mono = (typeof harnessIcon === 'function') ? harnessIcon(CLI_ICON_KEYS[tool.id] || tool.id || tool.cmd, 34) : '';
    const card = document.createElement('div');
    card.id = `installer-card-${tool.id}`;
    card.className = `installer-card ${isInstalling ? 'is-installing' : (isReady ? 'is-installed' : 'is-missing')}`;

    let statusBadge = '';
    if (isInstalling) {
      statusBadge = '<span class="installer-card-badge status-busy">Installiert…</span>';
    } else if (isReady) {
      statusBadge = '<span class="installer-card-badge status-ok">Bereit</span>';
    } else {
      statusBadge = '<span class="installer-card-badge status-missing">Fehlt</span>';
    }

    let actionButton = '';
    if (isInstalling) {
      actionButton = `
        <button class="btn-card-install secondary" disabled>
          <span>Wird installiert…</span>
        </button>
      `;
    } else if (isMissing) {
      actionButton = `
        <button class="btn-card-install primary" onclick="installCli('${tool.id}')">
          <span>1-Klick Installieren</span>
        </button>
      `;
    } else {
      actionButton = `
        <button class="btn-card-install secondary" onclick="installCli('${tool.id}')">
          <span>Neu installieren / Update</span>
        </button>
      `;
    }

    const homePrefix = (state.rootDirectory || '').split('/').slice(0, 3).join('/');
    const shortPath = tool.path ? tool.path.replace(homePrefix, '~') : '–';
    const shortPkg = tool.package || tool.cmd;

    card.innerHTML = `
      <div class="installer-card-top">
        <div class="installer-card-meta">
          <div class="installer-card-icon">${mono}</div>
          <div>
            <div class="installer-card-name">${escapeHtml(tool.name)}</div>
            <code class="installer-card-cmd">${escapeHtml(tool.cmd)}</code>
          </div>
        </div>
        ${statusBadge}
      </div>

      <p class="installer-card-desc">${escapeHtml(tool.desc || '')}</p>

      <div class="installer-card-detail">
        <div class="installer-detail-row">
          <span>Paket:</span>
          <span class="installer-detail-val" title="${escapeHtml(tool.package || '')}"><code>${escapeHtml(shortPkg)}</code></span>
        </div>
        <div class="installer-detail-row">
          <span>Version:</span>
          <span class="installer-detail-val"><strong>${escapeHtml(tool.version || (tool.available ? 'Installiert' : 'Nicht installiert'))}</strong></span>
        </div>
        <div class="installer-detail-row">
          <span>Pfad:</span>
          <span class="installer-detail-val" title="${escapeHtml(tool.path || '')}">${escapeHtml(shortPath)}</span>
        </div>
      </div>

      <div class="installer-card-action">
        ${actionButton}
      </div>
    `;

    dom.installerCardsGrid.appendChild(card);
  });
}

async function installCli(toolId) {
  if (state.installingTools.has(toolId)) return;
  state.installingTools.add(toolId);
  renderInstallerCards(state.installerTools);

  if (dom.installerConsoleWrapper) {
    dom.installerConsoleWrapper.classList.remove('hidden');
    if (dom.installerConsoleTitle) {
      const toolMeta = state.installerTools.find(t => t.id === toolId);
      dom.installerConsoleTitle.textContent = `Installation: ${toolMeta ? toolMeta.name : toolId}`;
    }
  }

  appendInstallerConsoleOutput(`\n[1-Klick Installer] Sende Installationsanfrage für "${toolId}" an Server...\n`);

  try {
    const res = await fetch('/api/installer/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: toolId })
    });
    const data = await res.json();
    if (!res.ok) {
      appendInstallerConsoleOutput(`Fehler: ${data.error || 'Serverfehler'}\n`);
      state.installingTools.delete(toolId);
      renderInstallerCards(state.installerTools);
    }
  } catch (err) {
    appendInstallerConsoleOutput(`Verbindungsfehler: ${err.message}\n`);
    state.installingTools.delete(toolId);
    renderInstallerCards(state.installerTools);
  }
}

async function installAllMissing() {
  const missing = state.installerTools.filter(t => !t.available);
  if (missing.length === 0) {
    alert('Alle 8 CLIs sind bereits installiert und einsatzbereit!');
    return;
  }

  state.isInstallingAll = true;
  if (dom.installAllMissingBtn) {
    dom.installAllMissingBtn.disabled = true;
    dom.installAllMissingBtn.innerHTML = '<span>Batch-Installation läuft…</span>';
  }

  if (dom.installerConsoleWrapper) {
    dom.installerConsoleWrapper.classList.remove('hidden');
    if (dom.installerConsoleTitle) {
      dom.installerConsoleTitle.textContent = `Batch-Installation: ${missing.length} fehlende CLIs`;
    }
  }

  appendInstallerConsoleOutput(`\n[Batch-Installer] Starte sequenzielle Installation von ${missing.length} CLIs: ${missing.map(m => m.name).join(', ')}...\n\n`);

  try {
    const res = await fetch('/api/installer/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ all: true })
    });
    const data = await res.json();
    if (!res.ok) {
      appendInstallerConsoleOutput(`Fehler beim Start: ${data.error || 'Serverfehler'}\n`);
      state.isInstallingAll = false;
      loadInstallerStatus();
    }
  } catch (err) {
    appendInstallerConsoleOutput(`Verbindungsfehler: ${err.message}\n`);
    state.isInstallingAll = false;
    loadInstallerStatus();
  }
}

function appendInstallerConsoleOutput(content, isHtml = false) {
  if (!dom.installerConsoleBody) return;
  if (isHtml) {
    dom.installerConsoleBody.innerHTML += content;
  } else {
    dom.installerConsoleBody.appendChild(document.createTextNode(content));
  }
  dom.installerConsoleBody.scrollTop = dom.installerConsoleBody.scrollHeight;
}

// Expose globally for inline onclick handlers & notifications
window.openInstallerModal = openInstallerModal;
window.installCli = installCli;
