import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { initDb, getDb, closeDb } from "./db";
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
    closeDb();
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
  });

  test("initDb is idempotent", () => {
    initDb(dbPath);
    closeDb();
    const db = initDb(dbPath);
    const tables = db
      .query("SELECT name FROM sqlite_master WHERE type='table'")
      .all();
    expect(tables.length).toBeGreaterThanOrEqual(4);
  });

  test("getDb returns initialized db", () => {
    initDb(dbPath);
    const db = getDb();
    const result = db
      .query("SELECT count(*) as c FROM sessions")
      .get() as { c: number };
    expect(result.c).toBe(0);
  });
});
