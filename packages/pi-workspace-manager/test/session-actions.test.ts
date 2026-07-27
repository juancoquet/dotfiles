import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { archiveSession, archiveSessionTree, closeWorkspace, restoreSession, trashSession, RuntimeRegistry, WorkspaceRegistry, type SessionActionDependencies } from "../src/index.ts";

function paths() {
  const directory = mkdtempSync(join(tmpdir(), "piw-actions-"));
  return { stateDirectory: join(directory, "state"), databasePath: join(directory, "state", "state.db"), runtimeDirectory: join(directory, "runtime") };
}

function seed(registry: WorkspaceRegistry, agentState: "idle" | "running" = "idle"): void {
  registry.upsertRepository({ id: "repo", identity: "directory:/repo", displayName: "repo", sortRank: 1, setupCommand: null });
  registry.upsertRoot({ id: "root", repositoryId: "repo", path: "/repo", initializedAt: null, setupFailure: null });
  registry.upsertSession({ id: "session", rootId: "root", sessionFile: "/sessions/session.jsonl", name: "Session", firstMessage: null, parentSessionFile: null, parentSessionId: null, lastActivityAt: null, archived: false, unread: true, sortRank: 7 });
  assert.ok(registry.claimRuntimeRegistration({ sessionId: "session", instanceId: "runtime", pid: process.pid, cwd: "/repo", workspaceId: "workspace", tmuxLocation: "piw:1", agentState, heartbeatAt: new Date().toISOString() }, "2000-01-01T00:00:00.000Z"));
}

function dependencies(statePaths: ReturnType<typeof paths>, confirmed = true): SessionActionDependencies & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    openRegistry: () => WorkspaceRegistry.open({ paths: statePaths }),
    catalog: async () => {},
    runtime: (registry) => new RuntimeRegistry(registry, { isPidRunning: () => true, isTmuxLocationRunning: () => true }),
    trasher: { trash: (path) => calls.push(`trash:${path}`) },
    closer: {
      requestGracefulShutdown: (location) => calls.push(`stop:${location}`),
      closeWindow: (location) => {
        calls.push(`close:${location}`);
        const registry = WorkspaceRegistry.open({ paths: statePaths });
        registry.removeRuntimeRegistration("session", "runtime");
        registry.close();
      },
    },
    confirmRunning: () => confirmed,
    confirmArchiveTree: () => confirmed,
    confirmTrash: () => confirmed,
    wait: async () => { calls.push("wait"); },
  };
}

function preparedActions(agentState: "idle" | "running" = "idle", confirmed = true) {
  const statePaths = paths();
  const registry = WorkspaceRegistry.open({ paths: statePaths });
  seed(registry, agentState);
  registry.close();
  return { statePaths, actions: dependencies(statePaths, confirmed) };
}

test("close makes a managed warm session cold without changing its session metadata", async () => {
  const { statePaths, actions } = preparedActions();
  assert.equal(await closeWorkspace("session", actions), "closed");
  assert.deepEqual(actions.calls, ["close:piw:1"]);
  const registry = WorkspaceRegistry.open({ paths: statePaths });
  assert.equal(new RuntimeRegistry(registry, { isPidRunning: () => true, isTmuxLocationRunning: () => true }).state("session"), "cold");
  assert.equal(registry.getSession("session")?.archived, false);
  assert.equal(registry.getSession("session")?.unread, true);
  registry.close();
});

test("archiving closes its managed workspace and restoring preserves unread and manual order", async () => {
  const { statePaths, actions } = preparedActions();
  assert.equal(await archiveSession("session", actions), "archived");
  assert.deepEqual(actions.calls, ["close:piw:1"]);
  let registry = WorkspaceRegistry.open({ paths: statePaths });
  assert.equal(registry.getSession("session")?.archived, true);
  assert.equal(registry.getSession("session")?.sortRank, 7);
  assert.equal(registry.getSession("session")?.unread, true);
  registry.close();
  assert.equal(await restoreSession("session", actions), true);
  registry = WorkspaceRegistry.open({ paths: statePaths });
  assert.equal(registry.getSession("session")?.archived, false);
  assert.equal(registry.getSession("session")?.sessionFile, "/sessions/session.jsonl");
  registry.close();
});

test("a running agent is not stopped when confirmation is rejected", async () => {
  const { statePaths, actions } = preparedActions("running", false);
  assert.equal(await archiveSession("session", actions), "cancelled");
  assert.deepEqual(actions.calls, []);
  const registry = WorkspaceRegistry.open({ paths: statePaths });
  assert.equal(registry.getSession("session")?.archived, false);
  registry.close();
});

test("a confirmed running agent receives a graceful stop request before close", async () => {
  const { actions } = preparedActions("running");
  assert.equal(await closeWorkspace("session", actions), "closed");
  assert.deepEqual(actions.calls, ["stop:piw:1", "wait", "close:piw:1"]);
});

test("tree archive confirms its descendant count and archives exactly the selected tree", async () => {
  const { statePaths, actions } = preparedActions();
  const registry = WorkspaceRegistry.open({ paths: statePaths });
  registry.upsertSession({ id: "child", rootId: "root", sessionFile: "/sessions/child.jsonl", name: "Child", firstMessage: null, parentSessionFile: "/sessions/session.jsonl", parentSessionId: "session", lastActivityAt: null, archived: false, unread: false, sortRank: 6 });
  registry.upsertSession({ id: "grandchild", rootId: "root", sessionFile: "/sessions/grandchild.jsonl", name: "Grandchild", firstMessage: null, parentSessionFile: "/sessions/child.jsonl", parentSessionId: "child", lastActivityAt: null, archived: false, unread: false, sortRank: 5 });
  registry.upsertSession({ id: "unrelated", rootId: "root", sessionFile: "/sessions/unrelated.jsonl", name: "Unrelated", firstMessage: null, parentSessionFile: null, parentSessionId: null, lastActivityAt: null, archived: false, unread: false, sortRank: 4 });
  registry.close();
  const counts: number[] = [];
  actions.confirmArchiveTree = (_session, count) => { counts.push(count); return true; };

  assert.equal(await archiveSessionTree("session", actions), "archived-tree");
  assert.deepEqual(counts, [2]);
  const reopened = WorkspaceRegistry.open({ paths: statePaths });
  assert.equal(reopened.getSession("session")?.archived, true);
  assert.equal(reopened.getSession("child")?.archived, true);
  assert.equal(reopened.getSession("grandchild")?.archived, true);
  assert.equal(reopened.getSession("unrelated")?.archived, false);
  reopened.close();
});

test("cancelled tree archive changes nothing", async () => {
  const { statePaths, actions } = preparedActions();
  actions.confirmArchiveTree = () => false;
  assert.equal(await archiveSessionTree("session", actions), "cancelled");
  const registry = WorkspaceRegistry.open({ paths: statePaths });
  assert.equal(registry.getSession("session")?.archived, false);
  registry.close();
});

test("trashing a cold session removes its manager record without touching its root", async () => {
  const { statePaths, actions } = preparedActions();
  const registry = WorkspaceRegistry.open({ paths: statePaths });
  registry.removeRuntimeRegistration("session", "runtime");
  registry.close();
  assert.equal(await trashSession("session", actions), "trashed");
  assert.deepEqual(actions.calls, ["trash:/sessions/session.jsonl"]);
  const reopened = WorkspaceRegistry.open({ paths: statePaths });
  assert.equal(reopened.getSession("session"), undefined);
  assert.equal(reopened.getRoot("root")?.path, "/repo");
  reopened.close();
});

test("trashing a warm session is refused before confirmation", async () => {
  const { actions } = preparedActions();
  let confirmed = false;
  actions.confirmTrash = () => { confirmed = true; return true; };
  assert.equal(await trashSession("session", actions), "unsafe");
  assert.equal(confirmed, false);
  assert.deepEqual(actions.calls, []);
});
