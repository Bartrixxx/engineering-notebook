import { Database } from "bun:sqlite";
import { renderConversation } from "./conversation";
import { escapeHtml, formatTimeAmPm, formatTime } from "./helpers";

/**
 * Render a single session's conversation for Panel 3,
 * with basic session metadata header.
 */
export function renderSessionDetail(db: Database, sessionId: string): string {
  const session = db.query(`
    SELECT s.id, s.project_id, s.started_at, s.ended_at, s.git_branch,
           s.message_count, p.display_name, c.conversation_markdown
    FROM sessions s
    JOIN projects p ON s.project_id = p.id
    LEFT JOIN conversations c ON c.session_id = s.id
    WHERE s.id = ?
  `).get(sessionId) as {
    id: string; project_id: string; started_at: string; ended_at: string | null;
    git_branch: string | null; message_count: number; display_name: string;
    conversation_markdown: string | null;
  } | null;

  if (!session) return '<div class="empty-state">Session not found.</div>';

  let html = `<div style="margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid var(--border-subtle);">`;
  html += `<div style="font-size: 13px; font-weight: 600; color: var(--text);">${escapeHtml(session.display_name)}</div>`;
  html += `<div style="font-size: 11px; color: var(--text-ghost); margin-top: 2px;">`;
  html += `${session.started_at.slice(0, 10)} · ${session.message_count} messages`;
  if (session.git_branch) html += ` · ${escapeHtml(session.git_branch)}`;
  html += `</div></div>`;

  if (session.conversation_markdown) {
    html += renderConversation(session.conversation_markdown);
  } else {
    html += '<div class="empty-state">No conversation data.</div>';
  }

  return html;
}
