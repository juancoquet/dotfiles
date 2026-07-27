import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { WorkspaceRegistry } from "../src/index.ts";

function paths() {
  const directory = mkdtempSync(join(tmpdir(), "piw-state-"));
  return { stateDirectory: join(directory, "state"), databasePath: join(directory, "state", "state.db"), runtimeDirectory: join(directory, "runtime") };
}

function seed(registry: WorkspaceRegistry, sessionId = "session-1"): void {
  registry.upsertRepository({ id: "repo-1", identity: "git:/projects/example", displayName: "example", sortRank: 1, setupCommand: "uv sync" });
  registry.upsertRoot({ id: "root-1", repositoryId: "repo-1", path: "/projects/example/src", initializedAt: null, setupFailure: null });
  registry.upsertSession({ id: sessionId, rootId: "root-1", sessionFile: `/sessions/${sessionId}.jsonl`, name: null, archived: false, unread: true, sortRank: 1 });
}

test("creates private state automatically and persists manager metadata", () => {
  const statePaths = paths();
  const sessionFile = join(tmpdir(), "piw-session-fixture.jsonl");
  writeFileSync(sessionFile, "original Pi history");
  const registry = WorkspaceRegistry.open({ paths: statePaths });
  seed(registry);
  registry.close();

  const reopened = WorkspaceRegistry.open({ paths: statePaths });
  assert.deepEqual(reopened.getSession("session-1"), {
    id: "session-1", rootId: "root-1", sessionFile: "/sessions/session-1.jsonl", name: null, archived: false, unread: true, sortRank: 1,
  });
  assert.equal(reopened.schemaVersion(), 2);
  assert.equal(readFileSync(sessionFile, "utf8"), "original Pi history");
  reopened.close();
});
