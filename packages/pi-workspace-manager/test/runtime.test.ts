import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { RuntimeRegistry, WorkspaceRegistry } from "../src/index.ts";

function paths() {
  const directory = mkdtempSync(join(tmpdir(), "piw-runtime-"));
  return { stateDirectory: join(directory, "state"), databasePath: join(directory, "state", "state.db"), runtimeDirectory: join(directory, "runtime") };
}

function seed(registry: WorkspaceRegistry): void {
  registry.upsertRepository({ id: "repo", identity: "directory:/repo", displayName: "repo", sortRank: 1, setupCommand: null });
  registry.upsertRoot({ id: "root", repositoryId: "repo", path: "/repo", initializedAt: null, setupFailure: null });
  registry.upsertSession({
    id: "session", rootId: "root", sessionFile: "/sessions/session.jsonl", name: null,
    firstMessage: null, parentSessionFile: null, parentSessionId: null, lastActivityAt: null,
    archived: false, unread: false, sortRank: 1,
  });
}

test("claims lifecycle ownership, exposes state, and releases it gracefully", () => {
  const registry = WorkspaceRegistry.open({ paths: paths() });
  seed(registry);
  let now = new Date("2026-01-01T00:00:00.000Z");
  const runtime = new RuntimeRegistry(registry, { now: () => now, isPidRunning: () => true, isTmuxLocationRunning: () => true });
  const registration = runtime.claim({ sessionId: "session", pid: 10, cwd: "/repo", workspaceId: "workspace", tmuxLocation: "pi:1.2", agentState: "idle", instanceId: "one" });
  assert.ok(registration);
  assert.deepEqual(runtime.ownership("session"), { registration, state: "managed-warm" });

  now = new Date("2026-01-01T00:00:01.000Z");
  const running = runtime.heartbeat(registration, "running");
  assert.equal(running?.agentState, "running");
  assert.equal(registry.getRuntimeRegistration("session")?.agentState, "running");

  runtime.release(running!);
  assert.deepEqual(runtime.ownership("session"), { state: "cold" });
  registry.close();
});

test("refuses a live concurrent writer without replacing its registration", () => {
  const registry = WorkspaceRegistry.open({ paths: paths() });
  seed(registry);
  const runtime = new RuntimeRegistry(registry, { isPidRunning: () => true, isTmuxLocationRunning: () => true });
  const owner = runtime.claim({ sessionId: "session", pid: 10, cwd: "/repo", workspaceId: null, tmuxLocation: null, agentState: "idle", instanceId: "owner" });
  const contender = runtime.claim({ sessionId: "session", pid: 11, cwd: "/repo", workspaceId: "workspace", tmuxLocation: null, agentState: "idle", instanceId: "contender" });
  assert.ok(owner);
  assert.equal(contender, undefined);
  assert.equal(registry.getRuntimeRegistration("session")?.instanceId, "owner");
  assert.equal(runtime.state("session"), "active-elsewhere");
  registry.close();
});

test("expires registrations with a dead process, stale heartbeat, or missing tmux target", () => {
  const registry = WorkspaceRegistry.open({ paths: paths() });
  const now = new Date("2026-01-01T00:00:20.000Z");
  const runtime = new RuntimeRegistry(registry, {
    now: () => now,
    staleAfterMs: 10_000,
    isPidRunning: (pid) => pid !== 2,
    isTmuxLocationRunning: (location) => location !== "gone:1.2",
  });
  for (const [sessionId, pid, tmuxLocation, heartbeatAt] of [
    ["dead", 2, null, "2026-01-01T00:00:19.000Z"],
    ["stale", 3, null, "2026-01-01T00:00:00.000Z"],
    ["missing-tmux", 4, "gone:1.2", "2026-01-01T00:00:19.000Z"],
  ] as const) {
    assert.ok(registry.claimRuntimeRegistration({
      sessionId, instanceId: sessionId, pid, cwd: "/repo", workspaceId: null,
      tmuxLocation, agentState: "idle", heartbeatAt,
    }, "2025-12-31T00:00:00.000Z"));
  }
  runtime.reconcile();
  assert.deepEqual(registry.listRuntimeRegistrations(), []);
  registry.close();
});
