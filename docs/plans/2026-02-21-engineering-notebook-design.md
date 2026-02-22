# Engineering Notebook — Design

An automated engineering journal that reads Claude Code session transcripts and produces a day-by-day narrative of projects worked on, approaches tried, and software shipped.

## Architecture

Single Bun application (monolith CLI) with three subcommands:

- `notebook ingest` — scans session directories, extracts user+assistant conversation text, stores in SQLite
- `notebook summarize` — runs LLM summarization on un-summarized sessions via Claude Agent SDK for TypeScript
- `notebook serve` — starts a Hono web server with HTMX-powered UI

## Stack

- **Runtime:** Bun
- **Server:** Hono
- **Database:** SQLite (via bun:sqlite)
- **Frontend:** Server-rendered HTML + HTMX + Tailwind/Pico CSS
- **LLM:** Claude Agent SDK for TypeScript

## Data Model

Three-stage pipeline: Raw Sessions → Extracted Conversations → Journal Entries

### projects

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | Derived from path (e.g. "brooks") |
| path | TEXT | Original project path |
| display_name | TEXT | User-editable name |
| description | TEXT | User-editable brief description |
| first_session_at | DATETIME | |
| last_session_at | DATETIME | |
| session_count | INTEGER | |

### sessions

| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | Session UUID |
| project_id | TEXT FK | References projects.id |
| project_path | TEXT | Full path to project |
| source_path | TEXT | Path to .jsonl file |
| started_at | DATETIME | |
| ended_at | DATETIME | |
| git_branch | TEXT | Nullable |
| version | TEXT | Claude Code version |
| message_count | INTEGER | |
| ingested_at | DATETIME | |

### conversations

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| session_id | TEXT FK | References sessions.id |
| conversation_markdown | TEXT | Clean user+assistant conversation |
| extracted_at | DATETIME | |

### journal_entries

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | |
| date | DATE | |
| project_id | TEXT FK | References projects.id |
| session_ids | TEXT | JSON array of session UUIDs |
| summary | TEXT | LLM-generated narrative |
| topics | TEXT | JSON array of extracted themes |
| commits | TEXT | JSON array, nullable |
| generated_at | DATETIME | |
| model_used | TEXT | |

## Conversation Extraction

The critical transformation: raw JSONL → clean conversation markdown.

### Extraction rules

- Include `type === "user"` records → extract `message.content`
- Include `type === "assistant"` records → extract text content blocks from `message.content` array, skip `thinking` blocks
- Skip `progress`, `system`, `queue-operation` records
- Preserve timestamps and ordering

### Output format

Each message on a single line (grep-friendly):

```
**Jesse (17:37):** We're inside Brooks, our agentive software development studio...
**Claude (17:37):** Let me investigate this. I'll start by checking the codebase...
```

Full session header:

```markdown
# Session: brooks
**Date:** 2026-02-02 17:37 - 19:15 | **Branch:** main | **Project:** /Users/jesse/.../brooks

---

**Jesse (17:37):** ...
**Claude (17:37):** ...
```

## LLM Summarization

For each date + project combination:

1. Collect all extracted conversations for that date + project
2. Send conversation markdown to Claude via Agent SDK with a journal-writing prompt
3. Store summary, extracted topics, and mentioned commits
4. Only process un-summarized sessions (track via `generated_at`)

### Prompt strategy

The summarizer prompt instructs Claude to write a first-person engineering journal entry covering: what was worked on, approaches tried, problems encountered, what shipped or was resolved, and notable decisions.

## Web App

Hono server with HTMX for dynamic interactions, server-rendered HTML.

### Views

- **Daily Journal** — main view. Calendar/timeline of days with narrative summaries per project. Expand to see extracted conversations.
- **Projects Index** — list of all projects with display names, descriptions, session counts, date ranges. Click to filter.
- **Project View** — filtered timeline for a single project.
- **Search** — full-text search across summaries and conversations.
- **Session Detail** — full extracted conversation with reference to raw transcript file.

## CLI Interface

```
notebook ingest [--source <path>] [--force]
  Scan session directories, extract conversations, store in SQLite.
  --source: additional session directory (default: ~/.claude/projects/)
  --force: re-process already-ingested sessions

notebook summarize [--date <YYYY-MM-DD>] [--project <name>] [--all]
  Generate LLM summaries for extracted conversations.
  --date: only summarize sessions from this date
  --project: only summarize sessions for this project
  --all: summarize all un-summarized sessions

notebook serve [--port <number>]
  Start the Hono web server (default port 3000)

notebook config
  Interactive configuration: add/remove source directories, exclude projects
```

## Configuration

Stored in `~/.config/engineering-notebook/config.json`:

```json
{
  "sources": [
    "~/.claude/projects"
  ],
  "exclude": [
    "-private-tmp*",
    "*-skill-test-*"
  ],
  "db_path": "~/.config/engineering-notebook/notebook.db",
  "port": 3000
}
```

## Session Data Sources

Primary source: `~/.claude/projects/<project-name>/<session-uuid>.jsonl`

- 931 existing sessions, 1.4 GB
- Each JSONL has record types: `user`, `assistant`, `progress`, `system`, `queue-operation`
- Sessions organized by project path (encoded as directory name)
- Users can add additional source directories (e.g., sessions synced from other hosts)
- Paths matching exclude patterns are skipped
