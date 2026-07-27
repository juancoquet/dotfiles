import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { archiveSession, closeWorkspace, restoreSession, RuntimeRegistry, WorkspaceRegistry, type SessionActionDependencies } from "../src/index.ts";

function paths() {
  const directory = mkdtempSync(join(tmpdir(), "piw-actions-"));
  return { stateDirectory: join(directory, "state"), databasePath: join(directory, "state", "state.db"), runtimeDirectory: join(directory, "runtime") };
}

function seed(registry: WorkspaceRegistry, agentState: "idle" | "running" = "idle"): void {
  registry.upsertRepository({ id: "repo", identity: "directory:/repo", displayName: "repo", sortRank: 1, setupCommand: null });
  registry.upsertRoot({ id: "root", repositoryId: "repo", path: "/repo", initializedAt: null, setupFailure: null });
  registry.upsertSession({ id: "session", rootId: "root", sessionFile: "/sessions/session.jsonl", name: "Session", firstMessage: null, parentSessionFile: null, parentSessionId: null, lastActivityAt: null, archived: false, unread: true, sortRank: 7 });
  assert.ok(registry.claimRuntimeRegistration({ sessionId: "session", instanceId: "runtime", pid: process.pid, cwd: "/repo", workspaceId: "workspace", tmuxLocation: "pi:1", agentState, heartbeatAt: new Date().toISOString() }, "2000-01-01T00:00:00.000Z"));
}

function dependencies(statePaths: ReturnType<typeof paths>, confirmed = true): SessionActionDependencies & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    openRegistry: () => WorkspaceRegistry.open({ paths: statePaths }),
    catalog: async () => {},
    runtime: (registry) => new RuntimeRegistry(registry, { isPidRunning: () => true, isTmuxLocationRunning: () => true }),
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
  assert.deepEqual(actions.calls, ["close:pi:1"]);
  const registry = WorkspaceRegistry.open({ paths: statePaths });
  assert.equal(new RuntimeRegistry(registry, { isPidRunning: () => true, isTmuxLocationRunning: () => true }).state("session"), "cold");
  assert.equal(registry.getSession("session")?.archived, false);
  assert.equal(registry.getSession("session")?.unread, true);
  registry.close();
});

test("archiving closes its managed workspace and restoring preserves unread and manual order", async () => {
  const { statePaths, actions } = preparedActions();
  assert.equal(await archiveSession("session", actions), "archived");
  assert.deepEqual(actions.calls, ["close:pi:1"]);
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
  assert.deepEqual(actions.calls, ["stop:pi:1", "wait", "close:pi:1"]);
});
