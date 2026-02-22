import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { scanSources, ingestSessions } from "./ingest";
import { initDb, closeDb } from "./db";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, copyFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Database } from "bun:sqlite";

describe("scanSources", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "notebook-ingest-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("finds .jsonl files in project directories", () => {
    const projectDir = join(tempDir, "-Users-test-project");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, "session-1.jsonl"), "{}");
    writeFileSync(join(projectDir, "session-2.jsonl"), "{}");
    writeFileSync(join(projectDir, "memory"), "{}");

    const files = scanSources([tempDir], []);
    expect(files.length).toBe(2);
  });

  test("excludes matching patterns", () => {
    const included = join(tempDir, "-Users-test-myapp");
    const excluded = join(tempDir, "-private-tmp");
    mkdirSync(included, { recursive: true });
    mkdirSync(excluded, { recursive: true });
    writeFileSync(join(included, "s1.jsonl"), "{}");
    writeFileSync(join(excluded, "s2.jsonl"), "{}");

    const files = scanSources([tempDir], ["-private-tmp*"]);
    expect(files.length).toBe(1);
    expect(files[0]).toContain("myapp");
  });
});

describe("ingestSessions", () => {
  let tempDir: string;
  let db: Database;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "notebook-ingest-test-"));
    db = initDb(join(tempDir, "test.db"));
  });

  afterEach(() => {
    closeDb();
    rmSync(tempDir, { recursive: true, force: true });
  });

  test("ingests a session file into the database", () => {
    const fixturePath = join(import.meta.dir, "../tests/fixtures/sample-session.jsonl");
    const projectDir = join(tempDir, "-Users-test-myapp");
    mkdirSync(projectDir, { recursive: true });
    const sessionFile = join(projectDir, "test-session-1.jsonl");
    copyFileSync(fixturePath, sessionFile);

    const result = ingestSessions([sessionFile], db);
    expect(result.ingested).toBe(1);
    expect(result.skipped).toBe(0);

    const sessions = db.query("SELECT * FROM sessions").all();
    expect(sessions.length).toBe(1);

    const convos = db.query("SELECT * FROM conversations").all();
    expect(convos.length).toBe(1);

    const projects = db.query("SELECT * FROM projects").all();
    expect(projects.length).toBe(1);
  });

  test("skips already-ingested sessions", () => {
    const fixturePath = join(import.meta.dir, "../tests/fixtures/sample-session.jsonl");
    const projectDir = join(tempDir, "-Users-test-myapp");
    mkdirSync(projectDir, { recursive: true });
    const sessionFile = join(projectDir, "test-session-1.jsonl");
    copyFileSync(fixturePath, sessionFile);

    ingestSessions([sessionFile], db);
    const result = ingestSessions([sessionFile], db);
    expect(result.ingested).toBe(0);
    expect(result.skipped).toBe(1);
  });

  test("re-ingests sessions when force=true", () => {
    const fixturePath = join(import.meta.dir, "../tests/fixtures/sample-session.jsonl");
    const projectDir = join(tempDir, "-Users-test-myapp");
    mkdirSync(projectDir, { recursive: true });
    const sessionFile = join(projectDir, "test-session-1.jsonl");
    copyFileSync(fixturePath, sessionFile);

    const first = ingestSessions([sessionFile], db);
    expect(first.ingested).toBe(1);
    expect(first.errors.length).toBe(0);

    const second = ingestSessions([sessionFile], db, true);
    expect(second.ingested).toBe(1);
    expect(second.skipped).toBe(0);
    expect(second.errors.length).toBe(0);

    const sessions = db.query("SELECT * FROM sessions").all();
    expect(sessions.length).toBe(1);

    const convos = db.query("SELECT * FROM conversations").all();
    expect(convos.length).toBe(1);
  });
});
