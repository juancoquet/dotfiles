import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { reconcileRuntimeArtifacts, RuntimeRegistry, WorkspaceRegistry, type RuntimeArtifactClient } from "../src/index.ts";

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
  runtime.reconcile();
  assert.deepEqual(registry.listRuntimeRegistrations(), []);
  registry.close();
});

class FakeArtifacts implements RuntimeArtifactClient {
  readonly killed: string[] = [];
  readonly killedWindows: string[] = [];
  readonly panes: Array<{ pane: string; workspaceId: string }>;
  readonly windows: Array<{ window: string; workspaceId: string }>;
  parkingSessionsKilled = 0;
  constructor(panes: Array<{ pane: string; workspaceId: string }>, windows: Array<{ window: string; workspaceId: string }> = []) {
    this.panes = panes;
    this.windows = windows;
  }
  listManagedWindows(): Array<{ window: string; workspaceId: string }> { return this.windows; }
  listParkingEditorPanes(): Array<{ pane: string; workspaceId: string }> { return this.panes; }
  killWindow(window: string): void { this.killedWindows.push(window); }
  killPane(pane: string): void {
    this.killed.push(pane);
    const index = this.panes.findIndex((candidate) => candidate.pane === pane);
    if (index >= 0) this.panes.splice(index, 1);
  }
  killParkingSession(): void { this.parkingSessionsKilled += 1; }
}

test("cleans stale manager sockets and orphaned parking panes without touching warm workspaces", async () => {
  const statePaths = paths();
  const registry = WorkspaceRegistry.open({ paths: statePaths });
  const socketPath = join(statePaths.runtimeDirectory, "workspace-stale.sock");
  const server = createServer();
  await new Promise<void>((resolve, reject) => server.once("error", reject).listen(socketPath, resolve));
  writeFileSync(join(statePaths.runtimeDirectory, "keep.txt"), "keep");
  assert.ok(registry.claimRuntimeRegistration({
    sessionId: "warm", instanceId: "warm", pid: process.pid, cwd: "/repo", workspaceId: "warm-workspace",
    tmuxLocation: null, agentState: "idle", heartbeatAt: new Date().toISOString(),
  }, "2000-01-01T00:00:00.000Z"));
  const artifacts = new FakeArtifacts(
    [{ pane: "%stale", workspaceId: "stale" }, { pane: "%warm", workspaceId: "warm-workspace" }],
    [{ window: "@stale", workspaceId: "stale" }, { window: "@warm", workspaceId: "warm-workspace" }],
  );

  reconcileRuntimeArtifacts(registry, artifacts);
  assert.equal(existsSync(socketPath), false);
  assert.equal(existsSync(join(statePaths.runtimeDirectory, "keep.txt")), true);
  assert.deepEqual(artifacts.killed, ["%stale"]);
  assert.deepEqual(artifacts.killedWindows, ["@stale"]);
  assert.equal(artifacts.parkingSessionsKilled, 0);

  reconcileRuntimeArtifacts(registry, artifacts);
  assert.deepEqual(artifacts.killed, ["%stale"]);
  registry.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
