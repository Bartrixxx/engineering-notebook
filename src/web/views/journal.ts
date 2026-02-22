import { Database } from "bun:sqlite";

type SessionDayRow = {
  id: string;
  parent_session_id: string | null;
  project_id: string;
  display_name: string;
  started_at: string;
  ended_at: string | null;
  git_branch: string | null;
  message_count: number;
  date: string;
};

type JournalSummaryRow = {
  date: string;
  project_id: string;
  headline: string;
  summary: string;
  topics: string;
  session_ids: string;
};

const PAGE_SIZE = 20;

export function renderJournal(
  db: Database,
  page: number,
  projectId?: string
): string {
  const offset = (page - 1) * PAGE_SIZE;

  const whereClause = projectId ? "WHERE s.project_id = ?" : "";
  const countWhereClause = projectId ? "WHERE project_id = ?" : "";

  // Query sessions directly, grouped by date
  const sessions = db
    .query(
      `
    SELECT s.id, s.parent_session_id, s.project_id, p.display_name, s.started_at, s.ended_at,
           s.git_branch, s.message_count, date(s.started_at) as date
    FROM sessions s
    JOIN projects p ON s.project_id = p.id
    ${whereClause}
    ORDER BY s.started_at DESC
    LIMIT ? OFFSET ?
  `
    )
    .all(
      ...(projectId ? [projectId, PAGE_SIZE * 5, offset * 5] : [PAGE_SIZE * 5, offset * 5])
    ) as SessionDayRow[];

  const totalSessionCount = db
    .query(`SELECT count(*) as c FROM sessions ${countWhereClause}`)
    .get(...(projectId ? [projectId] : [])) as { c: number };

  if (sessions.length === 0) {
    return `
      <h2>No sessions yet</h2>
      <p class="stat">Run <code>notebook ingest</code> to import sessions from your Claude conversations.</p>
    `;
  }

  // Group by date, then by project within each date
  const byDate = new Map<string, Map<string, SessionDayRow[]>>();
  for (const session of sessions) {
    if (!byDate.has(session.date)) {
      byDate.set(session.date, new Map());
    }
    const dateGroup = byDate.get(session.date)!;
    if (!dateGroup.has(session.project_id)) {
      dateGroup.set(session.project_id, []);
    }
    dateGroup.get(session.project_id)!.push(session);
  }

  // Pre-fetch journal entry summaries for the dates we have
  const dates = [...byDate.keys()];
  const summaryMap = new Map<string, JournalSummaryRow>();
  if (dates.length > 0) {
    const datePlaceholders = dates.map(() => "?").join(",");
    const projectFilter = projectId ? " AND je.project_id = ?" : "";
    const summaryParams = projectId ? [...dates, projectId] : dates;
    const summaries = db
      .query(
        `
      SELECT je.date, je.project_id, je.headline, je.summary, je.topics, je.session_ids
      FROM journal_entries je
      WHERE je.date IN (${datePlaceholders})${projectFilter}
    `
      )
      .all(...summaryParams) as JournalSummaryRow[];

    for (const s of summaries) {
      summaryMap.set(`${s.date}|${s.project_id}`, s);
    }
  }

  let html = "";

  for (const [date, projectGroups] of byDate) {
    html += `<div class="day-group">`;
    html += `<div class="day-header">${formatDate(date)}</div>`;

    for (const [projId, projectSessions] of projectGroups) {
      const displayName = projectSessions[0]!.display_name;
      const totalMessages = projectSessions.reduce((sum, s) => sum + s.message_count, 0);
      const earliest = projectSessions[projectSessions.length - 1]!.started_at;
      const latestSession = projectSessions[0]!;
      const latest = latestSession.ended_at || latestSession.started_at;
      const timeRange = `${formatTime(earliest)} - ${formatTime(latest)}`;
      const branches = [
        ...new Set(
          projectSessions
            .map((s) => s.git_branch)
            .filter((b): b is string => b !== null)
        ),
      ];

      html += `<div class="entry">`;
      html += `<div class="entry-project">`;
      html += `<a href="/project/${encodeURIComponent(projId)}" style="color: var(--accent); text-decoration: none;">${escapeHtml(displayName)}</a>`;
      html += ` <span class="stat">${totalMessages} messages &middot; ${timeRange}`;
      if (branches.length > 0) {
        html += ` &middot; ${branches.map((b) => `<code>${escapeHtml(b)}</code>`).join(", ")}`;
      }
      html += `</span>`;
      html += `</div>`;

      // Show journal summary if it exists
      const summaryKey = `${date}|${projId}`;
      const summary = summaryMap.get(summaryKey);
      if (summary) {
        if (summary.headline) {
          html += `<div class="entry-headline">${escapeHtml(summary.headline)}</div>`;
        }
        html += `<div class="entry-summary">${escapeHtml(summary.summary)}</div>`;
        const topics: string[] = JSON.parse(summary.topics || "[]");
        if (topics.length > 0) {
          html += `<div class="entry-topics">`;
          for (const topic of topics) {
            html += `<span class="topic-tag">${escapeHtml(topic)}</span>`;
          }
          html += `</div>`;
        }
      }

      // Group chained sessions (parent → child) into logical conversations
      const sessionById = new Map(projectSessions.map((s) => [s.id, s]));
      const childOf = new Map<string, string[]>();
      const roots: SessionDayRow[] = [];
      for (const s of projectSessions) {
        if (s.parent_session_id && sessionById.has(s.parent_session_id)) {
          const children = childOf.get(s.parent_session_id) || [];
          children.push(s.id);
          childOf.set(s.parent_session_id, children);
        } else {
          roots.push(s);
        }
      }

      // Build chains: root → child → grandchild...
      function buildChain(root: SessionDayRow): SessionDayRow[] {
        const chain = [root];
        let current = root.id;
        while (childOf.has(current)) {
          const kids = childOf.get(current)!;
          const child = sessionById.get(kids[0]!)!;
          chain.push(child);
          current = child.id;
        }
        return chain;
      }

      // List sessions, collapsing chains
      html += `<div style="margin-top: 0.5rem;">`;
      for (const root of roots) {
        const chain = buildChain(root);
        if (chain.length === 1) {
          const session = chain[0]!;
          const sessionTime = `${formatTime(session.started_at)}${session.ended_at ? " - " + formatTime(session.ended_at) : ""}`;
          html += `<div class="session-item">`;
          html += `<a class="session-link" href="/session/${encodeURIComponent(session.id)}">${sessionTime}</a>`;
          html += `<span class="session-meta">${session.message_count} messages`;
          if (session.git_branch) {
            html += ` &middot; ${escapeHtml(session.git_branch)}`;
          }
          html += `</span>`;
          html += `</div>`;
        } else {
          // Chained session: show combined time range and total messages
          const first = chain[0]!;
          const last = chain[chain.length - 1]!;
          const totalMessages = chain.reduce((sum, s) => sum + s.message_count, 0);
          const chainStart = formatTime(first.started_at);
          const chainEnd = last.ended_at ? formatTime(last.ended_at) : formatTime(last.started_at);
          html += `<div class="session-item">`;
          html += `<a class="session-link" href="/session/${encodeURIComponent(first.id)}">${chainStart} - ${chainEnd}</a>`;
          html += `<span class="session-meta">${totalMessages} messages &middot; ${chain.length} continued sessions`;
          if (first.git_branch) {
            html += ` &middot; ${escapeHtml(first.git_branch)}`;
          }
          html += `</span>`;
          html += `</div>`;
        }
      }
      html += `</div>`;

      // HTMX expand for conversations
      const sessionIds = JSON.stringify(projectSessions.map((s) => s.id));
      const expandId = `convos-${date}-${projId}`.replace(/[^a-zA-Z0-9-]/g, "_");
      html += `<button class="expand-btn" hx-get="/api/conversations?session_ids=${encodeURIComponent(sessionIds)}" hx-target="#${expandId}" hx-swap="innerHTML">Show conversations</button>`;
      html += `<div id="${expandId}"></div>`;

      html += `</div>`;
    }

    html += `</div>`;
  }

  // Pagination
  const estimatedTotalPages = Math.max(
    1,
    Math.ceil(totalSessionCount.c / (PAGE_SIZE * 5))
  );
  if (estimatedTotalPages > 1) {
    const baseUrl = projectId ? `/project/${encodeURIComponent(projectId)}` : "/";
    html += `<div class="pagination">`;
    if (page > 1) {
      html += `<a href="${baseUrl}?page=${page - 1}">Previous</a>`;
    }
    html += `<span class="stat">Page ${page} of ${estimatedTotalPages}</span>`;
    if (page < estimatedTotalPages) {
      html += `<a href="${baseUrl}?page=${page + 1}">Next</a>`;
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

function formatTime(isoStr: string): string {
  // Extract HH:MM from an ISO datetime string
  const match = isoStr.match(/T(\d{2}:\d{2})/);
  return match ? match[1]! : isoStr;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
