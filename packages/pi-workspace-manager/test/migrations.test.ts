import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { WorkspaceRegistry } from "../src/index.ts";
import { migrations } from "../src/migrations.ts";

function paths() {
  const directory = mkdtempSync(join(tmpdir(), "piw-migration-"));
  return { stateDirectory: join(directory, "state"), databasePath: join(directory, "state", "state.db"), runtimeDirectory: join(directory, "runtime") };
}

test("upgrades a version-one database once without losing session records", () => {
  const statePaths = paths();
  mkdirSync(statePaths.stateDirectory, { recursive: true, mode: 0o700 });
  const old = new DatabaseSync(statePaths.databasePath);
  old.exec("PRAGMA foreign_keys = ON; CREATE TABLE schema_migrations (id INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);");
  old.exec(migrations[0]!.sql);
  old.exec("INSERT INTO schema_migrations VALUES (1, '2026-01-01T00:00:00.000Z');");
  old.exec("INSERT INTO repositories VALUES ('repo', 'git:repo', 'repo', 1, NULL);");
  old.exec("INSERT INTO roots VALUES ('root', 'repo', '/repo', NULL, NULL);");
  old.exec("INSERT INTO sessions VALUES ('session', 'root', '/session.jsonl', 'Saved', 0, 0, 1);");
  old.close();
  chmodSync(statePaths.databasePath, 0o600);

  const registry = WorkspaceRegistry.open({ paths: statePaths });
  assert.equal(registry.schemaVersion(), 5);
  assert.equal(registry.getSession("session")?.name, "Saved");
  assert.equal(registry.getSession("session")?.firstMessage, null);
  registry.close();

  const reopened = WorkspaceRegistry.open({ paths: statePaths });
  assert.equal(reopened.schemaVersion(), 5);
  assert.equal(reopened.listSessions().length, 1);
  reopened.close();
});
