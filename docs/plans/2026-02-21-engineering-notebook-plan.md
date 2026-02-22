# Engineering Notebook Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Bun CLI app that ingests Claude Code session transcripts, extracts conversations, generates LLM summaries, and serves a web UI for browsing the engineering journal.

**Architecture:** Monolith CLI with three subcommands (ingest, summarize, serve). JSONL sessions are parsed into clean conversation markdown, stored in SQLite, then summarized by Claude via the Agent SDK. A Hono web server with HTMX serves the journal UI.

**Tech Stack:** Bun, Hono, bun:sqlite, HTMX, @anthropic-ai/claude-agent-sdk

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `src/index.ts`
- Create: `.gitignore`

**Step 1: Initialize Bun project**

Run: `bun init -y`

**Step 2: Install dependencies**

Run: `bun add hono @hono/node-server @anthropic-ai/claude-agent-sdk`
Run: `bun add -d @types/bun`

**Step 3: Create .gitignore**

```
node_modules/
*.db
dist/
.env
```

**Step 4: Create entry point**

Create `src/index.ts`:

```typescript
const command = process.argv[2];

switch (command) {
  case "ingest":
    console.log("TODO: ingest");
    break;
  case "summarize":
    console.log("TODO: summarize");
    break;
  case "serve":
    console.log("TODO: serve");
    break;
  case "config":
    console.log("TODO: config");
    break;
  default:
    console.log("Usage: notebook <ingest|summarize|serve|config>");
    process.exit(1);
}
```

**Step 5: Add bin to package.json**

Add to package.json:
```json
{
  "bin": {
    "notebook": "src/index.ts"
  }
}
```

**Step 6: Verify it runs**

Run: `bun src/index.ts ingest`
Expected: `TODO: ingest`

**Step 7: Commit**

```bash
git add package.json tsconfig.json src/index.ts .gitignore bun.lock
git commit -m "feat: scaffold Bun project with CLI entry point"
```

---

### Task 2: Configuration Module

**Files:**
- Create: `src/config.ts`
- Create: `src/config.test.ts`

**Step 1: Write the failing test**

Create `src/config.test.ts`:

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { loadConfig, saveConfig, defaultConfig, type Config } from "./config";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("config", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "notebook-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("defaultConfig has expected shape", () => {
    const config = defaultConfig();
    expect(config.sources).toEqual(["~/.claude/projects"]);
    expect(config.exclude).toContain("-private-tmp*");
    expect(config.port).toBe(3000);
    expect(config.db_path).toContain("notebook.db");
  });

  test("loadConfig returns default when no file exists", () => {
    const config = loadConfig(join(tempDir, "nonexistent.json"));
    expect(config.sources).toEqual(["~/.claude/projects"]);
  });

  test("saveConfig writes and loadConfig reads back", () => {
    const configPath = join(tempDir, "config.json");
    const config: Config = {
      sources: ["/custom/path"],
      exclude: ["test-*"],
      db_path: join(tempDir, "test.db"),
      port: 4000,
    };
    saveConfig(configPath, config);
    const loaded = loadConfig(configPath);
    expect(loaded).toEqual(config);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/config.test.ts`
Expected: FAIL — module `./config` not found

**Step 3: Write the implementation**

Create `src/config.ts`:

```typescript
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";

export type Config = {
  sources: string[];
  exclude: string[];
  db_path: string;
  port: number;
};

export function defaultConfig(): Config {
  const configDir = join(homedir(), ".config", "engineering-notebook");
  return {
    sources: ["~/.claude/projects"],
    exclude: ["-private-tmp*", "*-skill-test-*"],
    db_path: join(configDir, "notebook.db"),
    port: 3000,
  };
}

export function resolveConfigPath(): string {
  return join(homedir(), ".config", "engineering-notebook", "config.json");
}

export function loadConfig(path?: string): Config {
  const configPath = path ?? resolveConfigPath();
  if (!existsSync(configPath)) {
    return defaultConfig();
  }
  const raw = readFileSync(configPath, "utf-8");
  return { ...defaultConfig(), ...JSON.parse(raw) };
}

export function saveConfig(path: string, config: Config): void {
  const dir = dirname(path);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, JSON.stringify(config, null, 2) + "\n");
}

/** Expand ~ to homedir in a path */
export function expandPath(p: string): string {
  if (p.startsWith("~/")) {
    return join(homedir(), p.slice(2));
  }
  return p;
}
```

**Step 4: Run test to verify it passes**

Run: `bun test src/config.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/config.ts src/config.test.ts
git commit -m "feat: add configuration module with load/save/defaults"
```

---

### Task 3: Database Schema and Initialization

**Files:**
- Create: `src/db.ts`
- Create: `src/db.test.ts`

**Step 1: Write the failing test**

Create `src/db.test.ts`:

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { initDb, getDb } from "./db";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("db", () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "notebook-db-test-"));
    dbPath = join(tempDir, "test.db");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("initDb creates tables", () => {
    const db = initDb(dbPath);
    const tables = db
      .query("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain("projects");
    expect(names).toContain("sessions");
    expect(names).toContain("conversations");
    expect(names).toContain("journal_entries");
    db.close();
  });

  test("initDb is idempotent", () => {
    const db1 = initDb(dbPath);
    db1.close();
    const db2 = initDb(dbPath);
    const tables = db2
      .query("SELECT name FROM sqlite_master WHERE type='table'")
      .all();
    expect(tables.length).toBeGreaterThanOrEqual(4);
    db2.close();
  });

  test("getDb returns initialized db", () => {
    initDb(dbPath);
    const db = getDb(dbPath);
    const result = db
      .query("SELECT count(*) as c FROM sessions")
      .get() as { c: number };
    expect(result.c).toBe(0);
    db.close();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/db.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

Create `src/db.ts`:

```typescript
import { Database } from "bun:sqlite";

let _db: Database | null = null;

export function initDb(dbPath: string): Database {
  const db = new Database(dbPath, { create: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      first_session_at TEXT,
      last_session_at TEXT,
      session_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      project_path TEXT NOT NULL,
      source_path TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      git_branch TEXT,
      version TEXT,
      message_count INTEGER NOT NULL DEFAULT 0,
      ingested_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL UNIQUE REFERENCES sessions(id),
      conversation_markdown TEXT NOT NULL,
      extracted_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS journal_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      project_id TEXT NOT NULL REFERENCES projects(id),
      session_ids TEXT NOT NULL DEFAULT '[]',
      summary TEXT NOT NULL,
      topics TEXT NOT NULL DEFAULT '[]',
      commits TEXT,
      generated_at TEXT NOT NULL,
      model_used TEXT NOT NULL,
      UNIQUE(date, project_id)
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at);
    CREATE INDEX IF NOT EXISTS idx_journal_date ON journal_entries(date);
    CREATE INDEX IF NOT EXISTS idx_journal_project ON journal_entries(project_id);
  `);

  _db = db;
  return db;
}

export function getDb(dbPath?: string): Database {
  if (_db) return _db;
  if (!dbPath) throw new Error("Database not initialized — call initDb first");
  return initDb(dbPath);
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
```

**Step 4: Run test to verify it passes**

Run: `bun test src/db.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/db.ts src/db.test.ts
git commit -m "feat: add SQLite database schema with projects, sessions, conversations, journal_entries"
```

---

### Task 4: JSONL Session Parser

This is the core extraction logic — turning raw JSONL into clean conversation markdown.

**Files:**
- Create: `src/parser.ts`
- Create: `src/parser.test.ts`
- Create: `tests/fixtures/sample-session.jsonl`

**Step 1: Create test fixture**

Create `tests/fixtures/sample-session.jsonl` — a minimal JSONL file with representative records:

```jsonl
{"type":"system","subtype":"init","sessionId":"test-session-1","cwd":"/Users/jesse/projects/myapp","version":"2.1.25","gitBranch":"main","timestamp":"2026-02-02T17:37:00.000Z","uuid":"uuid-1"}
{"type":"user","sessionId":"test-session-1","cwd":"/Users/jesse/projects/myapp","version":"2.1.25","gitBranch":"main","message":{"role":"user","content":"Fix the login bug"},"timestamp":"2026-02-02T17:37:41.000Z","uuid":"uuid-2"}
{"type":"assistant","sessionId":"test-session-1","cwd":"/Users/jesse/projects/myapp","version":"2.1.25","gitBranch":"main","message":{"role":"assistant","content":[{"type":"thinking","thinking":"Let me look at the login code...","signature":"sig"}],"stop_reason":null},"timestamp":"2026-02-02T17:37:43.000Z","uuid":"uuid-3"}
{"type":"assistant","sessionId":"test-session-1","cwd":"/Users/jesse/projects/myapp","version":"2.1.25","gitBranch":"main","message":{"role":"assistant","content":[{"type":"text","text":"I'll investigate the login flow. Let me check the auth module."}],"stop_reason":null},"timestamp":"2026-02-02T17:37:45.000Z","uuid":"uuid-4"}
{"type":"progress","sessionId":"test-session-1","data":{"type":"hook_progress","hookEvent":"PreToolUse"},"timestamp":"2026-02-02T17:37:46.000Z","uuid":"uuid-5"}
{"type":"assistant","sessionId":"test-session-1","cwd":"/Users/jesse/projects/myapp","version":"2.1.25","gitBranch":"main","message":{"role":"assistant","content":[{"type":"tool_use","id":"tool-1","name":"Read","input":{"file_path":"/Users/jesse/projects/myapp/src/auth.ts"}}],"stop_reason":null},"timestamp":"2026-02-02T17:37:47.000Z","uuid":"uuid-6"}
{"type":"user","sessionId":"test-session-1","cwd":"/Users/jesse/projects/myapp","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tool-1","content":"file contents here"}]},"timestamp":"2026-02-02T17:37:48.000Z","uuid":"uuid-7"}
{"type":"assistant","sessionId":"test-session-1","cwd":"/Users/jesse/projects/myapp","version":"2.1.25","gitBranch":"main","message":{"role":"assistant","content":[{"type":"text","text":"Found the bug. The session token check is using == instead of ===."}],"stop_reason":"end_turn"},"timestamp":"2026-02-02T17:38:15.000Z","uuid":"uuid-8"}
{"type":"user","sessionId":"test-session-1","cwd":"/Users/jesse/projects/myapp","message":{"role":"user","content":"Great, fix it please"},"timestamp":"2026-02-02T17:39:00.000Z","uuid":"uuid-9"}
{"type":"assistant","sessionId":"test-session-1","cwd":"/Users/jesse/projects/myapp","version":"2.1.25","gitBranch":"main","message":{"role":"assistant","content":[{"type":"text","text":"Fixed the comparison operator. The login flow should work correctly now."}],"stop_reason":"end_turn"},"timestamp":"2026-02-02T17:39:30.000Z","uuid":"uuid-10"}
{"type":"system","subtype":"turn_duration","durationMs":109000,"timestamp":"2026-02-02T17:39:31.000Z","uuid":"uuid-11"}
```

**Step 2: Write the failing test**

Create `src/parser.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { parseSession, type ParsedSession } from "./parser";
import { join } from "path";

const fixturePath = join(import.meta.dir, "../tests/fixtures/sample-session.jsonl");

describe("parseSession", () => {
  test("extracts session metadata", () => {
    const session = parseSession(fixturePath);
    expect(session.sessionId).toBe("test-session-1");
    expect(session.projectPath).toBe("/Users/jesse/projects/myapp");
    expect(session.gitBranch).toBe("main");
    expect(session.version).toBe("2.1.25");
    expect(session.startedAt).toBeTruthy();
    expect(session.endedAt).toBeTruthy();
  });

  test("extracts only user text and assistant text messages", () => {
    const session = parseSession(fixturePath);
    // Should have: "Fix the login bug", "I'll investigate...", "Found the bug...", "Great, fix it please", "Fixed the comparison..."
    // Should NOT have: thinking blocks, tool_use blocks, tool_result blocks, progress, system
    expect(session.messages.length).toBe(5);
  });

  test("skips tool_result user messages", () => {
    const session = parseSession(fixturePath);
    const userMessages = session.messages.filter((m) => m.role === "user");
    expect(userMessages.length).toBe(2);
    expect(userMessages[0].text).toBe("Fix the login bug");
    expect(userMessages[1].text).toBe("Great, fix it please");
  });

  test("skips thinking blocks from assistant", () => {
    const session = parseSession(fixturePath);
    const assistantMessages = session.messages.filter((m) => m.role === "assistant");
    // Should only have text blocks, not thinking
    for (const msg of assistantMessages) {
      expect(msg.text).not.toContain("Let me look at");
    }
  });

  test("skips assistant messages with only tool_use or thinking", () => {
    const session = parseSession(fixturePath);
    const assistantMessages = session.messages.filter((m) => m.role === "assistant");
    expect(assistantMessages.length).toBe(3);
  });

  test("generates conversation markdown", () => {
    const session = parseSession(fixturePath);
    const md = session.toMarkdown();
    expect(md).toContain("# Session: myapp");
    expect(md).toContain("**User (17:37):** Fix the login bug");
    expect(md).toContain("**Claude (17:37):** I'll investigate the login flow.");
    expect(md).toContain("**Claude (17:38):** Found the bug.");
    expect(md).toContain("**User (17:39):** Great, fix it please");
    // Should not contain thinking or tool calls
    expect(md).not.toContain("thinking");
    expect(md).not.toContain("tool_use");
    expect(md).not.toContain("tool_result");
  });

  test("counts messages correctly", () => {
    const session = parseSession(fixturePath);
    expect(session.messageCount).toBe(5);
  });
});
```

**Step 3: Run test to verify it fails**

Run: `bun test src/parser.test.ts`
Expected: FAIL — module `./parser` not found

**Step 4: Write the implementation**

Create `src/parser.ts`:

```typescript
import { readFileSync } from "fs";
import { basename } from "path";

export type MessageRole = "user" | "assistant";

export type ParsedMessage = {
  role: MessageRole;
  text: string;
  timestamp: string;
};

export type ParsedSession = {
  sessionId: string;
  projectPath: string;
  projectName: string;
  gitBranch: string | null;
  version: string | null;
  startedAt: string;
  endedAt: string | null;
  messages: ParsedMessage[];
  messageCount: number;
  toMarkdown: () => string;
};

type RawRecord = {
  type: string;
  subtype?: string;
  sessionId?: string;
  cwd?: string;
  version?: string;
  gitBranch?: string;
  message?: {
    role: string;
    content: string | ContentBlock[];
  };
  timestamp?: string;
  uuid?: string;
};

type ContentBlock = {
  type: string;
  text?: string;
  thinking?: string;
  name?: string;
  tool_use_id?: string;
  [key: string]: unknown;
};

function projectNameFromPath(projectPath: string): string {
  // Extract the last path component as the project name
  const parts = projectPath.split("/").filter(Boolean);
  return parts[parts.length - 1] || "unknown";
}

function formatTime(timestamp: string): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDate(timestamp: string): string {
  const d = new Date(timestamp);
  return d.toISOString().split("T")[0];
}

function extractUserText(content: string | ContentBlock[]): string | null {
  if (typeof content === "string") {
    return content;
  }
  // List content — skip tool_result messages entirely
  const hasToolResult = content.some((b) => b.type === "tool_result");
  if (hasToolResult) {
    return null;
  }
  // Extract text blocks
  const texts = content
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text!);
  return texts.length > 0 ? texts.join("\n") : null;
}

function extractAssistantText(content: string | ContentBlock[]): string | null {
  if (typeof content === "string") {
    return content === "(no content)" ? null : content;
  }
  const texts = content
    .filter((b) => b.type === "text" && b.text && b.text !== "(no content)")
    .map((b) => b.text!);
  return texts.length > 0 ? texts.join("\n") : null;
}

export function parseSession(filePath: string): ParsedSession {
  const raw = readFileSync(filePath, "utf-8");
  const lines = raw.trim().split("\n");

  let sessionId = "";
  let projectPath = "";
  let gitBranch: string | null = null;
  let version: string | null = null;
  let firstTimestamp: string | null = null;
  let lastTimestamp: string | null = null;
  const messages: ParsedMessage[] = [];

  for (const line of lines) {
    const record: RawRecord = JSON.parse(line);

    // Track timestamps
    if (record.timestamp) {
      if (!firstTimestamp) firstTimestamp = record.timestamp;
      lastTimestamp = record.timestamp;
    }

    // Extract metadata from first record with it
    if (record.sessionId && !sessionId) sessionId = record.sessionId;
    if (record.cwd && !projectPath) projectPath = record.cwd;
    if (record.gitBranch && !gitBranch) gitBranch = record.gitBranch;
    if (record.version && !version) version = record.version;

    // Skip non-message records
    if (record.type !== "user" && record.type !== "assistant") continue;
    if (!record.message) continue;

    const timestamp = record.timestamp || "";

    if (record.type === "user") {
      const text = extractUserText(record.message.content);
      if (text) {
        messages.push({ role: "user", text, timestamp });
      }
    } else if (record.type === "assistant") {
      const text = extractAssistantText(record.message.content);
      if (text) {
        messages.push({ role: "assistant", text, timestamp });
      }
    }
  }

  const projectName = projectNameFromPath(projectPath);

  return {
    sessionId,
    projectPath,
    projectName,
    gitBranch,
    version,
    startedAt: firstTimestamp || "",
    endedAt: lastTimestamp || null,
    messages,
    messageCount: messages.length,
    toMarkdown() {
      const startTime = firstTimestamp ? formatTime(firstTimestamp) : "??:??";
      const endTime = lastTimestamp ? formatTime(lastTimestamp) : "??:??";
      const date = firstTimestamp ? formatDate(firstTimestamp) : "unknown";

      let md = `# Session: ${projectName}\n`;
      md += `**Date:** ${date} ${startTime} - ${endTime}`;
      if (gitBranch) md += ` | **Branch:** ${gitBranch}`;
      md += ` | **Project:** ${projectPath}\n\n---\n\n`;

      for (const msg of messages) {
        const time = formatTime(msg.timestamp);
        const speaker = msg.role === "user" ? "User" : "Claude";
        // Truncate long messages for the single-line format, keeping first line
        const firstLine = msg.text.split("\n")[0];
        const truncated = msg.text.includes("\n")
          ? firstLine + " [...]"
          : firstLine;
        md += `**${speaker} (${time}):** ${truncated}\n`;
      }

      return md;
    },
  };
}
```

**Step 5: Run test to verify it passes**

Run: `bun test src/parser.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/parser.ts src/parser.test.ts tests/fixtures/sample-session.jsonl
git commit -m "feat: add JSONL session parser with conversation extraction"
```

---

### Task 5: Session Scanner and Ingestion

**Files:**
- Create: `src/ingest.ts`
- Create: `src/ingest.test.ts`

**Step 1: Write the failing test**

Create `src/ingest.test.ts`:

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { scanSources, ingestSessions } from "./ingest";
import { initDb } from "./db";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, copyFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Database } from "bun:sqlite";

describe("scanSources", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "notebook-ingest-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("finds .jsonl files in project directories", () => {
    // Create a fake project directory with sessions
    const projectDir = join(tempDir, "-Users-test-project");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, "session-1.jsonl"), "{}");
    writeFileSync(join(projectDir, "session-2.jsonl"), "{}");
    // Non-jsonl files should be ignored
    writeFileSync(join(projectDir, "memory"), "{}");

    const files = scanSources([tempDir], []);
    expect(files.length).toBe(2);
  });

  test("excludes matching patterns", () => {
    const included = join(tempDir, "-Users-test-myapp");
    const excluded = join(tempDir, "-private-tmp");
    mkdirSync(included, { recursive: true });
    mkdirSync(excluded, { recursive: true });
    writeFileSync(join(included, "s1.jsonl"), "{}");
    writeFileSync(join(excluded, "s2.jsonl"), "{}");

    const files = scanSources([tempDir], ["-private-tmp*"]);
    expect(files.length).toBe(1);
    expect(files[0]).toContain("myapp");
  });
});

describe("ingestSessions", () => {
  let tempDir: string;
  let db: Database;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "notebook-ingest-test-"));
    db = initDb(join(tempDir, "test.db"));
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("ingests a session file into the database", () => {
    const fixturePath = join(import.meta.dir, "../tests/fixtures/sample-session.jsonl");
    const projectDir = join(tempDir, "-Users-test-myapp");
    mkdirSync(projectDir, { recursive: true });
    const sessionFile = join(projectDir, "test-session-1.jsonl");
    copyFileSync(fixturePath, sessionFile);

    const result = ingestSessions([sessionFile], db);
    expect(result.ingested).toBe(1);
    expect(result.skipped).toBe(0);

    const sessions = db.query("SELECT * FROM sessions").all();
    expect(sessions.length).toBe(1);

    const convos = db.query("SELECT * FROM conversations").all();
    expect(convos.length).toBe(1);

    const projects = db.query("SELECT * FROM projects").all();
    expect(projects.length).toBe(1);
  });

  test("skips already-ingested sessions", () => {
    const fixturePath = join(import.meta.dir, "../tests/fixtures/sample-session.jsonl");
    const projectDir = join(tempDir, "-Users-test-myapp");
    mkdirSync(projectDir, { recursive: true });
    const sessionFile = join(projectDir, "test-session-1.jsonl");
    copyFileSync(fixturePath, sessionFile);

    ingestSessions([sessionFile], db);
    const result = ingestSessions([sessionFile], db);
    expect(result.ingested).toBe(0);
    expect(result.skipped).toBe(1);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/ingest.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

Create `src/ingest.ts`:

```typescript
import { readdirSync, statSync } from "fs";
import { join, basename, dirname } from "path";
import { Database } from "bun:sqlite";
import { parseSession } from "./parser";

/** Scan source directories for .jsonl session files, applying exclude patterns */
export function scanSources(
  sources: string[],
  exclude: string[]
): string[] {
  const files: string[] = [];

  for (const source of sources) {
    let entries: string[];
    try {
      entries = readdirSync(source);
    } catch {
      continue;
    }

    for (const projectDir of entries) {
      // Check exclude patterns (simple glob: * matches anything)
      const excluded = exclude.some((pattern) => {
        const regex = new RegExp(
          "^" + pattern.replace(/\*/g, ".*").replace(/\?/g, ".") + "$"
        );
        return regex.test(projectDir);
      });
      if (excluded) continue;

      const projectPath = join(source, projectDir);
      let stat;
      try {
        stat = statSync(projectPath);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) continue;

      // Find .jsonl files in the project directory
      let projectFiles: string[];
      try {
        projectFiles = readdirSync(projectPath);
      } catch {
        continue;
      }

      for (const file of projectFiles) {
        if (file.endsWith(".jsonl")) {
          files.push(join(projectPath, file));
        }
      }
    }
  }

  return files;
}

function deriveProjectId(projectPath: string): string {
  // Use the last path component
  const parts = projectPath.split("/").filter(Boolean);
  return parts[parts.length - 1] || "unknown";
}

/** Ingest session files into the database */
export function ingestSessions(
  files: string[],
  db: Database,
  force = false
): { ingested: number; skipped: number; errors: string[] } {
  let ingested = 0;
  let skipped = 0;
  const errors: string[] = [];

  const checkStmt = db.query("SELECT id FROM sessions WHERE source_path = ?");
  const insertProject = db.prepare(`
    INSERT INTO projects (id, path, display_name, session_count)
    VALUES (?, ?, ?, 0)
    ON CONFLICT(id) DO UPDATE SET
      session_count = session_count + 1,
      last_session_at = CASE
        WHEN excluded.path != '' THEN datetime('now')
        ELSE last_session_at
      END
  `);
  const insertSession = db.prepare(`
    INSERT INTO sessions (id, project_id, project_path, source_path, started_at, ended_at, git_branch, version, message_count, ingested_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  const insertConvo = db.prepare(`
    INSERT INTO conversations (session_id, conversation_markdown, extracted_at)
    VALUES (?, ?, datetime('now'))
  `);

  for (const file of files) {
    // Skip if already ingested (unless force)
    if (!force) {
      const existing = checkStmt.get(file);
      if (existing) {
        skipped++;
        continue;
      }
    }

    try {
      const session = parseSession(file);

      // Skip sessions with no messages
      if (session.messageCount === 0) {
        skipped++;
        continue;
      }

      const projectId = deriveProjectId(session.projectPath);

      db.transaction(() => {
        insertProject.run(
          projectId,
          session.projectPath,
          session.projectName
        );
        insertSession.run(
          session.sessionId,
          projectId,
          session.projectPath,
          file,
          session.startedAt,
          session.endedAt,
          session.gitBranch,
          session.version,
          session.messageCount
        );
        insertConvo.run(session.sessionId, session.toMarkdown());
      })();

      ingested++;
    } catch (err) {
      errors.push(`${file}: ${err}`);
    }
  }

  // Update project aggregate fields
  db.exec(`
    UPDATE projects SET
      first_session_at = (SELECT MIN(started_at) FROM sessions WHERE sessions.project_id = projects.id),
      last_session_at = (SELECT MAX(started_at) FROM sessions WHERE sessions.project_id = projects.id),
      session_count = (SELECT COUNT(*) FROM sessions WHERE sessions.project_id = projects.id)
  `);

  return { ingested, skipped, errors };
}
```

**Step 4: Run test to verify it passes**

Run: `bun test src/ingest.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/ingest.ts src/ingest.test.ts
git commit -m "feat: add session scanner and ingestion pipeline"
```

---

### Task 6: Wire Up the Ingest CLI Command

**Files:**
- Modify: `src/index.ts`

**Step 1: Wire the ingest command**

Update `src/index.ts`:

```typescript
import { loadConfig, expandPath, resolveConfigPath } from "./config";
import { initDb, closeDb } from "./db";
import { scanSources, ingestSessions } from "./ingest";

const command = process.argv[2];

switch (command) {
  case "ingest": {
    const config = loadConfig();
    const db = initDb(config.db_path);

    const force = process.argv.includes("--force");

    // Collect sources: config + any --source args
    const sources = config.sources.map(expandPath);
    const sourceIdx = process.argv.indexOf("--source");
    if (sourceIdx !== -1 && process.argv[sourceIdx + 1]) {
      sources.push(expandPath(process.argv[sourceIdx + 1]));
    }

    console.log(`Scanning ${sources.length} source(s)...`);
    const files = scanSources(sources, config.exclude);
    console.log(`Found ${files.length} session file(s)`);

    const result = ingestSessions(files, db, force);
    console.log(
      `Ingested: ${result.ingested}, Skipped: ${result.skipped}, Errors: ${result.errors.length}`
    );
    if (result.errors.length > 0) {
      for (const err of result.errors.slice(0, 10)) {
        console.error(`  ${err}`);
      }
    }
    closeDb();
    break;
  }
  case "summarize":
    console.log("TODO: summarize");
    break;
  case "serve":
    console.log("TODO: serve");
    break;
  case "config":
    console.log("TODO: config");
    break;
  default:
    console.log("Usage: notebook <ingest|summarize|serve|config>");
    process.exit(1);
}
```

**Step 2: Test manually**

Run: `bun src/index.ts ingest`
Expected: Should scan ~/.claude/projects, find sessions, and ingest them. Output like:
```
Scanning 1 source(s)...
Found 931 session file(s)
Ingested: XXX, Skipped: 0, Errors: X
```

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire ingest command to CLI"
```

---

### Task 7: LLM Summarization

**Files:**
- Create: `src/summarize.ts`
- Create: `src/summarize.test.ts`

**Step 1: Write the failing test**

Create `src/summarize.test.ts`:

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { groupSessionsByDateAndProject, buildSummaryPrompt } from "./summarize";
import { initDb } from "./db";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Database } from "bun:sqlite";

describe("summarize", () => {
  let tempDir: string;
  let db: Database;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "notebook-sum-test-"));
    db = initDb(join(tempDir, "test.db"));

    // Insert test data
    db.exec(`
      INSERT INTO projects (id, path, display_name, session_count)
      VALUES ('myapp', '/test/myapp', 'My App', 2);

      INSERT INTO sessions (id, project_id, project_path, source_path, started_at, ended_at, message_count, ingested_at)
      VALUES
        ('s1', 'myapp', '/test/myapp', '/tmp/s1.jsonl', '2026-02-02T10:00:00Z', '2026-02-02T11:00:00Z', 5, datetime('now')),
        ('s2', 'myapp', '/test/myapp', '/tmp/s2.jsonl', '2026-02-02T14:00:00Z', '2026-02-02T15:00:00Z', 3, datetime('now'));

      INSERT INTO conversations (session_id, conversation_markdown, extracted_at)
      VALUES
        ('s1', '**User (10:00):** Fix the bug\n**Claude (10:01):** Fixed it.', datetime('now')),
        ('s2', '**User (14:00):** Add tests\n**Claude (14:01):** Added tests.', datetime('now'));
    `);
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("groupSessionsByDateAndProject groups correctly", () => {
    const groups = groupSessionsByDateAndProject(db);
    expect(groups.length).toBe(1);
    expect(groups[0].date).toBe("2026-02-02");
    expect(groups[0].projectId).toBe("myapp");
    expect(groups[0].sessionIds).toEqual(["s1", "s2"]);
    expect(groups[0].conversations.length).toBe(2);
  });

  test("buildSummaryPrompt produces valid prompt", () => {
    const groups = groupSessionsByDateAndProject(db);
    const prompt = buildSummaryPrompt(groups[0]);
    expect(prompt).toContain("Fix the bug");
    expect(prompt).toContain("Add tests");
    expect(prompt).toContain("engineering journal");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/summarize.test.ts`
Expected: FAIL

**Step 3: Write the implementation**

Create `src/summarize.ts`:

```typescript
import { Database } from "bun:sqlite";

export type SessionGroup = {
  date: string;
  projectId: string;
  projectName: string;
  sessionIds: string[];
  conversations: string[];
};

type ConvoRow = {
  session_id: string;
  date: string;
  project_id: string;
  display_name: string;
  conversation_markdown: string;
};

/** Group unsummarized sessions by date and project */
export function groupSessionsByDateAndProject(
  db: Database,
  filterDate?: string,
  filterProject?: string
): SessionGroup[] {
  let whereClause = `
    WHERE NOT EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.date = date(s.started_at)
        AND je.project_id = s.project_id
    )
  `;
  const params: string[] = [];
  if (filterDate) {
    whereClause += " AND date(s.started_at) = ?";
    params.push(filterDate);
  }
  if (filterProject) {
    whereClause += " AND s.project_id = ?";
    params.push(filterProject);
  }

  const rows = db
    .query(
      `
      SELECT
        c.session_id,
        date(s.started_at) as date,
        s.project_id,
        p.display_name,
        c.conversation_markdown
      FROM conversations c
      JOIN sessions s ON c.session_id = s.id
      JOIN projects p ON s.project_id = p.id
      ${whereClause}
      ORDER BY s.started_at
    `
    )
    .all(...params) as ConvoRow[];

  // Group by date+project
  const groups = new Map<string, SessionGroup>();
  for (const row of rows) {
    const key = `${row.date}|${row.project_id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        date: row.date,
        projectId: row.project_id,
        projectName: row.display_name,
        sessionIds: [],
        conversations: [],
      });
    }
    const group = groups.get(key)!;
    group.sessionIds.push(row.session_id);
    group.conversations.push(row.conversation_markdown);
  }

  return Array.from(groups.values());
}

/** Build the prompt for LLM summarization */
export function buildSummaryPrompt(group: SessionGroup): string {
  const conversationText = group.conversations.join("\n\n---\n\n");
  return `You are writing an engineering journal entry for ${group.date}, project "${group.projectName}".

Given the following conversation transcripts from coding sessions, write a concise narrative covering:
- What the developer was working on
- What approaches they tried
- What problems they encountered
- What they shipped or resolved
- Any notable technical decisions

Write in first person from the developer's perspective. Keep it concise — 2-4 paragraphs.

Also extract:
1. A JSON array of topic tags (3-8 short phrases like "auth bug", "websocket refactor", "test coverage")
2. A JSON array of any git commits mentioned (empty array if none)

Format your response as:

SUMMARY:
<your narrative here>

TOPICS:
<JSON array of topic strings>

COMMITS:
<JSON array of commit descriptions>

Here are the session transcripts:

${conversationText}`;
}

type SummaryResult = {
  summary: string;
  topics: string[];
  commits: string[];
};

/** Parse the LLM response into structured fields */
export function parseSummaryResponse(response: string): SummaryResult {
  const summaryMatch = response.match(
    /SUMMARY:\s*\n([\s\S]*?)(?=\nTOPICS:)/
  );
  const topicsMatch = response.match(
    /TOPICS:\s*\n(\[[\s\S]*?\])/
  );
  const commitsMatch = response.match(
    /COMMITS:\s*\n(\[[\s\S]*?\])/
  );

  const summary = summaryMatch ? summaryMatch[1].trim() : response.trim();

  let topics: string[] = [];
  if (topicsMatch) {
    try {
      topics = JSON.parse(topicsMatch[1]);
    } catch {
      topics = [];
    }
  }

  let commits: string[] = [];
  if (commitsMatch) {
    try {
      commits = JSON.parse(commitsMatch[1]);
    } catch {
      commits = [];
    }
  }

  return { summary, topics, commits };
}

/** Run LLM summarization using Claude Agent SDK */
export async function summarizeGroup(
  group: SessionGroup,
  db: Database
): Promise<void> {
  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  const prompt = buildSummaryPrompt(group);

  let responseText = "";

  const result = query({
    prompt,
    options: {
      model: "claude-sonnet-4-5-20250514",
      maxTurns: 1,
      allowedTools: [],
      permissionMode: "default",
    },
  });

  for await (const message of result) {
    if (message.type === "assistant") {
      const content = message.message.content;
      for (const block of content) {
        if ("text" in block && typeof block.text === "string") {
          responseText += block.text;
        }
      }
    }
  }

  const parsed = parseSummaryResponse(responseText);

  db.prepare(
    `
    INSERT INTO journal_entries (date, project_id, session_ids, summary, topics, commits, generated_at, model_used)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)
    ON CONFLICT(date, project_id) DO UPDATE SET
      summary = excluded.summary,
      topics = excluded.topics,
      commits = excluded.commits,
      generated_at = excluded.generated_at,
      session_ids = excluded.session_ids
  `
  ).run(
    group.date,
    group.projectId,
    JSON.stringify(group.sessionIds),
    parsed.summary,
    JSON.stringify(parsed.topics),
    JSON.stringify(parsed.commits),
    "claude-sonnet-4-5-20250514"
  );
}

/** Summarize all unsummarized groups */
export async function summarizeAll(
  db: Database,
  filterDate?: string,
  filterProject?: string,
  onProgress?: (done: number, total: number, group: SessionGroup) => void
): Promise<{ summarized: number; errors: string[] }> {
  const groups = groupSessionsByDateAndProject(db, filterDate, filterProject);
  let summarized = 0;
  const errors: string[] = [];

  for (const group of groups) {
    try {
      onProgress?.(summarized, groups.length, group);
      await summarizeGroup(group, db);
      summarized++;
    } catch (err) {
      errors.push(`${group.date}/${group.projectId}: ${err}`);
    }
  }

  return { summarized, errors };
}
```

**Step 4: Run test to verify it passes**

Run: `bun test src/summarize.test.ts`
Expected: PASS (only tests grouping and prompt building, not the actual LLM call)

**Step 5: Commit**

```bash
git add src/summarize.ts src/summarize.test.ts
git commit -m "feat: add LLM summarization with session grouping and prompt building"
```

---

### Task 8: Wire Up the Summarize CLI Command

**Files:**
- Modify: `src/index.ts`

**Step 1: Add summarize command**

Add the summarize case to `src/index.ts`:

```typescript
  case "summarize": {
    const config = loadConfig();
    const db = initDb(config.db_path);

    const dateIdx = process.argv.indexOf("--date");
    const filterDate = dateIdx !== -1 ? process.argv[dateIdx + 1] : undefined;
    const projectIdx = process.argv.indexOf("--project");
    const filterProject = projectIdx !== -1 ? process.argv[projectIdx + 1] : undefined;

    const { summarizeAll } = await import("./summarize");
    const result = await summarizeAll(db, filterDate, filterProject, (done, total, group) => {
      console.log(`[${done + 1}/${total}] Summarizing ${group.projectName} (${group.date})...`);
    });

    console.log(`Summarized: ${result.summarized}, Errors: ${result.errors.length}`);
    if (result.errors.length > 0) {
      for (const err of result.errors) {
        console.error(`  ${err}`);
      }
    }
    closeDb();
    break;
  }
```

**Step 2: Test manually**

Run: `bun src/index.ts summarize --date 2026-02-02 --project brooks`
Expected: Should attempt to summarize, making API calls via Agent SDK

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire summarize command to CLI"
```

---

### Task 9: Web Server — Layout and Daily Journal View

**Files:**
- Create: `src/web/server.ts`
- Create: `src/web/views/layout.ts`
- Create: `src/web/views/journal.ts`

**Step 1: Create the Hono server**

Create `src/web/server.ts`:

```typescript
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { Database } from "bun:sqlite";
import { renderLayout } from "./views/layout";
import { renderJournal } from "./views/journal";

export function createApp(db: Database): Hono {
  const app = new Hono();

  // Daily Journal — main view
  app.get("/", (c) => {
    const page = parseInt(c.req.query("page") || "1");
    const html = renderJournal(db, page);
    return c.html(renderLayout("Engineering Notebook", html));
  });

  return app;
}
```

**Step 2: Create the layout template**

Create `src/web/views/layout.ts`:

```typescript
export function renderLayout(title: string, content: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <script src="https://unpkg.com/htmx.org@2.0.4"></script>
  <style>
    :root {
      --bg: #1a1a2e;
      --surface: #16213e;
      --surface-2: #0f3460;
      --text: #e0e0e0;
      --text-muted: #a0a0a0;
      --accent: #e94560;
      --accent-2: #533483;
      --border: #2a2a4a;
      --user: #4fc3f7;
      --claude: #81c784;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
    }
    nav {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 1rem 2rem;
      display: flex;
      gap: 2rem;
      align-items: center;
    }
    nav a {
      color: var(--text-muted);
      text-decoration: none;
      font-weight: 500;
    }
    nav a:hover, nav a.active { color: var(--accent); }
    nav .logo { color: var(--text); font-size: 1.2rem; font-weight: 700; }
    main { max-width: 900px; margin: 2rem auto; padding: 0 1rem; }
    .day-group {
      margin-bottom: 2rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
    }
    .day-header {
      padding: 1rem 1.5rem;
      background: var(--surface-2);
      border-bottom: 1px solid var(--border);
      font-size: 1.1rem;
      font-weight: 600;
    }
    .entry {
      padding: 1rem 1.5rem;
      border-bottom: 1px solid var(--border);
    }
    .entry:last-child { border-bottom: none; }
    .entry-project {
      font-weight: 600;
      color: var(--accent);
      margin-bottom: 0.5rem;
    }
    .entry-summary { color: var(--text); }
    .entry-topics { margin-top: 0.5rem; display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .topic-tag {
      background: var(--accent-2);
      color: var(--text);
      padding: 0.15rem 0.6rem;
      border-radius: 12px;
      font-size: 0.8rem;
    }
    .expand-btn {
      background: none;
      border: 1px solid var(--border);
      color: var(--text-muted);
      padding: 0.3rem 0.8rem;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.85rem;
      margin-top: 0.5rem;
    }
    .expand-btn:hover { border-color: var(--accent); color: var(--accent); }
    .conversation {
      margin-top: 1rem;
      padding: 1rem;
      background: var(--bg);
      border-radius: 4px;
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 0.85rem;
      white-space: pre-wrap;
      max-height: 600px;
      overflow-y: auto;
    }
    .pagination {
      display: flex;
      justify-content: center;
      gap: 1rem;
      margin: 2rem 0;
    }
    .pagination a {
      color: var(--accent);
      text-decoration: none;
      padding: 0.5rem 1rem;
      border: 1px solid var(--border);
      border-radius: 4px;
    }
    .pagination a:hover { background: var(--surface); }
    .search-box {
      width: 100%;
      padding: 0.8rem 1rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text);
      font-size: 1rem;
      margin-bottom: 2rem;
    }
    .search-box:focus { outline: none; border-color: var(--accent); }
    .stat { color: var(--text-muted); font-size: 0.9rem; }
  </style>
</head>
<body>
  <nav>
    <span class="logo">Engineering Notebook</span>
    <a href="/">Journal</a>
    <a href="/projects">Projects</a>
    <a href="/search">Search</a>
  </nav>
  <main>
    ${content}
  </main>
</body>
</html>`;
}
```

**Step 3: Create the journal view**

Create `src/web/views/journal.ts`:

```typescript
import { Database } from "bun:sqlite";

type JournalRow = {
  id: number;
  date: string;
  project_id: string;
  display_name: string;
  summary: string;
  topics: string;
  session_ids: string;
};

type ConvoRow = {
  conversation_markdown: string;
};

const PAGE_SIZE = 20;

export function renderJournal(db: Database, page: number): string {
  const offset = (page - 1) * PAGE_SIZE;

  const entries = db
    .query(
      `
    SELECT je.id, je.date, je.project_id, p.display_name, je.summary, je.topics, je.session_ids
    FROM journal_entries je
    JOIN projects p ON je.project_id = p.id
    ORDER BY je.date DESC, p.display_name
    LIMIT ? OFFSET ?
  `
    )
    .all(PAGE_SIZE, offset) as JournalRow[];

  const totalCount = db
    .query("SELECT count(*) as c FROM journal_entries")
    .get() as { c: number };
  const totalPages = Math.ceil(totalCount.c / PAGE_SIZE);

  if (entries.length === 0) {
    return `
      <h2>No journal entries yet</h2>
      <p class="stat">Run <code>notebook ingest</code> then <code>notebook summarize --all</code> to generate entries.</p>
    `;
  }

  // Group by date
  const byDate = new Map<string, JournalRow[]>();
  for (const entry of entries) {
    if (!byDate.has(entry.date)) {
      byDate.set(entry.date, []);
    }
    byDate.get(entry.date)!.push(entry);
  }

  let html = "";

  for (const [date, dayEntries] of byDate) {
    html += `<div class="day-group">`;
    html += `<div class="day-header">${formatDate(date)}</div>`;

    for (const entry of dayEntries) {
      const topics: string[] = JSON.parse(entry.topics || "[]");
      const sessionIds: string[] = JSON.parse(entry.session_ids || "[]");

      html += `<div class="entry">`;
      html += `<div class="entry-project">${escapeHtml(entry.display_name)} <span class="stat">(${sessionIds.length} session${sessionIds.length !== 1 ? "s" : ""})</span></div>`;
      html += `<div class="entry-summary">${escapeHtml(entry.summary)}</div>`;

      if (topics.length > 0) {
        html += `<div class="entry-topics">`;
        for (const topic of topics) {
          html += `<span class="topic-tag">${escapeHtml(topic)}</span>`;
        }
        html += `</div>`;
      }

      html += `<button class="expand-btn" hx-get="/api/conversations?session_ids=${encodeURIComponent(JSON.stringify(sessionIds))}" hx-target="#convos-${entry.id}" hx-swap="innerHTML">Show conversations</button>`;
      html += `<div id="convos-${entry.id}"></div>`;
      html += `</div>`;
    }

    html += `</div>`;
  }

  // Pagination
  if (totalPages > 1) {
    html += `<div class="pagination">`;
    if (page > 1) {
      html += `<a href="/?page=${page - 1}">Previous</a>`;
    }
    html += `<span class="stat">Page ${page} of ${totalPages}</span>`;
    if (page < totalPages) {
      html += `<a href="/?page=${page + 1}">Next</a>`;
    }
    html += `</div>`;
  }

  return html;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
```

**Step 4: Commit**

```bash
git add src/web/
git commit -m "feat: add Hono web server with journal view and layout"
```

---

### Task 10: Web Server — API Endpoints and Remaining Views

**Files:**
- Create: `src/web/views/projects.ts`
- Create: `src/web/views/search.ts`
- Create: `src/web/views/session.ts`
- Modify: `src/web/server.ts`

**Step 1: Create projects view**

Create `src/web/views/projects.ts`:

```typescript
import { Database } from "bun:sqlite";

type ProjectRow = {
  id: string;
  path: string;
  display_name: string;
  description: string;
  first_session_at: string | null;
  last_session_at: string | null;
  session_count: number;
};

export function renderProjects(db: Database): string {
  const projects = db
    .query(
      `SELECT * FROM projects ORDER BY last_session_at DESC`
    )
    .all() as ProjectRow[];

  if (projects.length === 0) {
    return `<h2>No projects yet</h2><p class="stat">Run <code>notebook ingest</code> first.</p>`;
  }

  let html = `<h2>Projects (${projects.length})</h2>`;
  html += `<div style="display: flex; flex-direction: column; gap: 1rem; margin-top: 1rem;">`;

  for (const p of projects) {
    html += `<div class="day-group" style="margin-bottom: 0;">`;
    html += `<div class="entry">`;
    html += `<div class="entry-project"><a href="/project/${encodeURIComponent(p.id)}" style="color: var(--accent); text-decoration: none;">${escapeHtml(p.display_name || p.id)}</a></div>`;
    if (p.description) {
      html += `<div class="entry-summary">${escapeHtml(p.description)}</div>`;
    }
    html += `<div class="stat" style="margin-top: 0.5rem;">${p.session_count} sessions`;
    if (p.first_session_at && p.last_session_at) {
      html += ` | ${p.first_session_at.split("T")[0]} — ${p.last_session_at.split("T")[0]}`;
    }
    html += `</div>`;
    html += `</div></div>`;
  }

  html += `</div>`;
  return html;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
```

**Step 2: Create search view**

Create `src/web/views/search.ts`:

```typescript
import { Database } from "bun:sqlite";

type SearchRow = {
  id: number;
  date: string;
  project_id: string;
  display_name: string;
  summary: string;
  topics: string;
};

export function renderSearch(db: Database, query: string): string {
  let html = `<h2>Search</h2>`;
  html += `<input class="search-box" type="text" name="q" placeholder="Search journal entries and conversations..."
    hx-get="/search" hx-trigger="keyup changed delay:300ms" hx-target="#results" hx-include="this"
    value="${escapeHtml(query)}">`;
  html += `<div id="results">`;

  if (query) {
    html += renderSearchResults(db, query);
  }

  html += `</div>`;
  return html;
}

export function renderSearchResults(db: Database, query: string): string {
  const pattern = `%${query}%`;

  // Search journal summaries
  const journalResults = db
    .query(
      `
    SELECT je.id, je.date, je.project_id, p.display_name, je.summary, je.topics
    FROM journal_entries je
    JOIN projects p ON je.project_id = p.id
    WHERE je.summary LIKE ? OR je.topics LIKE ?
    ORDER BY je.date DESC
    LIMIT 20
  `
    )
    .all(pattern, pattern) as SearchRow[];

  // Search conversations
  const convoResults = db
    .query(
      `
    SELECT s.id as session_id, date(s.started_at) as date, p.display_name, c.conversation_markdown
    FROM conversations c
    JOIN sessions s ON c.session_id = s.id
    JOIN projects p ON s.project_id = p.id
    WHERE c.conversation_markdown LIKE ?
    ORDER BY s.started_at DESC
    LIMIT 20
  `
    )
    .all(pattern) as { session_id: string; date: string; display_name: string; conversation_markdown: string }[];

  let html = "";

  if (journalResults.length > 0) {
    html += `<h3 style="margin: 1rem 0 0.5rem;">Journal Entries (${journalResults.length})</h3>`;
    for (const r of journalResults) {
      html += `<div class="entry" style="background: var(--surface); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 0.5rem;">`;
      html += `<div class="entry-project">${escapeHtml(r.display_name)} <span class="stat">${r.date}</span></div>`;
      html += `<div class="entry-summary">${highlightMatch(escapeHtml(r.summary), query)}</div>`;
      html += `</div>`;
    }
  }

  if (convoResults.length > 0) {
    html += `<h3 style="margin: 1rem 0 0.5rem;">Conversations (${convoResults.length})</h3>`;
    for (const r of convoResults) {
      html += `<div class="entry" style="background: var(--surface); border: 1px solid var(--border); border-radius: 8px; margin-bottom: 0.5rem;">`;
      html += `<div class="entry-project">${escapeHtml(r.display_name)} <span class="stat">${r.date}</span></div>`;
      html += `<a href="/session/${r.session_id}" style="color: var(--accent); font-size: 0.85rem;">View session</a>`;
      html += `</div>`;
    }
  }

  if (journalResults.length === 0 && convoResults.length === 0) {
    html += `<p class="stat">No results found for "${escapeHtml(query)}"</p>`;
  }

  return html;
}

function highlightMatch(text: string, query: string): string {
  if (!query) return text;
  const regex = new RegExp(`(${escapeRegex(query)})`, "gi");
  return text.replace(regex, `<mark style="background: var(--accent-2); color: var(--text);">$1</mark>`);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
```

**Step 3: Create session detail view**

Create `src/web/views/session.ts`:

```typescript
import { Database } from "bun:sqlite";

type SessionRow = {
  id: string;
  project_id: string;
  project_path: string;
  source_path: string;
  started_at: string;
  ended_at: string | null;
  git_branch: string | null;
  version: string | null;
  message_count: number;
  display_name: string;
  conversation_markdown: string;
};

export function renderSession(db: Database, sessionId: string): string {
  const session = db
    .query(
      `
    SELECT s.*, p.display_name, c.conversation_markdown
    FROM sessions s
    JOIN projects p ON s.project_id = p.id
    JOIN conversations c ON c.session_id = s.id
    WHERE s.id = ?
  `
    )
    .get(sessionId) as SessionRow | null;

  if (!session) {
    return `<h2>Session not found</h2>`;
  }

  let html = `<h2>${escapeHtml(session.display_name)} — Session</h2>`;
  html += `<div class="stat" style="margin-bottom: 1rem;">`;
  html += `${session.started_at.split("T")[0]} | ${session.message_count} messages`;
  if (session.git_branch) html += ` | branch: ${escapeHtml(session.git_branch)}`;
  html += `<br>Source: <code>${escapeHtml(session.source_path)}</code>`;
  html += `</div>`;

  html += `<div class="conversation">${escapeHtml(session.conversation_markdown)}</div>`;

  return html;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
```

**Step 4: Add routes to server.ts**

Update `src/web/server.ts` to include all routes:

```typescript
import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { renderLayout } from "./views/layout";
import { renderJournal } from "./views/journal";
import { renderProjects } from "./views/projects";
import { renderSearch, renderSearchResults } from "./views/search";
import { renderSession } from "./views/session";

export function createApp(db: Database): Hono {
  const app = new Hono();

  // Daily Journal
  app.get("/", (c) => {
    const page = parseInt(c.req.query("page") || "1");
    return c.html(renderLayout("Engineering Notebook", renderJournal(db, page)));
  });

  // Projects index
  app.get("/projects", (c) => {
    return c.html(renderLayout("Projects", renderProjects(db)));
  });

  // Project timeline
  app.get("/project/:id", (c) => {
    const projectId = c.req.param("id");
    const page = parseInt(c.req.query("page") || "1");
    return c.html(
      renderLayout(
        `Project: ${projectId}`,
        renderJournal(db, page, projectId)
      )
    );
  });

  // Search
  app.get("/search", (c) => {
    const q = c.req.query("q") || "";
    // If HTMX request, return just results
    if (c.req.header("HX-Request")) {
      return c.html(renderSearchResults(db, q));
    }
    return c.html(renderLayout("Search", renderSearch(db, q)));
  });

  // Session detail
  app.get("/session/:id", (c) => {
    const sessionId = c.req.param("id");
    return c.html(renderLayout("Session", renderSession(db, sessionId)));
  });

  // API: get conversations for HTMX expand
  app.get("/api/conversations", (c) => {
    const sessionIdsRaw = c.req.query("session_ids");
    if (!sessionIdsRaw) return c.text("Missing session_ids", 400);

    let sessionIds: string[];
    try {
      sessionIds = JSON.parse(decodeURIComponent(sessionIdsRaw));
    } catch {
      return c.text("Invalid session_ids", 400);
    }

    const placeholders = sessionIds.map(() => "?").join(",");
    const convos = db
      .query(
        `SELECT session_id, conversation_markdown FROM conversations WHERE session_id IN (${placeholders}) ORDER BY session_id`
      )
      .all(...sessionIds) as { session_id: string; conversation_markdown: string }[];

    let html = "";
    for (const convo of convos) {
      html += `<div class="conversation">${escapeHtml(convo.conversation_markdown)}</div>`;
    }

    return c.html(html);
  });

  return app;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
```

Note: `renderJournal` needs to accept an optional `projectId` filter parameter. Update its signature in `src/web/views/journal.ts`:

```typescript
export function renderJournal(db: Database, page: number, projectId?: string): string {
```

Add filtering to the query:
```typescript
  const whereClause = projectId ? "WHERE je.project_id = ?" : "";
  const countWhereClause = projectId ? "WHERE project_id = ?" : "";
  const queryParams = projectId ? [PAGE_SIZE, offset, projectId] : [PAGE_SIZE, offset];
  // ... adjust the SQL queries accordingly
```

**Step 5: Commit**

```bash
git add src/web/
git commit -m "feat: add projects, search, session views and API routes"
```

---

### Task 11: Wire Up the Serve CLI Command

**Files:**
- Modify: `src/index.ts`

**Step 1: Add serve command**

```typescript
  case "serve": {
    const config = loadConfig();
    const db = initDb(config.db_path);
    const { createApp } = await import("./web/server");
    const app = createApp(db);

    const port = (() => {
      const portIdx = process.argv.indexOf("--port");
      return portIdx !== -1 ? parseInt(process.argv[portIdx + 1]) : config.port;
    })();

    console.log(`Engineering Notebook running at http://localhost:${port}`);
    Bun.serve({
      fetch: app.fetch,
      port,
    });
    break;
  }
```

**Step 2: Test manually**

Run: `bun src/index.ts serve`
Expected: Server starts at http://localhost:3000

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire serve command to CLI"
```

---

### Task 12: End-to-End Test with Real Data

**Files:** None (manual testing only)

**Step 1: Run full pipeline**

```bash
bun src/index.ts ingest
```

Verify it processes sessions and reports counts.

**Step 2: Check the database**

```bash
bun -e "
const { Database } = require('bun:sqlite');
const { homedir } = require('os');
const { join } = require('path');
const db = new Database(join(homedir(), '.config/engineering-notebook/notebook.db'));
console.log('Projects:', db.query('SELECT count(*) as c FROM projects').get());
console.log('Sessions:', db.query('SELECT count(*) as c FROM sessions').get());
console.log('Conversations:', db.query('SELECT count(*) as c FROM conversations').get());
console.log('Top projects:', db.query('SELECT id, display_name, session_count FROM projects ORDER BY session_count DESC LIMIT 10').all());
"
```

**Step 3: Summarize a small batch**

```bash
bun src/index.ts summarize --date 2026-02-02 --project brooks
```

**Step 4: Start the server and verify the UI**

```bash
bun src/index.ts serve
```

Open http://localhost:3000 and verify:
- Journal view shows entries (if any were summarized)
- Projects page lists projects
- Search works
- Session detail shows conversation

**Step 5: Fix any issues found during testing**

**Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during end-to-end testing"
```

---

### Task 13: Run All Tests

**Step 1: Run the full test suite**

Run: `bun test`
Expected: All tests pass

**Step 2: Fix any failures**

**Step 3: Final commit**

```bash
git add -A
git commit -m "chore: ensure all tests pass"
```
