# Harness Router GUI - Roadmap 🚀

## Vision
Transform **harness-router-gui** into an intelligent, learning-aware multi-agent orchestrator with extensible skills and episodic memory—while maintaining simplicity and superior UX over enterprise alternatives like CAO.

---

## Phase 1: Skill System with Plugins (Q4 2024)

### Goals
- **Reusable Skills**: Define once, use across all agents
- **Installable**: Skills as versioned packages
- **Declarative**: Skills defined in agent profiles
- **Cross-Provider**: Same skills available to all CLI providers

### Implementation

#### 1.1 Skill Format & Structure
```markdown
skills/
├── git-operations/
│   ├── skill.md          # Skill definition
│   ├── package.json      # Metadata & version
│   └── README.md         # Documentation
├── database-query/
│   ├── skill.md
│   ├── package.json
│   └── README.md
└── code-review/
    ├── skill.md
    ├── package.json
    └── README.md
```

#### 1.2 Skill Definition Format
```yaml
# skills/git-operations/skill.md
---
name: git-operations
version: 1.0.0
author: ysamjo
description: |
  Advanced git operations including rebasing, cherry-picking,
  conflict resolution, and bisect workflows
provider: all
tags: [git, vcs, collaboration]
dependencies: []
---

## Context

You have access to git operations. Key commands:
- `git rebase` - interactive rebasing
- `git cherry-pick` - selective commit picking
- `git bisect` - binary search for bug commits
- `git stash` - temporary storage

## Workflow Patterns

### 1. Feature Branch Rebase
When integrating feature branch changes:
1. Fetch latest from upstream
2. Interactive rebase onto target branch
3. Force-push with confirmation
4. Open PR

### 2. Conflict Resolution
When conflicts occur:
1. List conflicted files
2. Review diffs
3. Resolve manually or auto-merge
4. Stage and continue rebase
```

#### 1.3 Skill Integration in Agent Profile
```markdown
---
name: developer
description: Coding agent with advanced git skills
provider: claude_code
skills:
  - git-operations@1.0.0
  - code-review@latest
  - testing-framework@*
---

You are a developer with the following skills available:
[Skills are automatically injected into system prompt]
```

#### 1.4 Skill Manager Implementation
```typescript
// src/services/SkillManager.ts
interface Skill {
  name: string;
  version: string;
  description: string;
  author: string;
  provider: "all" | string[];
  tags: string[];
  dependencies: string[];
  content: string;  // Markdown body
}

class SkillManager {
  async loadSkill(name: string, version?: string): Promise<Skill>;
  async listSkills(): Promise<Skill[]>;
  async installSkill(url: string): Promise<void>;
  async removeSkill(name: string, version: string): Promise<void>;
  async getSkillsForProfile(profileName: string): Promise<Skill[]>;
  async injectSkillsIntoPrompt(skills: Skill[]): Promise<string>;
}
```

#### 1.5 UI Components
- **Settings Dialog**: Skills tab showing installed skills
  - List of skills with versions
  - Install/Remove buttons
  - Search & filter
  - Enable/Disable per profile
- **Skill Browser**: Browsable catalog with ratings
- **Dependency Visualizer**: Show skill dependencies

### Acceptance Criteria
- [ ] Skills can be defined in `skills/` directory
- [ ] Skills can be installed from local or remote source
- [ ] Skills automatically injected into agent prompts
- [ ] Skills UI in settings shows install/remove/enable
- [ ] Multiple versions of same skill can coexist
- [ ] Skills work across all providers (Claude, Codex, Cline, etc.)
- [ ] Skill dependencies resolved automatically

### Testing
- Unit tests for SkillManager
- Integration tests: Skill injection into prompts
- E2E: Install skill → Use in agent → Verify output

---

## Phase 2: Beads Memory System (Q1 2025)

### Goals
- **Episodic Recording**: Each terminal run creates a "Bead"
- **Intelligent Recall**: Find similar past runs
- **Pattern Learning**: Detect successful agent-task combinations
- **Lesson Extraction**: Explicit learning from outcomes

### Implementation

#### 2.1 Bead Schema
```typescript
interface Bead {
  // Identity
  id: string;                    // UUID
  timestamp: Date;
  
  // Context
  projectPath: string;
  taskType: "feature" | "bugfix" | "refactor" | "review" | "unknown";
  
  // Execution
  agent: string;                 // "claude", "codex", "cline", etc.
  primaryAgent: boolean;         // Was this the first agent?
  fallbackAgent?: string;        // If fallback occurred
  fallbackReason?: string;       // "timeout", "auth_error", "parse_error"
  
  // Content
  prompt: string;
  result: string;
  
  // Outcome
  outcome: "success" | "failure" | "fallback" | "partial";
  exitCode: number;
  duration: number;              // milliseconds
  
  // Quality
  userSatisfaction?: 1 | 2 | 3 | 4 | 5;
  lesson?: string;               // Extracted insight
  tags: string[];
}
```

#### 2.2 Beads Storage
```typescript
// src/database/BeadsDB.ts
class BeadsDatabase {
  async recordBead(bead: Omit<Bead, 'id' | 'timestamp'>): Promise<string>;
  async getBead(id: string): Promise<Bead>;
  async searchBeads(query: {
    taskType?: string;
    agent?: string;
    projectPath?: string;
    outcome?: string;
    limit?: number;
  }): Promise<Bead[]>;
  async recallSimilar(prompt: string, taskType: string): Promise<Bead[]>;
  async updateLesson(id: string, lesson: string): Promise<void>;
  async getStats(): Promise<BeadsStats>;
}
```

**Storage**: SQLite database
```sql
CREATE TABLE beads (
  id TEXT PRIMARY KEY,
  timestamp DATETIME,
  project_path TEXT,
  task_type TEXT,
  agent TEXT,
  primary_agent BOOLEAN,
  fallback_agent TEXT,
  outcome TEXT,
  prompt TEXT,
  result TEXT,
  duration INTEGER,
  user_satisfaction INTEGER,
  lesson TEXT,
  tags TEXT  -- JSON array
);

CREATE INDEX idx_tasktype_outcome ON beads(task_type, outcome);
CREATE INDEX idx_agent_outcome ON beads(agent, outcome);
CREATE INDEX idx_timestamp ON beads(timestamp DESC);
```

#### 2.3 Bead Recording
```typescript
// In Terminal Manager:
terminal.on('complete', async (result) => {
  const bead: Bead = {
    projectPath: currentProject.path,
    taskType: classifyTask(prompt),      // ML-based or heuristic
    agent: usedAgent,
    outcome: result.success ? 'success' : 'failure',
    prompt: userPrompt,
    result: terminalOutput,
    duration: result.duration,
    fallbackAgent: attemptedFallback?.agent,
    fallbackReason: attemptedFallback?.reason,
  };
  
  await beadsDB.recordBead(bead);
});
```

#### 2.4 Intelligent Recall
```typescript
// Before launching agent:
const recentSuccess = await beadsDB.recallSimilar(
  currentPrompt,
  taskType
);

if (recentSuccess.length > 0) {
  // Show in UI: "⚡ Similar task solved by [Agent] 3 days ago"
  showRecallNotification({
    bead: recentSuccess[0],
    suggestedAgent: recentSuccess[0].agent,
  });
}
```

#### 2.5 Pattern Detection & Learning
```typescript
// Auto-generated insights:
class BeadsAnalyzer {
  async detectPatterns(): Promise<Pattern[]> {
    // Find: Agent X has 90% success on TaskType Y
    // Find: Agent X faster than Agent Y for feature branches
    // Find: Fallbacks from A→B most common pattern
  }
  
  async suggestHarnessReordering(): Promise<string[]> {
    // Reorder harness priorities based on historical success
    // E.g., ["claude", "codex", "cline"] → ["codex", "claude", "cline"]
  }
  
  async extractLessons(): Promise<Lesson[]> {
    // Group successful beads by pattern
    // Generate: "When working with React + TypeScript, Agent X excels"
  }
}
```

#### 2.6 UI Components
- **Recall Notification**: Show in terminal header
  - "Similar task succeeded on [date] with [Agent]"
  - Quick option to use same agent
- **Bead Timeline**: In project view
  - Visual timeline of all runs
  - Filter by agent, outcome, task type
  - Click to replay similar task
- **Lessons Panel**: In settings
  - View extracted patterns
  - Manual lesson editing
  - Export/Import lessons
- **Stats Dashboard**: Memory usage, success rates
  - Agent success rates (pie chart)
  - Task type distribution
  - Fallback patterns

### Acceptance Criteria
- [ ] Beads recorded automatically after each terminal run
- [ ] SQLite database stores beads durably
- [ ] Recall shows "similar successful runs" before launch
- [ ] Lessons can be manually added to beads
- [ ] Pattern detection identifies successful agent-task pairs
- [ ] UI shows bead timeline and statistics
- [ ] User satisfaction rating is recordable
- [ ] Export beads to JSON for backup

### Testing
- Unit tests for BeadsDB
- Pattern detection correctness
- Recall relevance evaluation
- SQLite migration tests

---

## Phase 3: Advanced Memory & Learning (Q2 2025)

### Goals (Optional / Nice-to-have)
- **Semantic Recall**: Embedding-based similarity search
- **Self-Optimizing**: Auto-reorder harnesses based on success
- **Knowledge Export**: Beads → Lessons → New AGENTS.md rules
- **Cross-Project Learning**: Share insights across projects

### 3.1 Embedding-Based Recall
```typescript
// Using @xenova/transformers or similar
class EmbeddingService {
  async embedPrompt(prompt: string): Promise<number[]>;
  async findSimilarBeads(
    prompt: string,
    topK: number = 5
  ): Promise<Bead[]>;
}
```

### 3.2 Auto-Optimization
```typescript
class HarnessOptimizer {
  async suggestNewOrder(): Promise<string[]> {
    // Based on success_rate and duration
    // E.g., reorder harnesses for this project/task type
  }
  
  async applyAutoReordering(enabled: boolean): Promise<void> {
    // If enabled, periodically reorder harnesses
  }
}
```

### 3.3 Knowledge Compilation
```typescript
// Convert Beads → AGENTS.md rules
interface KnowledgeRule {
  condition: string;           // "taskType == 'bugfix' && projectType == 'react'"
  recommendation: string;      // "Use Claude Code (92% success)"
  confidence: number;          // 0.92
  sourceBeads: string[];       // Bead IDs
}

class KnowledgeCompiler {
  async compileRules(): Promise<KnowledgeRule[]>;
  async suggestAGENTSMDUpdates(): Promise<string>;  // Markdown
}
```

---

## Phase 4: Extended Provider Support (Ongoing)

### Goals
- Support custom CLIs easily
- Make Provider registration simpler
- Plugin-based provider system

### 4.1 Dynamic Provider Registration
```typescript
// Allow users to add custom providers via config
interface CustomProvider {
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  supportsTTY: boolean;
  hasHeadless: boolean;
}

// In harness settings:
const customProviders = [
  {
    name: "qwen-code",
    command: "qwen-code",
    supportsTTY: true,
  },
  {
    name: "gemini-cli",
    command: "gemini-cli",
    supportsTTY: true,
  },
];
```

### 4.2 Provider Discovery
```typescript
// Auto-detect installed CLIs
class ProviderDiscovery {
  async detectInstalledProviders(): Promise<string[]>;
  async probeProvider(name: string): Promise<ProviderStatus>;
}
```

---

## Implementation Priorities

### 🥇 High Priority (Next)
1. **Skill System MVP**
   - Define skill format
   - SkillManager service
   - Profile integration
   - Basic UI

2. **Beads Recording**
   - SQLite schema
   - Record on terminal complete
   - Basic recall UI

### 🥈 Medium Priority
1. **Beads Recall UI**
   - Timeline visualization
   - Pattern detection
   - Statistics dashboard

2. **Skill Versioning & Dependency**
   - Dependency resolution
   - Version constraints
   - Update mechanisms

### 🥉 Low Priority (Nice-to-have)
1. **Embedding-based Search**
2. **Auto-optimization**
3. **Knowledge Compilation**
4. **Custom Provider Registration**

---

## Why NOT CAO/MCP?

| Feature | harness-router-gui | CAO | Winner |
|---------|------|-----|--------|
| **Browser Terminal** | ✅ Embedded | ⚠️ Optional | harness |
| **Auto-Fallback** | ✅ Built-in | ❌ Manual | harness |
| **Skill System** | 🔄 Building | ✅ Complex | harness (simpler) |
| **Beads Memory** | 🔄 Building | ❌ N/A | harness |
| **Easy Setup** | ✅ npm start | ⚠️ uv tool | harness |
| **Mobile Remote** | ✅ PWA + Telegram | ⚠️ Web only | harness |

**Decision**: Build custom Skill + Beads systems that fit harness-router-gui's strengths, not adopt CAO.

---

## Success Metrics

### Phase 1 (Skills)
- [ ] 5+ reusable skills created
- [ ] Skills reduce repetitive prompt writing by 40%
- [ ] Zero friction to add new skills

### Phase 2 (Beads)
- [ ] 100+ beads recorded in first month
- [ ] Recall accuracy > 80% (user satisfaction)
- [ ] Pattern detection identifies 3+ actionable insights
- [ ] Agent success rates improve by 15%

### Phase 3+ (Learning)
- [ ] Auto-reordering saves 20% time on similar tasks
- [ ] User explicitly uses suggested agents 70%+ of time
- [ ] Export knowledge to team wiki

---

## Technical Debt & Future Cleanup

- [ ] Add comprehensive error handling & recovery
- [ ] Implement proper logging/tracing
- [ ] Add TypeScript strict mode
- [ ] Improve test coverage to 80%+

---

## Community & Contributions

- Document skill-creation process
- Publish example skills (git-operations, testing, code-review)
- Create skill registry/marketplace
- Encourage community skill contributions

---

## Timeline

- **By Dec 2024**: Skill System MVP
- **By Feb 2025**: Beads Recording + Basic Recall
- **By Apr 2025**: Full Beads UI + Pattern Detection
- **By Jun 2025**: Embedding-based Recall (stretch goal)

---

## Questions & Discussion

- How to handle skill versioning conflicts?
- Should beads be exportable to other projects?
- Auto-reordering: opt-in or default?
- Skill rating/review system?

**Next Step**: Start with Skill System Phase 1.1 – define format and structure.
