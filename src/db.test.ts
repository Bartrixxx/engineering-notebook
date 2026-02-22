import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { initDb, getDb } from "./db";
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
    db.close();
  });

  test("initDb is idempotent", () => {
    const db1 = initDb(dbPath);
    db1.close();
    const db2 = initDb(dbPath);
    const tables = db2
      .query("SELECT name FROM sqlite_master WHERE type='table'")
      .all();
    expect(tables.length).toBeGreaterThanOrEqual(4);
    db2.close();
  });

  test("getDb returns initialized db", () => {
    initDb(dbPath);
    const db = getDb(dbPath);
    const result = db
      .query("SELECT count(*) as c FROM sessions")
      .get() as { c: number };
    expect(result.c).toBe(0);
    db.close();
  });
});
