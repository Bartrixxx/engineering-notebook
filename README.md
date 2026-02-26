# Engineering Notebook

A CLI tool that ingests [Claude Code](https://docs.anthropic.com/en/docs/claude-code) session transcripts, generates LLM-powered daily summaries, and serves a web UI for browsing your engineering journal.

Think of it as an automatic engineering diary — it watches your AI coding sessions and distills them into a searchable, browsable narrative of what you built, what problems you hit, and what decisions you made.

## How It Works

1. **Ingest** — Scans directories of Claude Code JSONL session files, parses out the human-readable conversation (stripping tool calls, thinking blocks, etc.), and stores them in SQLite.
2. **Summarize** — Groups sessions by date and project, then uses Claude to write concise engineering journal entries with topics and commit references.
3. **Serve** — Runs a web server with a browsable UI: daily journal, project views, session transcripts, and full-text search.

## Install

Requires [Bun](https://bun.sh) v1.1+.

```sh
git clone https://github.com/prime-radiant-inc/engineering-notebook.git
cd engineering-notebook
bun install
bun link  # makes `engineering-notebook` available globally
```

## Quick Start

```sh
# 1. Ingest your Claude Code sessions (defaults to ~/.claude/projects)
engineering-notebook ingest

# 2. Generate journal summaries (uses Claude Code's auth)
engineering-notebook summarize --all

# 3. Browse your journal
engineering-notebook serve
# Open http://localhost:3000
```

## Usage

### `engineering-notebook ingest`

Scan source directories and ingest session files into the database.

```sh
engineering-notebook ingest                    # scan default sources
engineering-notebook ingest --source ~/extra   # add an extra source directory
engineering-notebook ingest --force            # re-ingest already-processed sessions
```

### `engineering-notebook summarize`

Generate LLM summaries for ingested sessions.

```sh
engineering-notebook summarize --all                      # summarize everything unsummarized
engineering-notebook summarize --date 2026-02-22          # summarize a specific date
engineering-notebook summarize --project myapp            # summarize a specific project
engineering-notebook summarize --date 2026-02-22 --project myapp  # both filters
```

### `engineering-notebook serve`

Start the web server.

```sh
engineering-notebook serve              # default port 3000
engineering-notebook serve --port 8080  # custom port
```

## Configuration

Config lives at `~/.config/engineering-notebook/config.json`:

```json
{
  "sources": ["~/.claude/projects"],
  "exclude": ["-private-tmp*", "*-skill-test-*"],
  "db_path": "~/.config/engineering-notebook/notebook.db",
  "port": 3000,
  "day_start_hour": 5,
  "remote_sources": [],
  "auto_sync_interval": 60
}
```

| Field                | Description                                                                              | Default                                      |
| -------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------- |
| `sources`            | Directories to scan for session files                                                    | `["~/.claude/projects"]`                     |
| `exclude`            | Glob patterns for directories to skip                                                    | `["-private-tmp*", "*-skill-test-*"]`        |
| `db_path`            | SQLite database location                                                                 | `~/.config/engineering-notebook/notebook.db` |
| `port`               | Web server port                                                                          | `3000`                                       |
| `day_start_hour`     | Hour (0-23) when a "day" starts (for grouping late-night sessions with the previous day) | `5`                                          |
| `remote_sources`     | SSH remote sources to sync before ingesting                                              | `[]`                                         |
| `auto_sync_interval` | Seconds between auto-syncs when serving                                                  | `60`                                         |

### Remote Sources

Sync session files from remote machines over SSH:

```json
{
  "remote_sources": [
    {
      "name": "workstation",
      "host": "work.local",
      "remote_path": "~/.claude/projects",
      "enabled": true
    }
  ]
}
```

## Development

```sh
bun install
bun test          # run tests
bun src/index.ts  # run from source
```

## Tech Stack

- [Bun](https://bun.sh) — runtime, bundler, test runner, SQLite
- [Hono](https://hono.dev) — web framework
- [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk) — LLM summarization
- HTMX — interactive web UI

## License

Apache 2.0 — see [LICENSE](LICENSE).
