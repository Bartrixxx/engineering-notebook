import { Hono } from "hono";
import { Database } from "bun:sqlite";
import { renderLayout } from "./views/layout";
import { renderJournalPage, renderJournalEntries, renderEntryConversations, renderJournalDateIndex } from "./views/journal";
import { renderProjectsPage, renderProjectTimeline, renderProjectIndex } from "./views/projects";
import { renderSearch, renderSearchResults } from "./views/search";
import { renderSettings } from "./views/settings";
import { renderSessionDetail } from "./views/session";
import { loadConfig, saveConfig, resolveConfigPath } from "../config";

export function createApp(db: Database): Hono {
  const app = new Hono();

  // ──────────────────────────────────────────
  // Full-page routes
  // ──────────────────────────────────────────

  // Journal (default landing page)
  app.get("/", (c) => {
    const date = c.req.query("date");
    const entryId = c.req.query("entry") ? parseInt(c.req.query("entry")!) : undefined;
    const { panel1, panel2, panel3 } = renderJournalPage(db, date, entryId);
    return c.html(renderLayout("Engineering Notebook", {
      activeTab: "journal",
      panel1,
      panel2,
      panel3,
    }));
  });

  // Projects
  app.get("/projects", (c) => {
    const projectId = c.req.query("project") || undefined;
    const entryId = c.req.query("entry") ? parseInt(c.req.query("entry")!) : undefined;
    const { panel1, panel2, panel3 } = renderProjectsPage(db, projectId, entryId);
    return c.html(renderLayout("Projects — Engineering Notebook", {
      activeTab: "projects",
      panel1,
      panel2,
      panel3,
    }));
  });

  // Session detail — show in journal context
  app.get("/session/:id", (c) => {
    const sessionId = c.req.param("id");
    const panel3 = renderSessionDetail(db, sessionId);
    // Find the date for this session to select it in the index
    const session = db.query(`SELECT date(started_at) as date FROM sessions WHERE id = ?`).get(sessionId) as { date: string } | null;
    const date = session?.date;
    const panel1 = renderJournalDateIndex(db, date || undefined);
    const panel2 = date ? renderJournalEntries(db, date) : '<div class="empty-state">Session not found.</div>';
    return c.html(renderLayout("Session — Engineering Notebook", {
      activeTab: "journal",
      panel1,
      panel2,
      panel3,
    }));
  });

  // Search
  app.get("/search", (c) => {
    const q = c.req.query("q") || "";
    if (c.req.header("HX-Request")) {
      return c.html(renderSearchResults(db, q));
    }
    return c.html(renderLayout("Search — Engineering Notebook", { body: renderSearch(db, q) }));
  });

  // Settings (GET)
  app.get("/settings", (c) => {
    const config = loadConfig();
    return c.html(renderLayout("Settings — Engineering Notebook", { body: renderSettings(config) }));
  });

  // Settings (POST)
  app.post("/settings", async (c) => {
    const body = await c.req.parseBody();
    const config = loadConfig();
    const configPath = resolveConfigPath();

    config.summary_instructions = (body.summary_instructions as string) || "";
    config.day_start_hour = parseInt((body.day_start_hour as string) || "5", 10);
    config.sources = ((body.sources as string) || "").split("\n").map(s => s.trim()).filter(Boolean);
    config.exclude = ((body.exclude as string) || "").split("\n").map(s => s.trim()).filter(Boolean);
    config.port = parseInt((body.port as string) || "3000", 10);

    saveConfig(configPath, config);
    return c.redirect("/settings");
  });

  // ──────────────────────────────────────────
  // HTMX partial routes (return panel HTML fragments)
  // ──────────────────────────────────────────

  // Journal: load entries for a date (Panel 2)
  app.get("/api/journal/entries", (c) => {
    const date = c.req.query("date");
    if (!date) return c.text("Missing date", 400);
    return c.html(renderJournalEntries(db, date));
  });

  // Journal: load conversation for an entry (Panel 3)
  app.get("/api/journal/conversation", (c) => {
    const entryId = parseInt(c.req.query("entry_id") || "0");
    const sessionIdx = parseInt(c.req.query("session_idx") || "0");
    if (!entryId) return c.text("Missing entry_id", 400);
    return c.html(renderEntryConversations(db, entryId, sessionIdx));
  });

  // Projects: load timeline for a project (Panel 2)
  app.get("/api/projects/timeline", (c) => {
    const projectId = c.req.query("project");
    if (!projectId) return c.text("Missing project", 400);
    return c.html(renderProjectTimeline(db, projectId));
  });

  // Legacy route compatibility: /project/:id redirects to /projects?project=:id
  app.get("/project/:id", (c) => {
    const projectId = c.req.param("id");
    return c.redirect(`/projects?project=${encodeURIComponent(projectId)}`);
  });

  return app;
}
