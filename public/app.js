// State
const STORAGE_KEY_COLLAPSED = 'hrg_collapsed_projects';
const STORAGE_KEY_SHOW_TASKLESS = 'hrg_show_taskless_folders';

function loadCollapsedProjects() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_COLLAPSED);
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return new Set();
}

function saveCollapsedProjects() {
  try {
    localStorage.setItem(STORAGE_KEY_COLLAPSED, JSON.stringify([...state.collapsedProjects]));
  } catch {}
}

function loadShowTasklessFolders() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SHOW_TASKLESS);
    if (raw !== null) return raw === 'true';
  } catch {}
  return true;
}

function saveShowTasklessFolders() {
  try {
    localStorage.setItem(STORAGE_KEY_SHOW_TASKLESS, String(state.showTasklessFolders));
  } catch {}
}

let state = {
  rootDirectory: '',
  projects: [],
  activeProject: '',
  tasks: [],
  // Bis zu vier Konsolenfelder: pro Auftrag ein Stream, ein Feld. `panes` hält die Task-IDs.
  streams: new Map(),
  panes: [null, null, null, null],
  // Das Feld, in dem der Nutzer zuletzt Maus oder Tastatur benutzt hat. Dorthin zieht
  // der nächste Auftrag — nicht in das, in dem er gerade liest.
  letztesFeld: null,
  // Jeder Composer gehört zu einem Feld: Zielordner und das zuletzt angefasste Feld.
  paneTarget: [null, null, null, null],
  paneRouting: ['auto', 'auto', 'auto', 'auto'],
  // Das Protokoll eines fortgesetzten Auftrags: der neue Lauf zieht zurück in sein Feld.
  fortsetzung: [],
  // Auftrag => Feld, in dessen Ordner er wartet. Er bekommt kein eigenes Feld.
  wartendIn: {},
  clis: [],
  harnessRegistry: {},
  dispatch: { max_concurrent: 0 },
  health: [],
  modelPresets: {},
  modelTests: {},
  // Gemerkter Ordnerzustand; ohne gespeicherte Wahl sind alle aufgeklappt.
  collapsedProjects: loadCollapsedProjects(),
  // Gemerkte Sichtbarkeit von Ordnern ohne Aufgaben.
  showTasklessFolders: loadShowTasklessFolders(),
  // Seitenleiste: ab zwei Konsolen eingeklappt. `sidebarMode` merkt den Modus, damit
  // die Automatik nur beim Wechsel zwischen „einzeln" und „mehrspaltig" greift.
  sidebarCollapsed: false,
  sidebarMode: null,
  // Das Feld, dessen Schließen gerade im Dialog zur Wahl steht.
  pendingCloseSlot: null,
  // Archivierte Aufträge sind eingepackt, nicht gelöscht — erst der Schalter zeigt sie.
  showArchived: false,
  activeAgentsTab: 'rootDev',
  agentsData: null,
  usageData: null,
  ws: null,
  schedules: [],
  installerTools: [],
  installingTools: new Set(),
  isInstallingAll: false
};

// DOM Elements
const dom = {
  // Navigation / Quick triggers
  topOpenSettingsBtn: document.getElementById('top-open-settings-btn'),

  // Root Directory & Tree
  rootDirDisplay: document.getElementById('root-dir-display'),
  rootDirText: document.getElementById('root-dir-text'),
  rootAgentsBadge: document.getElementById('root-agents-badge'),
  rootAgentsText: document.getElementById('root-agents-text'),
  refreshTreeBtn: document.getElementById('refresh-tree-btn'),
  projectTree: document.getElementById('project-tree'),
  projectsCountBadge: document.getElementById('projects-count-badge'),

  // Studio & Konsolen (Split-View, zwei Felder — je eines zum Tippen)
  runPanes: [0, 1, 2, 3].map((i) => {
    const root = document.getElementById(`run-pane-${i}`);
    if (!root) return null;
    const memoryPanel = document.getElementById(`memory-pane-${i}`);
    if (!memoryPanel) return null;
    return {
      root, memoryPanel,
      title: root.querySelector('.run-pane-title'),
      harness: root.querySelector('.run-pane-harness'),
      folder: root.querySelector('.run-pane-folder'),
      body: root.querySelector('.run-pane-body'),
      copy: root.querySelector('.run-pane-copy'),
      cancel: root.querySelector('.run-pane-cancel'),
      close: root.querySelector('.run-pane-close'),
      target: root.querySelector('.run-pane-target'),
      routing: root.querySelector('.run-pane-routing'),
      beads: memoryPanel.querySelector('.run-pane-beads'),
      memoryStatus: memoryPanel.querySelector('.run-pane-memory-status'),
      backupStatus: memoryPanel.querySelector('.run-pane-backup-status'),
      memoryRecovery: memoryPanel.querySelector('.run-pane-memory-recovery'),
      withoutBeads: memoryPanel.querySelector('.run-pane-without-beads'),
      input: root.querySelector('.run-pane-input'),
      send: root.querySelector('.run-pane-send')
    };
  }),
  runSplit: document.getElementById('run-split'),
  sidebarCollapse: document.getElementById('sidebar-collapse'),
  sidebarExpand: document.getElementById('sidebar-expand'),
  paneCloseDialog: document.getElementById('pane-close-dialog'),
  paneCloseDismiss: document.getElementById('pane-close-dismiss'),
  paneCloseKeep: document.getElementById('pane-close-keep'),
  paneCloseAbort: document.getElementById('pane-close-abort'),
  archiveFilterBtn: document.getElementById('archive-filter-btn'),
  archiveCountText: document.getElementById('archive-count-text'),

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
  maxConcurrentInput: document.getElementById('max-concurrent-input'),
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
  installerCardsGrid: document.getElementById('installer-cards-grid'),

  // Sidebar-Footer & Seitenleiste
  sidebarSettingsBtn: document.getElementById('sidebar-settings-btn'),
  settingsOpenInstallerBtn: document.getElementById('settings-open-installer-btn')
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
  if (!await ensureAccess()) return;
  setupWebSocket();
  setupEventListeners();

  // Load workspace immediately so projects appear in < 30ms!
  loadWorkspace().then(refreshRunPool);
  loadModelPresets();
  loadStatus();
  loadAgentsMd();
  loadSkills();
  loadUsage();
  loadRemoteConfig();
  loadSchedules();
  loadInstallerStatus();
});

// LAN-Anmeldung vor dem ersten Zugriff auf geschützte Daten.
async function ensureAccess() {
  const dialog = document.getElementById('access-dialog');
  try {
    const response = await fetch('/api/access');
    const data = await response.json();
    if (response.ok && data.authorized) return true;
  } catch {
    document.getElementById('access-error').textContent = 'Server nicht erreichbar. Seite nach dem Serverstart neu laden.';
  }
  if (dialog && !dialog.open) dialog.showModal();
  return false;
}
const accessForm = document.getElementById('access-form');
accessForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.getElementById('access-code');
  const error = document.getElementById('access-error');
  const button = accessForm.querySelector('button');
  button.disabled = true;
  try {
    const response = await fetch('/api/access/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: input.value }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    input.value = '';
    window.location.reload();
  } catch (err) {
    error.textContent = err.message;
    input.setAttribute('aria-invalid', 'true');
    input.focus();
  } finally { button.disabled = false; }
});
document.getElementById('access-code')?.addEventListener('input', (event) => {
  event.target.removeAttribute('aria-invalid');
  document.getElementById('access-error').textContent = '';
});
document.getElementById('access-dialog')?.addEventListener('cancel', (event) => event.preventDefault());

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

  const ready = state.health.filter(h => h.available).length;
  const summary = document.getElementById('diagnostics-summary');
  if (summary) summary.textContent = `${ready}/${state.health.length} bereit`;

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
    refreshRunPool();
  };

  state.ws.onclose = () => {
    setTimeout(async () => { if (await ensureAccess()) setupWebSocket(); }, 2000);
  };

  state.ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'task_created') {
      // Wiederholte Bestätigungen dürfen den Lauf nicht hinter sich selbst einreihen.
      if (state.streams.has(data.task.id) || state.wartendIn[data.task.id] !== undefined) {
        renderProjectTree();
        return;
      }
      // Prepend task to task list if not exists
      const existingIdx = state.tasks.findIndex(t => t.id === data.task.id);
      if (existingIdx === -1) {
        state.tasks.unshift(data.task);
      } else {
        state.tasks[existingIdx] = data.task;
      }
      // Der Auftrag hat sofort beim Einreichen sein Feld — auch wenn er danach wartet.
      // Die Harness-Bezeichnung kommt erst mit route_selected, vorher wäre sie geraten.
      const Stelle = state.fortsetzung.findIndex((f) => data.task.requestId
        ? f.requestId === data.task.requestId
        : f.prompt === data.task.prompt);
      const pending = Stelle === -1 ? null : state.fortsetzung.splice(Stelle, 1)[0];
      const besitzerSlot = slotFuerOrdner(data.task.projectPath);
      if (besitzerSlot !== undefined) {
        const besitzer = streamAtSlot(besitzerSlot);
        besitzer.wartende = (besitzer.wartende || []).concat([{ taskId: data.task.id, prompt: data.task.prompt }]);
        state.wartendIn[data.task.id] = besitzerSlot;
        renderRunPane(besitzerSlot);
      } else {
        const born = openRunPane(data.task.id, {
          prompt: data.task.prompt,
          folder: data.task.projectName || '',
          path: data.task.projectPath || '',
          startedAt: Date.parse(data.task.timestamp) || Date.now(),
          fortsetzung: pending
        });
        renderRunPane(born.slot);
      }
      renderProjectTree();
    } else if (data.type === 'route_selected') {
      const feld = state.wartendIn[data.taskId];
      let uebergabe = null;
      if (feld !== undefined) {
        delete state.wartendIn[data.taskId];
        const besitzer = waitingOwner(data.taskId);
        if (besitzer) {
          besitzer.wartende = (besitzer.wartende || []).filter((w) => w.taskId !== data.taskId);
          if (state.panes[besitzer.slot] === besitzer.taskId) {
            uebergabe = { slot: besitzer.slot, buffer: besitzer.buffer, folge: besitzer.folge, naht: RUN_UEBERGABE };
          }
        }
      }
      const task = state.tasks.find(t => t.id === data.taskId);
      const stream = state.streams.get(data.taskId)
        || openRunPane(data.taskId, { prompt: task?.prompt || '', path: task?.projectPath || data.projectPath || '', folder: task?.projectName || '', fortsetzung: uebergabe });
      stream.status = 'running';
      stream.title = `${data.harness} · ${data.model || 'Standard'}`;
      const pane = dom.runPanes[stream.slot];
      if (pane && state.panes[stream.slot] === data.taskId) pane.root.title = data.agentsInfo || '';
      // Die Seitenleiste nannte die erste Route der Kette; jetzt gilt die gewaehlte.
      if (task) {
        task.harness = data.harness;
        task.command = data.command;
        task.model = data.model || 'Standard';
        task.status = 'running';
        if (stream.folge) {
          stream.folge = { projectPath: task.projectPath, harness: task.harness, model: task.model, previousTaskId: task.id, beadId: task.beadId };
        }
      }
      renderRunPane(stream.slot, stream.taskId);
      renderProjectTree();
    } else if (data.type === 'queued') {
      const feld = state.wartendIn[data.taskId];
      if (feld !== undefined) {
        const besitzer = waitingOwner(data.taskId);
        const eintrag = (besitzer?.wartende || []).find((w) => w.taskId === data.taskId);
        if (eintrag) eintrag.message = data.message || 'Warteschlange';
        if (besitzer) renderRunPane(besitzer.slot, besitzer.taskId);
      } else {
        const stream = state.streams.get(data.taskId) || openRunPane(data.taskId);
        stream.status = 'queued';
        appendRunOutput(stream, `<div class="run-queue-note">[${escapeHtml(data.message || 'Warteschlange')}]</div>\n`);
        renderRunPane(stream.slot, stream.taskId);
      }
    } else if (data.type === 'backup_status') {
      for (const pane of dom.runPanes) if (pane?.target.value === data.projectPath) renderBackupStatus(pane, data.backup);
    } else if (data.type === 'context_status') {
      for (const pane of dom.runPanes) if (pane?.target.value === data.projectPath) renderMemoryStatus(pane, data);
    } else if (data.type === 'output') {
      const stream = state.streams.get(data.taskId) || openRunPane(data.taskId);
      appendRunOutput(stream, data.html || data.raw);
      const task = state.tasks.find(t => t.id === data.taskId);
      if (task) {
        task.outputHtml = (task.outputHtml || '') + (data.html || data.raw);
      }
    } else if (data.type === 'abbruch_laeuft') {
      const stream = state.streams.get(data.taskId);
      if (stream) { stream.cancelling = true; renderRunPane(stream.slot, stream.taskId); }
    } else if (['done', 'error', 'cancelled'].includes(data.type)) {
      const status = TaskState.fromMessage(data);
      const feld = state.wartendIn[data.taskId];
      if (feld !== undefined) {
        delete state.wartendIn[data.taskId];
        const owner = waitingOwner(data.taskId);
        if (owner) {
          owner.wartende = (owner.wartende || []).filter((task) => task.taskId !== data.taskId);
          renderRunPane(owner.slot, owner.taskId);
        }
      }
      const stream = state.streams.get(data.taskId);
      const finishedTask = state.tasks.find(task => task.id === data.taskId);
      if (stream) {
        if (finishedTask?.projectPath && finishedTask.harness) {
          stream.folge = { projectPath: finishedTask.projectPath, harness: finishedTask.harness, model: finishedTask.model || null, previousTaskId: finishedTask.id, beadId: finishedTask.beadId };
        }
        stream.status = status === 'completed' ? 'done' : status;
        stream.cancelling = false;
        if (data.message) {
          const color = status === 'completed' ? 'var(--success)' : status === 'cancelled' ? 'var(--warning)' : 'var(--danger)';
          stream.buffer += `\n<div style="color:${color}; font-weight:600; margin-top:8px;">[${escapeHtml(data.message)}]</div>\n`;
        }
        renderRunPane(stream.slot, stream.taskId);
      }
      const task = state.tasks.find(t => t.id === data.taskId);
      if (task) {
        task.status = status;
        task.exitCode = data.exitCode;
        if (data.usage) task.usage = data.usage;
      }
      renderProjectTree();
      loadUsage();
      refreshRunPool();
    } else if (data.type === 'task_archived') {
      // Ein anderes Fenster hat eingepackt oder zurückgeholt — die Liste zieht nach.
      const task = state.tasks.find((t) => t.id === data.taskId);
      if (task) task.archived = Boolean(data.archived);
      renderProjectTree();
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

// --- KONSOLEN-LESART ---
// Der Stream ist reiner Text; die Leseschichten stecken in den Markern, die die
// Harnesses selbst schreiben. Das Zerlegen wohnt in konsole-schichten.js, damit es
// ohne Browser prüfbar bleibt. Der Puffer malt bei jedem Chunk alles neu, also muss
// sich der Lauf merken, was der Nutzer selbst aufgemacht hat — sonst fällt jeder
// Ordner beim nächsten Textstück wieder zu.
function konsoleHtml(stream) {
  if (!stream.buffer) return '';
  if (!stream.formatierer) stream.formatierer = new KonsoleSchichten.KonsoleFormatierer();
  const html = stream.formatierer.HTML({
    html: stream.buffer,
    lebt: stream.status === 'running' || stream.status === 'queued',
    offen: stream.falten
  });
  // Eine Antwort beendet die vorherige Arbeit; alte Wünsche gelten danach nicht mehr.
  for (const key of stream.formatierer.autoGeschlossen || []) {
    if (stream.falten) delete stream.falten[key];
  }
  // Was gerade gemalt ist, ist keine Nutzerwahl: der Browser meldet das Einfügen
  // eines offenen Ordners ebenfalls als toggle. Nur die Abweichung zählt.
  stream.faltenspuren = {};
  for (const block of stream.formatierer.blocks) stream.faltenspuren[block.schluessel] = block.offen;
  return html;
}

// --- RUN PANES (SPLIT-VIEW) ---
// Bis zu vier Konsolenfelder im Raster. Ein Auftrag zieht in das Feld, das leer ist
// oder einen beendeten Lauf zeigt; Meldungen sind über die Task-ID zugeordnet, deshalb
// schreibt ein Lauf nie in die Konsole eines anderen.
const RUN_PANE_COUNT = 4;
const runPaneFollow = [true, true, true, true];

const RUN_LEERTEXT = {
  queued: 'Wartet auf einen freien Platz…',
  running: 'Startet…',
  done: 'Keine Ausgabe für diesen Auftrag.',
  error: 'Keine Ausgabe für diesen Auftrag.',
  failed: 'Auftrag fehlgeschlagen.',
  incomplete: 'Auftrag unterbrochen.',
  cancelled: 'Auftrag abgebrochen.'
};

// Die Naht zwischen dem übernommenen Protokoll und dem neuen Lauf.
const RUN_FORTSETZUNG = '<div class="run-pane-fortsetzung">↓ fortgesetzt</div>';
const RUN_UEBERGABE = '<div class="run-pane-fortsetzung">↓ aus der Warteschlange</div>';

function streamAtSlot(slot) {
  const taskId = state.panes[slot];
  return taskId ? state.streams.get(taskId) || null : null;
}

function isBeendet(taskId) {
  const stream = state.streams.get(taskId);
  return !stream || TaskState.terminal(stream.status);
}

// Das Feld für einen neuen Auftrag. Die Reihenfolge ist Absicht:
//   1. Ein leeres Feld — dort geht nichts verloren.
//   2. Das Feld, in dem der Nutzer zuletzt Maus oder Tastatur benutzt hat. Damit zeigt
//      er, wohin der nächste Auftrag soll — auch wenn dort noch ein Lauf steht.
//   3. Ohne diese Wahl: ein beendeter Lauf weicht, sonst der ältere.
function freeSlot() {
  const leer = state.panes.findIndex((id) => id === null);
  if (leer !== -1) return leer;

  // Streng auf gültige Indizes prüfen: `null >= 0` ist in JS wahr, ein ungesetztes
  // Feld würde sonst als gültige Wahl durchgehen.
  const gewaehlt = state.letztesFeld;
  if (typeof gewaehlt === 'number' && gewaehlt >= 0 && gewaehlt < state.panes.length) return gewaehlt;

  const beendet = state.panes.findIndex((id) => isBeendet(id));
  if (beendet !== -1) return beendet;
  // Ohne beendeten Lauf weicht der älteste gestartete Auftrag.
  let aeltester = 0;
  let aeltesteZeit = Infinity;
  state.panes.forEach((id, i) => {
    const zeit = state.streams.get(id)?.startedAt ?? 0;
    if (zeit < aeltesteZeit) { aeltesteZeit = zeit; aeltester = i; }
  });
  return aeltester;
}

// Ein Ordner gehört in eine Konsole: arbeitet dort schon ein Auftrag, wartet der
// nächste unter ihm in demselben Feld, statt in ein anderes zu wandern.
function slotFuerOrdner(path) {
  if (!path) return undefined;
  for (let i = 0; i < state.panes.length; i += 1) {
    const s = streamAtSlot(i);
    if (s && s.path === path && !TaskState.terminal(s.status)) return i;
  }
  return undefined;
}

function wartendeHtml(stream) {
  return (stream.wartende || [])
    .map((w) => `<div class="run-wartende">⏳ <strong>${escapeHtml((w.prompt || '').slice(0, 46))}</strong>${w.message ? ` — ${escapeHtml(w.message)}` : ''}</div>`)
    .join('');
}

function waitingOwner(taskId) {
  return [...state.streams.values()].find(stream => stream.wartende?.some(task => task.taskId === taskId));
}

function openRunPane(taskId, init = {}) {
  const bestehend = state.streams.get(taskId);
  if (bestehend && state.panes.includes(taskId)) return bestehend;

  // Ein Auftrag aus der Fortsetzung zieht in sein Feld zurück, damit das alte Protokoll
  // nicht allein in einer Konsole steht — ist das Feld belegt, nimmt er den freien Platz.
  const gewollt = init.fortsetzung;
  const slot = gewollt && (state.panes[gewollt.slot] === null || isBeendet(state.panes[gewollt.slot]))
    ? gewollt.slot
    : freeSlot();
  // Verdrängte Streams bleiben erreichbar: späte Ereignisse dürfen kein Feld neu belegen.

  const stream = Object.assign(
    { taskId, slot, buffer: '', status: 'queued', title: '', folder: '', prompt: '', falten: {}, startedAt: Date.now() },
    bestehend || {},
    init,
    { slot }
  );
  delete stream.fortsetzung;
  if (gewollt && slot === gewollt.slot) {
    stream.folge = gewollt.folge;
    stream.buffer = `${gewollt.buffer}${gewollt.naht || RUN_FORTSETZUNG}`;
  }
  state.streams.set(taskId, stream);
  state.panes[slot] = taskId;
  const pane = dom.runPanes[slot];
  pane.newTask = false;
  revealPane(slot);
  if (stream.path) state.paneTarget[slot] = stream.path;
  if (stream.path && [...pane.target.options].some(option => option.value === stream.path)) {
    if (pane.target.value !== stream.path) {
      pane.target.value = stream.path;
      loadBeads(pane);
    }
  }
  runPaneFollow[slot] = true;
  return stream;
}

function revealPane(slot) {
  const pane = dom.runPanes[slot];
  if (!pane) return;
  pane.root.hidden = false;
  pane.memoryPanel.hidden = false;
  renderMemorySummary();
  layoutPanes();
}

// --- RASTER & SEITENLEISTE ---
// Das Raster richtet sich nach der Zahl sichtbarer Felder: 1 = volle Fläche,
// 2 = nebeneinander, 3–4 = 2×2. Der ×-Knopf erscheint erst, wenn mehr als ein
// Feld offen ist — die letzte Konsole lässt sich nicht schließen.
function visiblePaneCount() {
  return dom.runPanes.filter((pane) => pane && !pane.root.hidden).length;
}

function layoutPanes() {
  const visible = dom.runPanes.filter((pane) => pane && !pane.root.hidden);
  const count = visible.length;
  if (dom.runSplit) dom.runSplit.dataset.panes = String(count);
  dom.runPanes.forEach((pane) => {
    if (!pane) return;
    if (pane.close) pane.close.hidden = count <= 1;
    pane.root.classList.remove('run-pane-wide');
  });
  if (count === 3 && visible[2]) {
    visible[2].root.classList.add('run-pane-wide');
  }
  updateSidebarMode();
}

// Ab zwei Konsolen klappt die Seitenleiste ein. Die Automatik greift nur beim Wechsel
// zwischen „einzeln" und „mehrspaltig", damit ein manuelles Ausklappen erhalten bleibt,
// wenn eine dritte Konsole dazukommt.
function updateSidebarMode() {
  const mode = visiblePaneCount() >= 2 ? 'mehrspaltig' : 'einzeln';
  if (mode === state.sidebarMode) return;
  state.sidebarMode = mode;
  setSidebarCollapsed(mode === 'mehrspaltig');
}

function setSidebarCollapsed(collapsed) {
  state.sidebarCollapsed = Boolean(collapsed);
  document.querySelector('.app-layout')?.classList.toggle('sidebar-collapsed', state.sidebarCollapsed);
  if (dom.sidebarExpand) dom.sidebarExpand.hidden = !state.sidebarCollapsed;
}

function toggleSidebar() {
  setSidebarCollapsed(!state.sidebarCollapsed);
}

// Ein Feld schließen: die Ausgabe verschwindet, der Lauf bleibt als Stream erhalten und
// landet normal in der Historie. Läuft der Auftrag noch, entscheidet der Dialog.
function hideRunPane(slot) {
  state.panes[slot] = null;
  const pane = dom.runPanes[slot];
  if (pane) {
    pane.root.hidden = true;
    pane.memoryPanel.hidden = true;
  }
  renderRunPane(slot);
  renderMemorySummary();
  renderProjectTree();
  layoutPanes();
}

function closeRunPane(slot) {
  const stream = streamAtSlot(slot);
  if (!stream || TaskState.terminal(stream.status)) {
    hideRunPane(slot);
    return;
  }
  state.pendingCloseSlot = slot;
  if (dom.paneCloseDialog && typeof dom.paneCloseDialog.showModal === 'function') {
    dom.paneCloseDialog.showModal();
  } else {
    // Ohne Dialog (z. B. im Test) läuft der Auftrag im Hintergrund weiter — nie abbrechen.
    hideRunPane(slot);
  }
}

function confirmClosePane(abbrechen) {
  const slot = state.pendingCloseSlot;
  if (slot === null || slot === undefined) return;
  if (abbrechen) {
    const taskId = state.panes[slot];
    if (taskId && state.ws) state.ws.send(JSON.stringify({ type: 'cancel', taskId }));
  }
  hideRunPane(slot);
  state.pendingCloseSlot = null;
  if (dom.paneCloseDialog?.open) dom.paneCloseDialog.close();
}

function scrollRunPaneToBottom(slot) {
  const pane = dom.runPanes[slot];
  if (!runPaneFollow[slot] || !pane) return;
  pane.body.scrollTop = pane.body.scrollHeight;
}

function renderRunPane(slot, expectedTaskId) {
  if (expectedTaskId && state.panes[slot] !== expectedTaskId) return;
  const pane = dom.runPanes[slot];
  const stream = streamAtSlot(slot);
  if (!pane) return;

  if (!stream) {
    pane.title.textContent = '';
    pane.title.hidden = true;
    pane.harness.textContent = '';
    pane.folder.textContent = '';
    pane.cancel.hidden = true;
    return;
  }

  // Der Ordner ist der Haupttitel; die Aufgabe bleibt darunter als Unterzeile.
  pane.title.textContent = stream.prompt
    ? stream.prompt.replace(/\s+/g, ' ').trim()
    : (stream.title || 'Auftrag');
  pane.title.hidden = false;
  const task = state.tasks.find(item => item.id === stream.taskId);
  const model = task?.model || (stream.title ? stream.title.split(' · ').slice(1).join(' · ') || 'Standard' : '');
  pane.harness.innerHTML = stream.title
    ? `${taskHarnessIcon(task || { harness: stream.title.split(' · ')[0] })}<span class="run-pane-model" title="${escapeHtml(model)}">${escapeHtml(model)}</span>`
    : '';
  pane.harness.title = stream.title || '';
  pane.folder.textContent = stream.folder || '';
  pane.cancel.hidden = TaskState.terminal(stream.status);
  pane.cancel.disabled = Boolean(stream.cancelling);
  pane.cancel.setAttribute('aria-label', stream.cancelling ? 'Bricht ab…' : 'Auftrag abbrechen');
  pane.cancel.title = stream.cancelling ? 'Bricht ab…' : 'Nur diesen Auftrag abbrechen';
  const grund = konsoleHtml(stream)
    || `<div class="terminal-placeholder">${RUN_LEERTEXT[stream.status] || 'Kein Auftrag.'}</div>`;
  pane.body.innerHTML = grund + wartendeHtml(stream);
  scrollRunPaneToBottom(slot);
}

function appendRunOutput(stream, htmlContent) {
  const pane = dom.runPanes[stream.slot];
  stream.buffer += htmlContent;
  if (!pane || state.panes[stream.slot] !== stream.taskId) return;
  pane.body.innerHTML = konsoleHtml(stream) + wartendeHtml(stream);
  scrollRunPaneToBottom(stream.slot);
  // Ersetzt der Chunk den Inhalt, wird neu umgebrochen: die Endhöhe kennt das Layout
  // erst im nächsten Frame, also einmal nachziehen.
  requestAnimationFrame(() => {
    if (state.panes[stream.slot] === stream.taskId) scrollRunPaneToBottom(stream.slot);
  });
}

// Auto-follow pro Feld: wer in einem Lauf mitliest, liest mit; wer hochscrollt, liest
// in Ruhe weiter — das andere Feld bleibt davon unberührt.
function setupRunPanes() {
  dom.runPanes.forEach((pane, slot) => {
    if (!pane) return;

    pane.body.addEventListener('scroll', () => {
      const b = pane.body;
      runPaneFollow[slot] = b.scrollHeight - b.scrollTop - b.clientHeight < 40;
    });

    // Welches Feld der Nutzer zuletzt angefasst hat, ist sein Feld: dorthin zieht der
    // nächste Auftrag. Nur echte Maus- und Tastaturereignisse zählen — ein Klick im
    // Baum tut das nicht, sonst landete der zweite Auftrag im selben Feld wie der erste.
    const merken = () => { state.letztesFeld = slot; };
    pane.root.addEventListener('mousedown', merken);
    pane.root.addEventListener('focusin', merken);
    pane.root.addEventListener('wheel', merken, { passive: true });

    // Was der Nutzer selbst aufklappt, überlebt den nächsten Chunk: toggle bubblt
    // nicht, also im Erfassen zuhören. Ein Ordner, der beim Neusetzen aus dem Feld
    // fällt, meldet noch einmal — wer nicht mehr im Feld liegt, schreibt nichts.
    pane.body.addEventListener('toggle', (e) => {
      const ordner = e.target.closest?.('[data-schluessel]');
      const stream = streamAtSlot(slot);
      if (!ordner || !stream || !ordner.isConnected) return;
      const schluessel = ordner.dataset.schluessel;
      if (stream.faltenspuren?.[schluessel] === ordner.open) return;
      stream.falten[schluessel] = ordner.open;
    }, true);

    pane.copy.addEventListener('click', async () => {
      const feedback = (name, label) => {
        pane.copy.innerHTML = `<span aria-hidden="true">${icon(name)}</span>`;
        pane.copy.setAttribute('aria-label', label);
        pane.copy.title = label;
      };
      try {
        await navigator.clipboard.writeText(pane.body.innerText);
        feedback('check', 'Ausgabe kopiert');
      } catch {
        feedback('x', 'Kopieren fehlgeschlagen');
      }
      clearTimeout(pane.copyFeedbackTimer);
      pane.copyFeedbackTimer = setTimeout(() => feedback('copy', 'Ausgabe kopieren'), 1500);
    });

    pane.cancel.addEventListener('click', () => {
      const taskId = state.panes[slot];
      if (!taskId || !state.ws) return;
      state.ws.send(JSON.stringify({ type: 'cancel', taskId }));
    });

    pane.close?.addEventListener('click', () => closeRunPane(slot));

    // Der Composer gehört zum Feld: hier tippen, hier senden, hierher der Auftrag.
    window.HarnessImages.setup(pane.root);
    pane.root.querySelector('.run-pane-context-preview').addEventListener('click', () => previewPrompt(slot));
    pane.send.addEventListener('click', () => sendPrompt(slot));
    pane.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        sendPrompt(slot);
      }
    });
    pane.target.addEventListener('change', () => {
      state.paneTarget[slot] = pane.target.value;
      loadBeads(pane);
    });
    pane.routing.addEventListener('change', () => {
      state.paneRouting[slot] = pane.routing.value;
    });
  });
}

// Jedes Feld schickt in seinen eigenen Ordner. Die Liste kommt aus dem Workspace;
// eine bewusste Wahl bleibt, solange es den Ordner noch gibt, sonst folgt sie dem
// Ziel der Seitenleiste.
function syncPaneTargets() {
  const bekannt = state.projects.map((p) => p.path);
  const fallback = bekannt.includes(state.activeProject)
    ? state.activeProject
    : bekannt[0] || '';

  dom.runPanes.forEach((pane, slot) => {
    if (!pane || !pane.target) return;
    pane.target.innerHTML = state.projects
      .map((p) => `<option value="${escapeHtml(p.path)}">${escapeHtml(p.name)}</option>`)
      .join('');
    const gewaehlt = bekannt.includes(state.paneTarget[slot]) ? state.paneTarget[slot] : fallback;
    state.paneTarget[slot] = gewaehlt || null;
    if (gewaehlt) pane.target.value = gewaehlt;
    loadBeads(pane);
  });
}

// Ein Auftrag aus der Historie kommt in ein Feld — das mit dem beendeten Lauf weicht.
// Er richtet das Feld auch auf sein Ziel ein: wer ihn anklickt, will dort weitermachen.
function zeigeKonsole(slot) {
  if (slot === -1 || !dom.runPanes[slot]) return;
  dom.runPanes.forEach((pane, i) => {
    if (pane) pane.root.classList.toggle('ist-fokus', i === slot);
  });
  dom.runPanes[slot].root.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function showTaskInPane(task) {
  if (state.panes.includes(task.id)) return;
  const status = task.status === 'running' ? 'running' : (task.status === 'queued' ? 'queued' : task.status === 'completed' ? 'done' : task.status);
  const stream = openRunPane(task.id, {
    prompt: task.prompt,
    folder: task.projectName || (task.projectPath ? task.projectPath.split('/').pop() : ''),
    path: task.projectPath || '',
    title: task.harness ? `${task.harness} · ${task.model || 'Standard'}` : '',
    buffer: task.outputHtml || '',
    status,
    startedAt: Date.parse(task.timestamp) || Date.now()
  });
  const pane = dom.runPanes[stream.slot];
  if (task.projectPath && task.harness) {
    stream.folge = { projectPath: task.projectPath, harness: task.harness, model: task.model || null, previousTaskId: task.id, beadId: task.beadId };
    state.paneTarget[stream.slot] = task.projectPath;
    if (pane && [...pane.target.options].some((o) => o.value === task.projectPath)) {
      pane.target.value = task.projectPath;
    }
  }
  renderRunPane(stream.slot, stream.taskId);
  runPaneFollow[stream.slot] = false;
  if (pane) {
    pane.body.scrollTop = 0;
    pane.root.title = task.agentsInfo || '';
  }
}

// Der Server kennt die Kappe und die Läufe anderer Fenster: Zähler auffrischen und
// Aufträge, die hier noch kein Feld haben, hereinholen.
async function refreshRunPool() {
  let pool;
  try {
    const res = await fetch('/api/runs');
    pool = await res.json();
  } catch {
    return;
  }
  const laeufe = [
    ...(pool.running || []).map((r) => ({ ...r, laufStatus: 'running' })),
    ...(pool.queued || []).map((r) => ({ ...r, laufStatus: 'queued' }))
  ];
  for (const lauf of laeufe) {
    if (!lauf.taskId || state.streams.has(lauf.taskId) || state.wartendIn[lauf.taskId] !== undefined) continue;
    const task = state.tasks.find((t) => t.id === lauf.taskId);
    if (!task) continue;
    showTaskInPane({ ...task, status: lauf.laufStatus });
  }
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
    // Status und Modelllisten laden parallel beim Start. Wenn der Status zuerst
    // eintrifft, wird die Einstellungsansicht zunächst mit dem Standard-Fallback
    // gerendert. Nach dem Eintreffen der Presets muss sie erneut aufgebaut werden.
    if (state.clis.length) renderHarnessConfigList();
    updateNewRouteModelOptions();
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
      dom.modelsRefreshText.innerHTML = `<em>Lese Modelle dynamisch aus CLIs (OpenCode, Codex, Qoder)...</em>`;
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
    state.harnessRegistry = Object.fromEntries((data.harnesses || []).map((entry) => [entry.id, entry]));
    state.clis = data.clis || [];
    document.getElementById('codex-unsafe-input').checked = data.execution?.codexUnsafe === true;
    state.dispatch = data.dispatch || state.dispatch;
    // Das Feld soll zeigen, was gespeichert ist — nicht, was zuletzt geklickt wurde.
    if (dom.maxConcurrentInput) {
      const kappe = Number(state.dispatch && state.dispatch.max_concurrent) || 0;
      dom.maxConcurrentInput.value = kappe ? String(kappe) : '';
    }

    renderHarnessStatusPills();
    renderHarnessOverrideSelect();
    renderHarnessConfigList();
  } catch (err) {
    console.error("Fehler beim Laden des Status:", err);
  }
}

function renderHarnessStatusPills() {
  if (!dom.harnessStatusPills) return;
  dom.harnessStatusPills.innerHTML = '';
  state.health.forEach(h => {
    const pill = document.createElement('div');
    pill.className = `status-pill ${h.available ? 'online' : 'offline'}`;
    pill.innerHTML = `
      <span class="dot"></span>
      <span>${escapeHtml(h.name)}</span>
    `;
    dom.harnessStatusPills.appendChild(pill);
  });
}

function renderHarnessOverrideSelect() {
  // Routing ist pro Konsole: jeder Composer hat sein eigenes Feld (Default Auto).
  const selects = dom.runPanes.map(p => p && p.routing).filter(Boolean);
  selects.forEach((select) => {
    const previous = select.value;
    select.innerHTML = `
      <option value="auto">Auto-Route</option>
      <option value="consensus">Konsens</option>
    `;
    state.clis.forEach(c => {
      if (c.enabled !== false && c.capabilities?.dispatchable !== false) {
        const opt = document.createElement('option');
        opt.value = c.name;
        const modelStr = (c.model && c.model !== 'Standard') ? ` [${c.model}]` : '';
        opt.textContent = `${c.name} (${c.command})${modelStr}`;
        select.appendChild(opt);
      }
    });
    // Wählt der Nutzer gerade ein konkreter Harness aus, bleibt er; sonst Auto.
    select.value = (previous && selects && [...select.options].some(o => o.value === previous)) ? previous : 'auto';
  });
}

function getHarnessKey(item) {
  if (item.harnessId === 'claude') return 'claude_code';
  if (item.harnessId === 'antigravity') return 'antigravity_cli';
  if (item.harnessId && state.modelPresets[item.harnessId]) return item.harnessId;
  if (item.harness && state.modelPresets[item.harness]) return item.harness;
  if (item.command === 'claude') return 'claude_code';
  if (item.command === 'codex') return 'codex';
  if (item.command === 'cline') return 'cline';
  if (item.command === 'opencode') return 'opencode';
  if (item.command === 'agy') return 'antigravity_cli';
  if (item.command === 'qodercli' || item.command === 'qoder') return 'qoder';
  if (item.command === 'codebuddy' || item.command === 'cbc') return 'codebuddy';
  if (item.command === 'agent' || item.command === 'cursor-agent') return 'cursor';
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
      <div><code title="${escapeHtml(item.capabilities?.limitations || '')}">${escapeHtml(item.command || item.harness || 'cli')}</code></div>
      <div>
        <div class="model-select-wrapper">
          <select class="model-dropdown" data-idx="${index}">
            ${modelOptionsHtml}
          </select>
          <input type="text" class="model-custom-input ${!isPreset && currentModel !== 'Standard' ? '' : 'hidden'}" data-idx="${index}" value="${!isPreset ? escapeHtml(currentModel) : ''}" placeholder="Modell-ID" />
          ${item.capabilities?.modelTest === false ? '' : `<button class="btn-model-test" data-idx="${index}" title="Testet, ob ${escapeHtml(item.model || 'Standard')} über ${escapeHtml(item.command || '')} antwortet">Test</button>`}
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
  permission: 'Freigabe fehlt',
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
      body: JSON.stringify({ harnessId: route.harnessId, model })
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

    updateWorkspaceUI();
    renderProjectTree();
  } catch (err) {
    console.error("Fehler beim Laden des Workspaces:", err);
  }
}

function activeProjectName() {
  const p = state.projects.find(x => x.path === state.activeProject);
  if (p) return p.name;
  return state.activeProject ? state.activeProject.split('/').filter(Boolean).pop() : 'Kein Projekt';
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

  syncPaneTargets();

  if (dom.rootAgentsText) {
    dom.rootAgentsText.textContent = `AGENTS.md aktiv`;
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

  const archiv = state.tasks.filter((t) => t.archived).length;
  if (dom.archiveCountText) dom.archiveCountText.textContent = archiv;
  if (dom.archiveFilterBtn) dom.archiveFilterBtn.classList.toggle('on', state.showArchived);

  // Eingepackte Aufträge sind aus dem Weg, solange das Archiv zu ist. Die Zähler
  // nennen nur, was wirklich zu sehen ist — sonst klickt man auf eine leere Liste.
  const sichtbar = state.tasks.filter((t) => state.showArchived || !t.archived);

  if (state.projects.length === 0) {
    dom.projectTree.innerHTML = '<div class="empty-task-hint">Keine Unterordner in diesem Verzeichnis gefunden.</div>';
    return;
  }

  const taskCount = new Map();
  sichtbar.forEach(t => {
    if (!t.projectPath) return;
    taskCount.set(t.projectPath, (taskCount.get(t.projectPath) || 0) + 1);
  });

  // The sidebar is a task history, not a file browser: folders without tasks stay
  // out of the way, and the current target folder remains visible so switching
  // projects is still possible.
  const hiddenTaskless = state.projects.filter(
    p => !taskCount.get(p.path) && p.path !== state.activeProject
  );
  const visibleProjects = state.showTasklessFolders
    ? state.projects
    : state.projects.filter(p => taskCount.get(p.path) || p.path === state.activeProject);

  if (visibleProjects.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'empty-task-hint';
    hint.textContent = 'Noch kein Ordner mit Tasks.';
    dom.projectTree.appendChild(hint);
  }

  visibleProjects.forEach(p => {
    const projectTasks = sichtbar.filter(t => t.projectPath === p.path);
    // Ohne Tasks gibt es nichts auszuklappen – der Ordner bleibt eine reine Zeile.
    const hasTasks = projectTasks.length > 0;
    const isExpanded = hasTasks && !state.collapsedProjects.has(p.path);
    const isActive = p.path === state.activeProject;

    const node = document.createElement('div');
    node.className = `project-node ${isActive ? 'active' : ''}`;
    node.dataset.path = p.path;

    // Header
    const header = document.createElement('div');
    header.className = 'project-header';
    header.innerHTML = `
      <span class="toggle-arrow">${hasTasks ? (isExpanded ? '▾' : '▸') : ''}</span>
      <span class="folder-icon" data-icon="folder"></span>
      <span class="project-title" title="${escapeHtml(p.path)}">${escapeHtml(p.name)}</span>
      ${hasTasks ? `<span class="project-count" title="${projectTasks.length} Task(s) in diesem Ordner">${projectTasks.length}</span>` : ''}
      ${p.hasAgentsMd ? `<button type="button" class="badge-tag project-agents-btn" title="AGENTS.md für '${escapeHtml(p.name)}' bearbeiten">AGENTS</button>` : ''}
      <button class="add-task-btn" title="Neuen Task in '${escapeHtml(p.name)}' starten">＋</button>
    `;

    // Task List (Indented)
    const taskList = document.createElement('div');
    taskList.className = `task-list ${isExpanded ? '' : 'hidden'}`;

    projectTasks.forEach(task => {
      const isTaskActive = state.panes.includes(task.id);
      const taskItem = document.createElement('div');
      taskItem.className = `task-item ${isTaskActive ? 'active' : ''}`;
      taskItem.dataset.taskId = task.id;

      const timeStr = formatTimestamp(task.timestamp);
      const statusIcon = task.status === 'completed' ? '●' : (task.status === 'running' ? '◐' : '○');

      // Ein laufender Auftrag bleibt unangetastet: einpacken würde ihn vor dem
      // Abbrechen verstecken. Erledigte dürfen ins Archiv.
      const aktion = task.archived
        ? '<button class="task-restore-btn" title="Zurück in die Aufgabenliste" data-icon="inbox"></button>'
        : (TaskState.terminal(task.status)
            ? '<button class="task-archive-btn" title="Ins Archiv legen — die Ausgabe bleibt erhalten" data-icon="archive"></button>'
            : '');

      taskItem.innerHTML = `
        <span class="task-icon">↳</span>
        <div class="task-meta">
          <span class="task-prompt" title="${escapeHtml(task.prompt)}">${escapeHtml(task.prompt)}</span>
          <span class="task-badge"><span class="task-status">${statusIcon}</span>${taskHarnessIcon(task)}<span class="task-model" title="${escapeHtml(task.model || 'Standard')}">${escapeHtml(task.model || 'Standard')}</span><span class="task-time">${timeStr}</span></span>
        </div>
        ${aktion}
      `;

      // Click task: show recorded terminal output
      taskItem.addEventListener('click', (e) => {
        e.stopPropagation();
        selectTask(task);
      });

      const aktionsBtn = taskItem.querySelector('.task-archive-btn, .task-restore-btn');
      if (aktionsBtn) {
        aktionsBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          archiveTask(task, !task.archived);
        });
      }

      taskList.appendChild(taskItem);
    });

    // Toggle expand/collapse or select project
    header.addEventListener('click', (e) => {
      if (e.target.classList.contains('add-task-btn')) {
        e.stopPropagation();
        selectProject(p.path);
        startNewTaskInProject(p.path);
        return;
      }

      if (e.target.closest('.project-agents-btn')) {
        e.stopPropagation();
        openProjectAgents(p.path);
        return;
      }

      if (e.target.classList.contains('toggle-arrow')) {
        e.stopPropagation();
        toggleProjectExpand(p.path);
        return;
      }

      if (p.path === state.activeProject) {
        toggleProjectExpand(p.path);
        return;
      }

      // Anderen Ordner auswählen und aufklappen
      selectProject(p.path);
      state.collapsedProjects.delete(p.path);
      saveCollapsedProjects();
      renderProjectTree();
    });

    node.appendChild(header);
    node.appendChild(taskList);
    dom.projectTree.appendChild(node);
  });

  if (!state.showTasklessFolders && hiddenTaskless.length > 0) {
    const more = document.createElement('button');
    more.className = 'tree-show-more';
    more.textContent = `${hiddenTaskless.length} Ordner ohne Tasks ausgeblendet — einblenden`;
    more.addEventListener('click', () => {
      state.showTasklessFolders = true;
      saveShowTasklessFolders();
      renderProjectTree();
    });
    dom.projectTree.appendChild(more);
  } else if (state.showTasklessFolders && hiddenTaskless.length > 0) {
    const less = document.createElement('button');
    less.className = 'tree-show-more';
    less.textContent = 'Nur Ordner mit Tasks zeigen';
    less.addEventListener('click', () => {
      state.showTasklessFolders = false;
      saveShowTasklessFolders();
      renderProjectTree();
    });
    dom.projectTree.appendChild(less);
  }
}

function toggleProjectExpand(projectPath) {
  if (state.collapsedProjects.has(projectPath)) {
    state.collapsedProjects.delete(projectPath);
  } else {
    state.collapsedProjects.add(projectPath);
  }
  saveCollapsedProjects();
  renderProjectTree();
}

async function openProjectAgents(projectPath) {
  state.activeProject = projectPath;
  state.activeAgentsTab = 'project';
  updateWorkspaceUI();
  renderProjectTree();
  await loadAgentsMd();
  openSettingsModal('agents');
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

// Archivieren ist ein Umzug, kein Löschen: der Server setzt den Flag, jedes Fenster
// blendet die Aufgabe aus der Liste aus (oder wieder ein).
async function archiveTask(task, archived) {
  try {
    const res = await fetch('/api/tasks/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: task.id, archived })
    });
    if (!res.ok) {
      const grund = await res.json().catch(() => ({}));
      alert(grund.error || 'Auftrag nicht geändert.');
      return;
    }
    task.archived = archived;
    renderProjectTree();
  } catch (err) {
    alert('Archiv nicht erreicht: ' + err.message);
  }
}

function selectTask(task) {
  if (task.projectPath && state.activeProject !== task.projectPath) {
    state.activeProject = task.projectPath;
    state.collapsedProjects.delete(task.projectPath);
    saveCollapsedProjects();
    updateWorkspaceUI();
  }

  if (window.innerWidth <= 768 && dom.sidebar) {
    dom.sidebar.classList.remove('open');
    if (dom.mobileDrawerOverlay) dom.mobileDrawerOverlay.classList.remove('active');
  }

  showTaskInPane(task);
  renderProjectTree();
  switchTab('studio');
  // Klick auf einen Auftrag heißt: diese Konsole zeigen. Liegt sie schon in einem
  // Feld, wird sie markiert und hergerollt — sonst fehlt das Gefühl, anzukommen.
  zeigeKonsole(state.panes.indexOf(task.id));
}

// Der neue Auftrag bekommt sein Feld erst mit task_created — hier wird nur der
// Composer vorbereitet: das Feld, das ein neuer Auftrag beim Senden nähme, und
// sein Zielordner sind der angeklickte Ordner.
function startNewTaskInProject(projectPath) {
  switchTab('studio');
  const slot = freeSlot();
  const pane = dom.runPanes[slot];
  if (!pane) return;
  revealPane(slot);
  // ＋ heißt Anfang: kein Auftrag aus der Historie leiht diesem Feld sein Ziel.
  const stream = streamAtSlot(slot);
  if (stream) delete stream.folge;
  pane.newTask = true;
  if (projectPath) {
    state.paneTarget[slot] = projectPath;
    pane.target.value = projectPath;
    loadBeads(pane);
  }
  pane.input.focus();
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
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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
      dom.skillsStatusBadge.textContent = `${data.totalSkills || (data.skills && data.skills.length) || 0} Skills aktiv auf 8 CLI-Zielen`;
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
        `<span class="badge" style="color:var(--text-muted); font-size:10px; padding:1px 6px; border:1px solid var(--border-color); white-space:nowrap;">${escapeHtml(h.name)}</span>`
      ).join(' ');

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
          <div class="skill-title" style="font-size:12.5px; font-weight:600; color:var(--text-main); display:flex; align-items:center; gap:6px;">
            ${escapeHtml(s.displayName || s.name)}
          </div>
          <span class="badge ${s.isFullySynced ? 'badge-success' : 'badge-accent'}" style="font-size:10px; padding:2px 6px; white-space:nowrap;">
            ${s.isFullySynced ? '✓ Hub + 8 CLI-Ziele' : `${(s.activeHarnesses || []).length}/9 Verzeichnisse`}
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
      dom.syncSkillsBtn.innerHTML = '<span data-icon="refresh"></span> Skills für 8 CLI-Ziele synchronisieren';
      if (typeof refreshIcons === 'function') refreshIcons(dom.syncSkillsBtn);
    }
  }
}

async function handleInstallSkill() {
  const isGit = dom.skillTabGit && dom.skillTabGit.classList.contains('active');
  const feedback = dom.skillInstallFeedback;
  if (!feedback) return;
  feedback.style.display = 'block';
  feedback.style.background = 'var(--bg-secondary)';
  feedback.style.border = '1px solid var(--border-color)';
  feedback.style.color = 'var(--text-main)';
  feedback.textContent = 'Installiere Skill und verteile per Symlink auf alle 9 Harnesses...';

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

    feedback.style.color = 'var(--success)';
    feedback.textContent = data.message;

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
    feedback.style.color = 'var(--danger)';
    feedback.textContent = err.message;
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

  // 1. Telemetry Stats Grid
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
              <td style="padding:4px 6px; font-family:var(--font-mono); color:var(--text-main);">${escapeHtml(p.tokensIn)}</td>
              <td style="padding:4px 6px; font-family:var(--font-mono); color:var(--text-main);">${escapeHtml(p.tokensOut)}</td>
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
              <td style="padding:4px 6px; font-family:var(--font-mono); color:var(--text-main);">${inTok}</td>
              <td style="padding:4px 6px; font-family:var(--font-mono); color:var(--text-main);">${outTok}</td>
            </tr>
          `;
        });
        html += `</tbody></table>`;
      }
      dom.opencodeModelsList.innerHTML = html;
    }
  }

  // 5. Settings Table
  renderUsageTable();
}

function renderUsageTable() {
  if (!dom.usageTableBody || !state.usageData) return;
  dom.usageTableBody.innerHTML = '';

  const harnessesOrder = [
    'claude_code',
    'codex',
    'opencode',
    'qoder',
    'codebuddy',
    'antigravity_cli',
    'cline',
    'cursor'
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
        <div><strong style="color:var(--text-main);">${escapeHtml(item.remaining || 'Unbegrenzt')}</strong></div>
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
  // Konsolenfelder: jedes bricht nur seinen eigenen Auftrag ab, jedes tippt für sich
  setupRunPanes();
  layoutPanes();

  // Seitenleiste ein-/ausklappen und das Schließen einer Konsole bestätigen.
  dom.sidebarCollapse?.addEventListener('click', toggleSidebar);
  dom.sidebarExpand?.addEventListener('click', toggleSidebar);
  dom.paneCloseKeep?.addEventListener('click', () => confirmClosePane(false));
  dom.paneCloseAbort?.addEventListener('click', () => confirmClosePane(true));
  dom.paneCloseDismiss?.addEventListener('click', () => {
    state.pendingCloseSlot = null;
    if (dom.paneCloseDialog?.open) dom.paneCloseDialog.close();
  });
  dom.paneCloseDialog?.addEventListener('close', () => { state.pendingCloseSlot = null; });
  document.getElementById('context-preview-close').addEventListener('click', () => document.getElementById('context-preview-dialog').close());
  document.getElementById('user-config-reload').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const status = document.getElementById('user-config-status');
    button.disabled = true; status.textContent = 'Lädt…';
    try {
      const response = await fetch('/api/user-environment/reload', {method:'POST'});
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Neuladen fehlgeschlagen.');
      status.textContent = `Neu geladen · ${data.names.length} Einstellungen · gilt für neue Läufe`;
    } catch (error) { status.textContent = error.message; }
    finally { button.disabled = false; }
  });

  if (dom.archiveFilterBtn) {
    dom.archiveFilterBtn.addEventListener('click', () => {
      state.showArchived = !state.showArchived;
      renderProjectTree();
    });
  }

  if (dom.sidebarSettingsBtn) dom.sidebarSettingsBtn.addEventListener('click', () => openSettingsModal('workspace'));
  if (dom.settingsOpenInstallerBtn) dom.settingsOpenInstallerBtn.addEventListener('click', () => openInstallerModal());

  // Settings Dialog Openers
  if (dom.topOpenSettingsBtn) {
    dom.topOpenSettingsBtn.addEventListener('click', () => openSettingsModal('workspace'));
  }
  if (dom.rootDirDisplay) {
    dom.rootDirDisplay.addEventListener('click', () => openSettingsModal('workspace'));
  }
  if (dom.rootAgentsBadge) {
    dom.rootAgentsBadge.addEventListener('click', () => openSettingsModal('agents'));
  }
  if (dom.harnessStatusPills) {
    dom.harnessStatusPills.addEventListener('click', () => openSettingsModal('diagnostics'));
  }
  if (dom.refreshUsageBtn) {
    dom.refreshUsageBtn.addEventListener('click', () => loadUsage(true));
  }
  if (dom.refreshModelsBtn) {
    dom.refreshModelsBtn.addEventListener('click', () => {
      refreshHarnessModelsOnTabOpen(true);
    });
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

  // Save Settings (Harness Priorities & Models)
  if (dom.saveSettingsBtn) {
    dom.saveSettingsBtn.addEventListener('click', async () => {
      try {
        dom.settingsSaveFeedback.textContent = 'Speichere...';
        // Die Kappe speichert mit: ohne sie würde der Server den alten Wert behalten.
        const kappe = Number(dom.maxConcurrentInput?.value);
        const body = { clis: state.clis, execution: { codexUnsafe: document.getElementById('codex-unsafe-input').checked } };
        if (Number.isFinite(kappe)) {
          body.dispatch = { max_concurrent: Math.min(8, Math.max(0, Math.round(kappe || 0))) };
        }
        const res = await fetch('/api/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (res.ok) {
          dom.settingsSaveFeedback.textContent = 'Gespeichert in ~/.harness-dispatch/config.yaml!';
          renderHarnessOverrideSelect();
          refreshRunPool();
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

        const res = await fetch('/api/agents-md', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            target: target,
            projectPath: state.activeProject,
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

    const harnessId = harnessKey === 'claude_code' ? 'claude'
      : harnessKey === 'antigravity_cli' ? 'antigravity' : harnessKey;
    const registryEntry = state.harnessRegistry[harnessId];
    if (!registryEntry) throw new Error('Unbekanntes Harness');

    const newRoute = {
      name: name,
      harnessId,
      command: registryEntry.commands[0],
      capabilities: registryEntry,
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

function renderMemoryStatus(pane, data) {
  if (!pane.memoryStatus) return;
  const labels = { disabled: 'Ohne Beads', bypassed: 'Beads für diesen Auftrag übersprungen', error: 'Projektgedächtnis nicht verfügbar' };
  pane.memoryStatus.textContent = data.state === 'ready' ? `Beads aktiv · ${data.memoryCount || 0} Erkenntnisse` : (labels[data.state] || 'Projektgedächtnis wird geprüft…');
  pane.memoryStatus.title = data.error || '';
  pane.memoryStatus.dataset.state = data.state || 'loading';
  if (pane.memoryRecovery) pane.memoryRecovery.hidden = data.state !== 'error';
  if (['disabled', 'error', 'bypassed'].includes(data.state)) pane.beads.hidden = true;
  if ('backup' in data || data.state === 'disabled') renderBackupStatus(pane, data.state === 'disabled' ? null : data.backup);
  renderMemorySummary();
}
function renderBackupStatus(pane, backup) {
  if (pane.backupStatus) {
    pane.backupStatus.textContent = !backup ? '' : backup.remote === 'verified' ? 'Sicherung auf NAS bestätigt' :
      backup.local === 'verified' ? (backup.remote === 'disabled' ? 'Lokal gesichert' : 'Lokal gesichert · NAS ausstehend') :
      backup.local === 'error' ? 'Sicherung fehlgeschlagen' : backup.local === 'running' ? 'Sicherung läuft' : 'Noch keine Sicherung';
    pane.backupStatus.title = backup?.remoteError || backup?.error || '';
    pane.backupStatus.dataset.state = backup?.local || '';
    renderMemorySummary();
  }
}

function renderMemorySummary() {
  const summary = document.getElementById('memory-summary');
  const panes = dom.runPanes.filter(pane => pane?.target.value && !pane.root.hidden);
  const states = panes.map(pane => pane.memoryStatus.dataset.state);
  const failed = states.includes('error') || panes.some(pane => pane.backupStatus.dataset.state === 'error');
  summary.dataset.state = failed ? 'error' : states.includes('loading') ? 'loading' : states.includes('ready') ? 'ready' : 'disabled';
  summary.textContent = failed ? 'Problem – Details öffnen' : states.includes('loading') ? 'Wird geprüft…' :
    states.includes('ready') ? 'Automatisch aktiv' : 'Nicht eingerichtet';
  for (const pane of dom.runPanes) {
    if (!pane) continue;
    const project = pane.target.selectedOptions[0]?.textContent || '';
    pane.memoryPanel.querySelector('.memory-pane-title').textContent = project;
    pane.memoryPanel.querySelector('.memory-task-label').hidden = pane.beads.hidden;
  }
}

async function loadBeads(pane) {
  if (!pane.beads) return;
  const project = pane.target.value;
  pane.beads.hidden = true;
  if (pane.withoutBeads) pane.withoutBeads.checked = false;
  renderMemoryStatus(pane, { state: 'loading', backup: null });
  pane.beads.replaceChildren(new Option('Automatisch – keine feste Aufgabe', ''));
  try {
    const response = await fetch(`/api/beads?projectPath=${encodeURIComponent(project)}`);
    const data = await response.json();
    if (pane.target.value !== project) return;
    if (!response.ok) throw new Error(data.error || 'Projektgedächtnis konnte nicht geladen werden');
    renderMemoryStatus(pane, data);
    if (!data.enabled || data.state === 'error') return;
    for (const task of data.tasks || []) pane.beads.add(new Option(`${task.id}: ${task.title}`, task.id));
    pane.beads.hidden = !(data.tasks || []).length;
    renderMemorySummary();
  } catch (error) { if (pane.target.value === project) renderMemoryStatus(pane, { state: 'error', error: error.message }); }
}

// --- DISPATCH TASK ---
// Die Composer sperren nicht: mehrere Aufträge schnell nacheinander einreichen ist der
// Weg, den Pool zu füllen. Die Kappe nimmt der Server, nicht das Fenster.
function promptPayload(slot) {
  const pane = dom.runPanes[slot];
  const prompt = pane.input.value.trim() || (window.HarnessImages.has(pane.root) ? 'Analysiere das beigefügte Bild.' : '');
  const stream = streamAtSlot(slot);
  const folge = !pane.newTask && stream?.folge && pane.target.value === stream.folge.projectPath ? stream.folge : null;

  // Eine bewusste Wahl im Routing-Feld schlägt die Fortsetzung: wer nach dem
  // Anklicken eines alten Laufs einen anderen Harness wählt, meint diesen —
  // sonst wäre die manuelle Einstellung wirkungslos.
  const manuell = pane.routing && pane.routing.value && pane.routing.value !== 'auto'
    ? pane.routing.value : null;

  const payload = {
    type: 'dispatch',
    prompt,
    harnessOverride: manuell || (folge ? folge.harness : (pane.routing ? pane.routing.value : 'auto')),
    projectPath: pane.target.value || state.activeProject
  };
  // Das Modell gehört zum alten Lauf: nur bei dessen Harness übernehmen, nicht
  // bei bewusst anderem Routing — dort gilt das Modell der gewählten Route.
  if (!manuell && folge?.model) payload.modelOverride = folge.model;
  if (folge?.previousTaskId) payload.previousTaskId = folge.previousTaskId;
  if (pane.withoutBeads?.checked) payload.withoutBeads = true;
  else if (pane.beads?.value || folge?.beadId) payload.beadId = pane.beads?.value || folge.beadId;
  return {payload, stream, folge};
}
async function previewPrompt(slot) {
  const pane = dom.runPanes[slot];
  const button = pane.root.querySelector('.run-pane-context-preview');
  const dialog = document.getElementById('context-preview-dialog');
  const summary = document.getElementById('context-preview-summary');
  const content = document.getElementById('context-preview-content');
  const {payload} = promptPayload(slot);
  if (!payload.prompt) { window.HarnessImages.error(pane.root, 'Aufgabe für die Vorschau eingeben.'); return; }
  payload.imageName = window.HarnessImages.name(pane.root);
  button.disabled = true;
  summary.textContent = 'Kontext wird geladen…'; content.textContent = '';
  if (!dialog.open) dialog.showModal();
  try {
    const response = await fetch('/api/context/preview', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Kontext konnte nicht geladen werden.');
    summary.textContent = `${data.characters} / ${data.budget} Zeichen · ${data.sources.length} Regelquellen · ${data.memories} Erinnerungen${data.omittedMemories ? ` · ${data.omittedMemories} ausgelassen` : ''}${data.image ? ' · Bild enthalten' : ''}`;
    content.textContent = data.context;
  } catch (error) { summary.textContent = error.message; }
  finally { button.disabled = false; }
}

async function sendPrompt(slot = 0) {
  const pane = dom.runPanes[slot];
  if (!pane || pane.sending) return;
  const image = window.HarnessImages.has(pane.root);
  const {payload, stream, folge} = promptPayload(slot);
  if (!payload.prompt) return;
  payload.requestId = window.crypto?.randomUUID?.();

  if (state.ws && state.ws.readyState === WebSocket.OPEN) {
    if (image) {
      pane.sending = true;
      const controls = [pane.input, pane.send, pane.target, pane.routing, pane.beads, pane.withoutBeads, pane.root.querySelector('.run-pane-image-remove'), pane.root.querySelector('.run-pane-image-select')].filter(Boolean);
      controls.forEach(control => { control.disabled = true; });
      try {
        payload.imagePath = await window.HarnessImages.upload(pane.root);
        if (state.ws.readyState !== WebSocket.OPEN) throw new Error('Verbindung zum Server unterbrochen. Bild und Text bleiben erhalten.');
      } catch (error) {
        window.HarnessImages.error(pane.root, error.message);
        return;
      } finally {
        pane.sending = false;
        controls.forEach(control => { control.disabled = false; });
      }
    }
    // Vor dem Senden zuordnen: auch eine sofortige Antwort gehört in dieses Feld.
    if (folge && stream) {
      state.fortsetzung.push({
        requestId: payload.requestId, prompt: payload.prompt, slot, buffer: stream.buffer, folge: stream.folge
      });
    }
    state.ws.send(JSON.stringify(payload));
    window.HarnessImages.clear(pane.root);
    pane.input.value = '';
    if (pane.withoutBeads) pane.withoutBeads.checked = false;
    refreshRunPool();
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
    if (c.enabled !== false && c.capabilities?.scheduler !== false) {
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
  codebuddy_cli: 'codebuddy_cli',
  codebuddy: 'codebuddy_cli',
  cursor_cli: 'cursor_cli',
  cursor: 'cursor_cli',
  junie: 'junie_cli', kilo: 'kilo_cli', copilot: 'copilot_cli', kiro: 'kiro_cli', vibe: 'vibe_cli'
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
        dom.installAllMissingBtn.innerHTML = `<span>Alle ${data.total} CLIs installiert</span>`;
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
      statusBadge = `<span class="installer-card-badge status-ok">${tool.limitations ? 'Installiert' : 'Bereit'}</span>`;
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

      <p class="installer-card-desc">${escapeHtml(tool.description || tool.desc || '')}</p>
      ${tool.limitations ? `<p class="installer-card-desc">${escapeHtml(tool.limitations)}</p>` : ''}

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
    alert('Alle registrierten CLIs sind bereits installiert.');
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
window.layoutPanes = layoutPanes;
