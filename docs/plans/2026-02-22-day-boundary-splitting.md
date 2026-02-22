# Day-Boundary Splitting Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Split session conversations at configurable day boundaries so each (project, logical-date) tuple gets its own summary, even when a session spans multiple calendar days.

**Architecture:** Include full ISO timestamps in the conversation markdown so we can parse and split by logical date at summarization time. A "logical date" is the calendar date shifted by `day_start_hour` (default 5am) — a message at 3am on Feb 21 belongs to Feb 20. The split happens in `groupSessionsByDateAndProject`, which currently groups whole sessions by `date(started_at)`. It will instead parse message timestamps from the markdown, compute each message's logical date, and build per-(project, logical-date) conversation slices.

**Tech Stack:** TypeScript, Bun, SQLite, existing parser/summarize modules

---

### Task 1: Add `day_start_hour` to config

**Files:**
- Modify: `src/config.ts:5-10` (Config type and defaultConfig)

**Step 1:** Add `day_start_hour: number` to the `Config` type and set default to `5` in `defaultConfig()`.

```typescript
export type Config = {
  sources: string[];
  exclude: string[];
  db_path: string;
  port: number;
  day_start_hour: number;
};
```

Default:
```typescript
day_start_hour: 5,
```

**Step 2:** Verify existing tests still pass.

Run: `bun test`

**Step 3:** Commit.

```bash
git add src/config.ts
git commit -m "feat: add day_start_hour config (default 5am)"
```

---

### Task 2: Include full date in conversation markdown

**Files:**
- Modify: `src/parser.ts:177-192` (toMarkdown function)
- Modify: `src/web/views/conversation.ts` (renderConversation parser)
- Modify: `src/parser.test.ts` (update expected markdown format)

Currently `toMarkdown()` formats messages as `**User (17:37):** text`. Change to `**User (2026-02-21 17:37):** text`.

**Step 1:** In `parser.ts`, change `toMarkdown()` to use full date+time:

```typescript
// Change from:
const time = formatTime(msg.timestamp);
// To:
const time = msg.timestamp.slice(0, 16).replace("T", " ");
```

The session header already has the date range, but per-message dates are needed for day splitting.

**Step 2:** Update `renderConversation()` in `src/web/views/conversation.ts` to parse the new format. The regex currently matches `**Speaker (HH:MM):**`. Update it to also match `**Speaker (YYYY-MM-DD HH:MM):**`. Make it handle both formats so old stored conversations still render.

The regex should become something like:
```typescript
/^\*\*(\w+)\s+\((\d{4}-\d{2}-\d{2}\s+)?\d{2}:\d{2}\):\*\*/
```

Extract the time portion for display (just show HH:MM in the UI — the date is in the day header already).

**Step 3:** Update parser tests to expect the new format with dates.

**Step 4:** Run tests: `bun test`

**Step 5:** Commit.

```bash
git add src/parser.ts src/web/views/conversation.ts src/parser.test.ts
git commit -m "feat: include full date in conversation markdown timestamps"
```

---

### Task 3: Add `logicalDate` helper function

**Files:**
- Modify: `src/summarize.ts` (add helper)
- Create: `src/summarize.test.ts` (add test for logicalDate)

**Step 1:** Write failing tests for `logicalDate(timestamp, dayStartHour)`:

```typescript
test("logicalDate returns same day for afternoon timestamps", () => {
  expect(logicalDate("2026-02-21 17:37", 5)).toBe("2026-02-21");
});

test("logicalDate returns previous day for early morning timestamps", () => {
  expect(logicalDate("2026-02-21 03:30", 5)).toBe("2026-02-20");
});

test("logicalDate returns same day at exactly day_start_hour", () => {
  expect(logicalDate("2026-02-21 05:00", 5)).toBe("2026-02-21");
});

test("logicalDate handles midnight boundary", () => {
  expect(logicalDate("2026-02-21 00:00", 5)).toBe("2026-02-20");
});
```

**Step 2:** Run tests, confirm they fail.

**Step 3:** Implement `logicalDate`:

```typescript
export function logicalDate(timestamp: string, dayStartHour: number): string {
  // timestamp is "YYYY-MM-DD HH:MM" or ISO format
  const normalized = timestamp.replace("T", " ");
  const dateStr = normalized.slice(0, 10);
  const hour = parseInt(normalized.slice(11, 13));
  if (hour < dayStartHour) {
    // Belongs to previous day
    const d = new Date(dateStr + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  return dateStr;
}
```

**Step 4:** Run tests, confirm they pass.

**Step 5:** Commit.

```bash
git add src/summarize.ts src/summarize.test.ts
git commit -m "feat: add logicalDate helper for day-boundary splitting"
```

---

### Task 4: Rewrite `groupSessionsByDateAndProject` to split by logical date

**Files:**
- Modify: `src/summarize.ts` (rewrite grouping function)
- Modify: `src/summarize.test.ts` (update grouping test)

This is the core change. Currently the function groups whole sessions by `date(started_at)`. The new version:

1. Fetches all conversations for unsummarized sessions (same query, but remove the `date(s.started_at)` grouping from the NOT EXISTS check)
2. For each conversation, parses the markdown to extract per-message timestamps
3. Groups messages by `logicalDate(timestamp, dayStartHour)`
4. Builds a `SessionGroup` per (project, logical-date) with only the messages from that day

**Step 1:** Add `dayStartHour` parameter to `groupSessionsByDateAndProject`.

**Step 2:** Change the NOT EXISTS subquery. Currently it checks `je.date = date(s.started_at)`. A session spanning multiple days could have some days summarized and others not. The new check: fetch all sessions that might contribute to unsummarized days. The simplest approach — fetch all sessions for the filtered date range, then in TypeScript check which (project, logical-date) combos are already in journal_entries.

**Step 3:** For each conversation markdown, split lines by logical date:

```typescript
function splitConversationByDay(
  markdown: string,
  dayStartHour: number
): Map<string, string> {
  const byDay = new Map<string, string[]>();
  for (const line of markdown.split("\n")) {
    // Match **Speaker (YYYY-MM-DD HH:MM):**
    const match = line.match(/^\*\*\w+\s+\((\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\):\*\*/);
    if (match) {
      const day = logicalDate(match[1], dayStartHour);
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day)!.push(line);
    } else {
      // Non-message lines (header, separator) — skip or attach to current day
    }
  }
  const result = new Map<string, string>();
  for (const [day, lines] of byDay) {
    result.set(day, lines.join("\n"));
  }
  return result;
}
```

**Step 4:** Rebuild the grouping: iterate conversations, split each by day, accumulate into `SessionGroup` per (project, logical-date).

**Step 5:** Update the NOT EXISTS logic: after building groups, filter out any (project, date) that already has a journal_entry.

**Step 6:** Update tests. The existing grouping test uses sessions on a single day, so it should still work. Add a new test with a session spanning midnight to verify splitting.

**Step 7:** Run tests: `bun test`

**Step 8:** Commit.

```bash
git add src/summarize.ts src/summarize.test.ts
git commit -m "feat: split conversations by logical day boundary for summarization"
```

---

### Task 5: Thread `dayStartHour` through the CLI

**Files:**
- Modify: `src/index.ts` (pass config.day_start_hour to summarize)
- Modify: `src/summarize.ts` (accept dayStartHour in summarizeAll)

**Step 1:** Add `dayStartHour` parameter to `summarizeAll()` and pass it through to `groupSessionsByDateAndProject()`.

**Step 2:** In `src/index.ts`, pass `config.day_start_hour` when calling `summarizeAll()` and `groupSessionsByDateAndProject()`.

**Step 3:** Run full test suite: `bun test`

**Step 4:** Commit.

```bash
git add src/index.ts src/summarize.ts
git commit -m "feat: thread day_start_hour config through CLI to summarizer"
```

---

### Task 6: Re-ingest and re-summarize

**Step 1:** Wipe DB:
```bash
rm -f ~/.config/engineering-notebook/notebook.db*
```

**Step 2:** Re-ingest (new markdown format will include full dates):
```bash
bun src/index.ts ingest
```

**Step 3:** Re-summarize last 3 days:
```bash
bun src/index.ts summarize --date 2026-02-20
bun src/index.ts summarize --date 2026-02-21
bun src/index.ts summarize --date 2026-02-22
```

**Step 4:** Verify that sessions spanning midnight now produce separate journal entries per day. Check that the prime-radiant-inc session (Feb 20 22:51 → Feb 21 19:33) produces entries under both Feb 20 and Feb 21.

**Step 5:** Restart server and visually verify:
```bash
bun src/index.ts serve --port 3001
```

**Step 6:** Commit if any fixups needed.
