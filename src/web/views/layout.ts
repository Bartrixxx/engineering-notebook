import { escapeHtml } from "./helpers";

type ThreePanelContent = {
  activeTab: "journal" | "projects";
  panel1: string;
  panel2: string;
  panel3: string;
};

type SingleContent = {
  body: string;
};

type LayoutContent = ThreePanelContent | SingleContent;

function isThreePanel(c: LayoutContent): c is ThreePanelContent {
  return "panel1" in c;
}

export function renderLayout(title: string, content: LayoutContent): string {
  const journalActive = isThreePanel(content) && content.activeTab === "journal";
  const projectsActive = isThreePanel(content) && content.activeTab === "projects";

  let bodyHtml: string;
  if (isThreePanel(content)) {
    bodyHtml = `
      <div class="panels">
        <div class="panel panel-index" id="panel-index">${content.panel1}</div>
        <div class="panel panel-entries" id="panel-entries">${content.panel2}</div>
        <div class="panel panel-detail" id="panel-detail">${content.panel3}</div>
      </div>`;
  } else {
    bodyHtml = `<div class="single-content">${content.body}</div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <script src="https://unpkg.com/htmx.org@2.0.4"></script>
  <style>
    :root {
      --bg: #fafaf9;
      --surface: #f5f5f4;
      --border: #e7e5e4;
      --border-subtle: #f5f5f4;
      --text: #1c1917;
      --text-secondary: #292524;
      --text-muted: #57534e;
      --text-faint: #78716c;
      --text-ghost: #a8a29e;
      --font-serif: Georgia, 'Times New Roman', serif;
      --font-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; overflow: hidden; }
    body {
      font-family: var(--font-sans);
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      display: flex;
      flex-direction: column;
    }

    /* Top bar */
    .top-bar {
      display: flex;
      align-items: center;
      padding: 0 20px;
      border-bottom: 1px solid var(--border);
      background: var(--bg);
      flex-shrink: 0;
      height: 44px;
    }
    .top-bar .logo {
      font-weight: 700;
      font-size: 15px;
      color: var(--text);
      font-family: var(--font-serif);
      margin-right: 32px;
      text-decoration: none;
    }
    .top-bar nav { display: flex; gap: 0; height: 100%; }
    .top-bar nav a {
      font-size: 13px;
      color: var(--text-faint);
      text-decoration: none;
      padding: 0 16px;
      display: flex;
      align-items: center;
      height: 100%;
      border-bottom: 2px solid transparent;
    }
    .top-bar nav a:hover { color: var(--text-muted); }
    .top-bar nav a.active {
      font-weight: 600;
      color: var(--text);
      border-bottom-color: var(--text);
    }
    .top-bar .spacer { flex: 1; }
    .top-bar .search-field {
      background: var(--surface);
      border: none;
      border-radius: 5px;
      padding: 6px 12px;
      font-size: 12px;
      color: var(--text);
      width: 180px;
      font-family: var(--font-sans);
    }
    .top-bar .search-field::placeholder { color: var(--text-ghost); }
    .top-bar .search-field:focus { outline: 1px solid var(--border); }
    .top-bar .settings-link {
      width: 28px;
      height: 28px;
      border-radius: 5px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-ghost);
      text-decoration: none;
      font-size: 16px;
      margin-left: 8px;
    }
    .top-bar .settings-link:hover { color: var(--text-muted); background: var(--surface); }

    /* Three-panel layout */
    .panels {
      display: flex;
      flex: 1;
      overflow: hidden;
    }
    .panel { overflow-y: auto; }
    .panel-index {
      width: 200px;
      background: var(--surface);
      border-right: 1px solid var(--border);
      flex-shrink: 0;
      padding: 12px 0;
    }
    .panel-entries {
      width: 400px;
      border-right: 1px solid var(--border);
      flex-shrink: 0;
      padding: 20px;
    }
    .panel-detail {
      flex: 1;
      padding: 20px 24px;
      position: relative;
    }
    .panel-dismiss {
      position: absolute;
      top: 12px;
      right: 16px;
      font-size: 18px;
      color: var(--text-ghost);
      background: none;
      border: none;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
      line-height: 1;
    }
    .panel-dismiss:hover {
      color: var(--text-muted);
      background: var(--surface);
    }

    /* Single content (search, settings) */
    .single-content {
      flex: 1;
      max-width: 720px;
      margin: 0 auto;
      padding: 32px 24px;
      overflow-y: auto;
    }

    /* Index panel items */
    .index-section-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-ghost);
      padding: 8px 14px 4px;
    }
    .index-item {
      padding: 8px 14px;
      margin: 0 6px 2px;
      border-radius: 5px;
      cursor: pointer;
      text-decoration: none;
      display: block;
      color: inherit;
    }
    .index-item:hover { background: rgba(0,0,0,0.03); }
    .index-item.selected { background: var(--bg); }
    .index-item-title {
      font-size: 13px;
      color: var(--text-muted);
    }
    .index-item.selected .index-item-title {
      font-weight: 600;
      color: var(--text);
    }
    .index-item-sub {
      font-size: 11px;
      color: var(--text-ghost);
      margin-top: 2px;
    }
    .index-item.selected .index-item-sub { color: var(--text-faint); }

    /* Entry cards in panel 2 */
    .entry-card {
      padding: 14px;
      margin-bottom: 12px;
      border-radius: 6px;
      cursor: pointer;
      text-decoration: none;
      display: block;
      color: inherit;
    }
    .entry-card:hover { background: var(--surface); }
    .entry-card.selected { background: var(--surface); }
    .entry-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-ghost);
      margin-bottom: 4px;
    }
    .entry-headline {
      font-size: 15px;
      font-weight: 600;
      color: var(--text);
      font-family: var(--font-serif);
      margin-bottom: 6px;
    }
    .entry-summary {
      font-size: 13px;
      color: var(--text-muted);
      line-height: 1.5;
      font-weight: 300;
    }
    .entry-tags {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 6px;
    }
    .entry-tag {
      font-size: 10px;
      padding: 1px 6px;
      background: var(--surface);
      border-radius: 3px;
      color: var(--text-faint);
    }
    .entry-card.selected .entry-tag { background: var(--border); }
    .entry-stats {
      font-size: 11px;
      color: var(--text-ghost);
      margin-top: 6px;
    }
    .entry-questions-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-ghost);
      margin-top: 8px;
    }
    .entry-questions {
      margin-top: 4px;
      padding-left: 14px;
      font-size: 12px;
      color: var(--text-faint);
      line-height: 1.5;
    }
    .entry-questions li {
      margin-bottom: 2px;
      list-style-type: '→ ';
    }

    /* Conversation transcript */
    .conversation-nav {
      font-size: 11px;
      color: var(--text-ghost);
      margin-bottom: 16px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--border-subtle);
    }
    .conversation-nav a {
      color: var(--text-ghost);
      text-decoration: underline;
      cursor: pointer;
    }
    .transcript {
      padding-left: 88px;
      position: relative;
    }
    .msg { margin-bottom: 10px; position: relative; }
    .msg-speaker-change { padding-top: 10px; border-top: 1px solid var(--border-subtle); }
    .msg-label {
      position: absolute;
      left: -84px;
      top: 0;
      width: 72px;
      text-align: right;
      font-weight: 700;
      font-size: 14px;
      color: var(--text);
    }
    .msg-body-user {
      color: var(--text-secondary);
      line-height: 1.6;
      font-size: 14px;
      font-weight: 500;
    }
    .msg-body-claude {
      color: var(--text-muted);
      line-height: 1.55;
      font-size: 14px;
      font-weight: 300;
    }
    .msg-time {
      font-size: 11px;
      color: var(--text-ghost);
      margin-left: 6px;
      font-weight: 400;
    }

    /* Session footer */
    .session-footer {
      margin-top: 32px;
      padding-top: 16px;
      border-top: 1px solid var(--border-subtle);
    }
    .session-footer-resume {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
    }
    .session-footer-resume code {
      font-size: 12px;
      color: var(--text-faint);
      background: var(--surface);
      padding: 4px 8px;
      border-radius: 4px;
      user-select: all;
    }
    .copy-btn {
      font-size: 11px;
      padding: 2px 8px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 3px;
      color: var(--text-ghost);
      cursor: pointer;
    }
    .copy-btn:hover {
      color: var(--text-muted);
      border-color: var(--text-ghost);
    }
    .session-footer-source {
      font-size: 11px;
      color: var(--text-ghost);
    }

    /* Search page */
    .search-box {
      width: 100%;
      padding: 10px 14px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text);
      font-size: 14px;
      font-family: var(--font-sans);
      margin-bottom: 24px;
    }
    .search-box:focus { outline: none; border-color: var(--text-ghost); }
    mark { background: #fef3c7; color: var(--text); padding: 1px 2px; border-radius: 2px; }

    /* Settings page */
    .settings-group { margin-bottom: 24px; }
    .settings-label {
      font-size: 13px;
      font-weight: 600;
      color: var(--text);
      margin-bottom: 6px;
    }
    .settings-help {
      font-size: 12px;
      color: var(--text-ghost);
      margin-bottom: 8px;
    }
    .settings-input {
      width: 100%;
      padding: 8px 12px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 5px;
      color: var(--text);
      font-size: 13px;
      font-family: var(--font-sans);
    }
    .settings-input:focus { outline: none; border-color: var(--text-ghost); }
    textarea.settings-input { min-height: 80px; resize: vertical; }
    .settings-btn {
      padding: 8px 20px;
      background: var(--text);
      color: var(--bg);
      border: none;
      border-radius: 5px;
      font-size: 13px;
      cursor: pointer;
      font-family: var(--font-sans);
    }
    .settings-btn:hover { opacity: 0.85; }

    /* Misc */
    .page-title {
      font-size: 18px;
      font-weight: 700;
      color: var(--text);
      font-family: var(--font-serif);
      margin-bottom: 20px;
    }
    .empty-state {
      color: var(--text-ghost);
      font-size: 14px;
      padding: 40px 20px;
      text-align: center;
    }
    code {
      background: var(--surface);
      padding: 2px 5px;
      border-radius: 3px;
      font-size: 0.9em;
    }
    a { color: var(--text-muted); }
    a:hover { color: var(--text); }
  </style>
</head>
<body>
  <div class="top-bar">
    <a href="/" class="logo">Engineering Notebook</a>
    <nav>
      <a href="/"${journalActive ? ' class="active"' : ""}>Journal</a>
      <a href="/projects"${projectsActive ? ' class="active"' : ""}>Projects</a>
    </nav>
    <div class="spacer"></div>
    <form action="/search" method="get" style="display:flex;">
      <input class="search-field" type="text" name="q" placeholder="Search...">
    </form>
    <a href="/settings" class="settings-link" title="Settings">&#9881;</a>
  </div>
  ${bodyHtml}
</body>
</html>`;
}
