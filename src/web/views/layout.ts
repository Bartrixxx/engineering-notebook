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
    .entry-headline { color: var(--text); font-weight: 600; margin-bottom: 0.3rem; }
    .entry-summary { color: var(--text-muted); font-size: 0.95rem; }
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
      max-height: 600px;
      overflow-y: auto;
    }
    .msg { padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 0.5rem; }
    .msg-user { background: rgba(79, 195, 247, 0.08); border-left: 3px solid var(--user); }
    .msg-claude { background: rgba(129, 199, 132, 0.08); border-left: 3px solid var(--claude); }
    .msg-header { display: flex; gap: 0.5rem; align-items: baseline; margin-bottom: 0.25rem; }
    .msg-speaker { font-weight: 600; font-size: 0.85rem; }
    .msg-user .msg-speaker { color: var(--user); }
    .msg-claude .msg-speaker { color: var(--claude); }
    .msg-time { color: var(--text-muted); font-size: 0.75rem; }
    .msg-body { color: var(--text); line-height: 1.6; }
    .session-link { color: var(--accent); text-decoration: none; font-size: 0.85rem; }
    .session-link:hover { text-decoration: underline; }
    .session-item { display: flex; gap: 1rem; align-items: baseline; padding: 0.3rem 0; }
    .session-meta { color: var(--text-muted); font-size: 0.8rem; }
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
