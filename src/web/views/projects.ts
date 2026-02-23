import { Database } from "bun:sqlite";
import { escapeHtml, formatDateShort, groupByTimeBucket } from "./helpers";
import { renderEntryConversations } from "./journal";

type ProjectRow = {
  id: string;
  display_name: string;
  last_session_at: string | null;
};

type ProjectEntryRow = {
  id: number;
  date: string;
  headline: string;
  summary: string;
  topics: string;
  session_ids: string;
};

/**
 * Panel 1: Project index sorted by recency.
 */
export function renderProjectIndex(db: Database, selectedProject?: string): string {
  const projects = db.query(`
    SELECT id, display_name, last_session_at
    FROM projects
    ORDER BY last_session_at DESC
  `).all() as ProjectRow[];

  if (projects.length === 0) {
    return '<div class="empty-state">No projects yet.</div>';
  }

  let html = "";
  for (const p of projects) {
    const isSelected = p.id === selectedProject;
    const lastActive = p.last_session_at ? formatDateShort(p.last_session_at.slice(0, 10)) : "No sessions";
    html += `<a class="index-item${isSelected ? " selected" : ""}" href="/projects?project=${encodeURIComponent(p.id)}" hx-get="/api/projects/timeline?project=${encodeURIComponent(p.id)}" hx-target="#panel-entries" hx-push-url="/projects?project=${encodeURIComponent(p.id)}">`;
    html += `<div class="index-item-title">${escapeHtml(p.display_name || p.id)}</div>`;
    html += `<div class="index-item-sub">Last active ${escapeHtml(lastActive)}</div>`;
    html += `</a>`;
  }
  return html;
}

/**
 * Panel 2: Timeline of entries for a project, grouped by time bucket.
 */
export function renderProjectTimeline(db: Database, projectId: string, selectedEntryId?: number): string {
  const project = db.query(`SELECT display_name FROM projects WHERE id = ?`).get(projectId) as { display_name: string } | null;
  const name = project?.display_name || projectId;

  const entries = db.query(`
    SELECT je.id, je.date, je.headline, je.summary, je.topics, je.session_ids
    FROM journal_entries je
    WHERE je.project_id = ?
    ORDER BY je.date DESC
  `).all(projectId) as ProjectEntryRow[];

  let html = `<div class="page-title">${escapeHtml(name)}</div>`;

  if (entries.length === 0) {
    html += '<div class="empty-state">No entries for this project.</div>';
    return html;
  }

  const dates = [...new Set(entries.map(e => e.date))];
  const buckets = groupByTimeBucket(dates);
  const entriesByDate = new Map<string, ProjectEntryRow[]>();
  for (const e of entries) {
    if (!entriesByDate.has(e.date)) entriesByDate.set(e.date, []);
    entriesByDate.get(e.date)!.push(e);
  }

  for (const [bucketName, bucketDates] of buckets) {
    html += `<div class="index-section-label" style="padding: 12px 0 6px; margin-top: 8px;">${escapeHtml(bucketName)}</div>`;
    for (const date of bucketDates) {
      const dateEntries = entriesByDate.get(date) || [];
      for (const entry of dateEntries) {
        const isSelected = entry.id === selectedEntryId;
        const sessionIds: string[] = JSON.parse(entry.session_ids || "[]");
        const topics: string[] = JSON.parse(entry.topics || "[]");

        html += `<a class="entry-card${isSelected ? " selected" : ""}" href="/projects?project=${encodeURIComponent(projectId)}&entry=${entry.id}" hx-get="/api/journal/conversation?entry_id=${entry.id}" hx-target="#panel-detail">`;
        html += `<div class="entry-label">${formatDateShort(date)}</div>`;
        if (entry.headline) {
          html += `<div class="entry-headline">${escapeHtml(entry.headline)}</div>`;
        }
        html += `<div class="entry-summary">${escapeHtml(entry.summary)}</div>`;
        if (topics.length > 0) {
          html += `<div class="entry-tags">`;
          for (const t of topics) {
            html += `<span class="entry-tag">${escapeHtml(t)}</span>`;
          }
          html += `</div>`;
        }
        html += `<div class="entry-stats">${sessionIds.length} session${sessionIds.length !== 1 ? "s" : ""}</div>`;
        html += `</a>`;
      }
    }
  }
  return html;
}

/**
 * Full page content for projects tab.
 */
export function renderProjectsPage(db: Database, projectId?: string, entryId?: number): {
  panel1: string;
  panel2: string;
  panel3: string;
} {
  // If no project specified, use the most recent
  if (!projectId) {
    const row = db.query(`SELECT id FROM projects ORDER BY last_session_at DESC LIMIT 1`).get() as { id: string } | null;
    projectId = row?.id;
  }

  const panel1 = renderProjectIndex(db, projectId);

  if (!projectId) {
    return { panel1, panel2: '<div class="empty-state">No projects yet.</div>', panel3: "" };
  }

  const panel2 = renderProjectTimeline(db, projectId, entryId ?? undefined);

  // Default panel 3
  let panel3 = '<div class="empty-state">Select an entry to view conversations.</div>';
  if (entryId) {
    panel3 = renderEntryConversations(db, entryId);
  } else {
    const firstEntry = db.query(`
      SELECT id FROM journal_entries WHERE project_id = ? ORDER BY date DESC LIMIT 1
    `).get(projectId) as { id: number } | null;
    if (firstEntry) {
      panel3 = renderEntryConversations(db, firstEntry.id);
    }
  }

  return { panel1, panel2, panel3 };
}
