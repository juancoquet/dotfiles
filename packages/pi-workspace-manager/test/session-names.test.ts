import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { renameSession, WorkspaceRegistry } from "../src/index.ts";

function paths() {
  const directory = mkdtempSync(join(tmpdir(), "piw-names-"));
  return { stateDirectory: join(directory, "state"), databasePath: join(directory, "state", "state.db"), runtimeDirectory: join(directory, "runtime") };
}

test("writes and clears Pi session metadata while retaining manager state", () => {
  const directory = mkdtempSync(join(tmpdir(), "piw-session-"));
  const piSession = SessionManager.create("/project", directory);
  const sessionFile = piSession.getSessionFile();
  assert.ok(sessionFile);
  writeFileSync(sessionFile, `${JSON.stringify(piSession.getHeader())}\n`);
  const registry = WorkspaceRegistry.open({ paths: paths() });
  registry.upsertRepository({ id: "repo", identity: "directory:/project", displayName: "project", sortRank: 1, setupCommand: null });
  registry.upsertRoot({ id: "root", repositoryId: "repo", path: "/project", initializedAt: null, setupFailure: null });
  registry.upsertSession({ id: piSession.getSessionId(), rootId: "root", sessionFile, name: null, firstMessage: "First message", parentSessionFile: null, parentSessionId: null, lastActivityAt: null, archived: true, unread: true, sortRank: 7 });

  assert.equal(renameSession(piSession.getSessionId(), "  My\nname  ", registry), true);
  assert.equal(SessionManager.open(sessionFile).getSessionName(), "My name");
  assert.equal(registry.getSession(piSession.getSessionId())?.name, "My name");

  assert.equal(renameSession(piSession.getSessionId(), "", registry), true);
  assert.equal(SessionManager.open(sessionFile).getSessionName(), undefined);
  assert.deepEqual(registry.getSession(piSession.getSessionId()), {
    id: piSession.getSessionId(), rootId: "root", sessionFile, name: null, firstMessage: "First message",
    parentSessionFile: null, parentSessionId: null, lastActivityAt: null, archived: true, unread: true, sortRank: 7,
  });
  registry.close();
});
