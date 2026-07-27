import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createNewWorkspace, launchPiw, openWorkspace, RuntimeRegistry, WorkspaceRegistry, type LaunchDependencies, type Tmux } from "../src/index.ts";

function paths() {
  const directory = mkdtempSync(join(tmpdir(), "piw-launcher-"));
  return { directory, paths: { stateDirectory: join(directory, "state"), databasePath: join(directory, "state", "state.db"), runtimeDirectory: join(directory, "runtime") } };
}

function seedSession(registry: WorkspaceRegistry, rootPath = "/repo"): void {
  registry.upsertRepository({ id: "repo", identity: "directory:/repo", displayName: "repo", sortRank: 1, setupCommand: null });
  registry.upsertRoot({ id: "root", repositoryId: "repo", path: rootPath, initializedAt: null, setupFailure: null });
  registry.upsertSession({ id: "session", rootId: "root", sessionFile: "/sessions/session.jsonl", name: null, firstMessage: null, parentSessionFile: null, parentSessionId: null, lastActivityAt: null, archived: false, unread: false, sortRank: 1 });
}

class FakeTmux implements Tmux {
  readonly calls: string[] = [];
  exists = false;
  hasSession(): boolean { return this.exists; }
  createSession(_name: string, cwd: string): void { this.exists = true; this.calls.push(`create-session:${cwd}`); }
  createPicker(_session: string): string { this.calls.push("picker"); return "@picker"; }
  createWorkspace(input: { session: string; cwd: string; workspaceId: string; runtimeInstanceId: string; sessionFile?: string; environment: NodeJS.ProcessEnv }): string {
    this.calls.push(`workspace:${input.cwd}:${input.sessionFile ?? "new"}:${input.workspaceId}:${input.runtimeInstanceId}`);
    return "@2";
  }
  selectWindow(target: string): void { this.calls.push(`select:${target}`); }
  attach(session: string, inside: boolean): void { this.calls.push(`${inside ? "switch" : "attach"}:${session}`); }
}

function dependencies(registry: WorkspaceRegistry, tmux: FakeTmux, cwd: string, runtime = new RuntimeRegistry(registry)): LaunchDependencies {
  return {
    openRegistry: () => WorkspaceRegistry.open({ paths: registry.paths }), catalog: async () => {}, runtime: () => runtime, tmux, cwd: () => cwd, pid: () => process.pid, insideTmux: () => false,
    bootstrap: async (root) => ({ root: registry.getRootByPath(root) ?? { id: "root", repositoryId: null, path: root, initializedAt: null, setupFailure: null }, environment: {} }),
  };
}

test("creates the dedicated session and first workspace in the invocation directory", async () => {
  const { directory, paths: statePaths } = paths();
  const registry = WorkspaceRegistry.open({ paths: statePaths });
  const tmux = new FakeTmux();
  assert.equal(await launchPiw(undefined, dependencies(registry, tmux, directory)), "created-workspace");
  assert.deepEqual(tmux.calls.map((call) => call.split(":")[0]), ["create-session", "workspace", "select", "attach"]);
  assert.match(tmux.calls[1]!, new RegExp(`^workspace:${directory}:new:`));
});

test("creates independent fresh workspace processes for the same exact root", async () => {
  const { directory, paths: statePaths } = paths();
  const registry = WorkspaceRegistry.open({ paths: statePaths });
  const tmux = new FakeTmux();
  const deps = dependencies(registry, tmux, directory);

  await createNewWorkspace(directory, deps);
  await createNewWorkspace(directory, deps);

  const workspaces = tmux.calls.filter((call) => call.startsWith("workspace:"));
  assert.equal(workspaces.length, 2);
  assert.notEqual(workspaces[0]!.split(":")[3], workspaces[1]!.split(":")[3]);
});

test("uses an explicit subdirectory as the workspace root", async () => {
  const { directory, paths: statePaths } = paths();
  const child = join(directory, "child");
  await import("node:fs/promises").then(({ mkdir }) => mkdir(child));
  const registry = WorkspaceRegistry.open({ paths: statePaths });
  seedSession(registry);
  const tmux = new FakeTmux();
  assert.equal(await launchPiw("child", dependencies(registry, tmux, directory)), "created-workspace");
  assert.match(tmux.calls[1]!, new RegExp(`^workspace:${child}:new:`));
});

test("does not register a warm workspace when Pi window creation fails", async () => {
  const { directory, paths: statePaths } = paths();
  const registry = WorkspaceRegistry.open({ paths: statePaths });
  const tmux = new FakeTmux();
  tmux.createWorkspace = () => { throw new Error("Pi failed to start"); };

  await assert.rejects(createNewWorkspace(directory, dependencies(registry, tmux, directory)), /Pi failed to start/);
  assert.deepEqual(registry.listRuntimeRegistrations(), []);
});

test("returns to the pi session's active warm workspace by switching an existing tmux client", async () => {
  const { directory, paths: statePaths } = paths();
  const registry = WorkspaceRegistry.open({ paths: statePaths });
  seedSession(registry);
  const runtime = new RuntimeRegistry(registry, { isPidRunning: () => true, isTmuxLocationRunning: () => true });
  assert.ok(runtime.claim({ sessionId: "session", instanceId: "workspace", pid: 1, cwd: directory, workspaceId: "workspace", tmuxLocation: "pi:2.0", agentState: "idle" }));
  const tmux = new FakeTmux();
  tmux.exists = true;
  const deps = dependencies(registry, tmux, directory, runtime);
  deps.insideTmux = () => true;
  assert.equal(await launchPiw(undefined, deps), "returned-to-warm-workspace");
  assert.deepEqual(tmux.calls, ["switch:pi"]);
});

test("opens the dedicated session without creating a workspace when sessions are cold", async () => {
  const { directory, paths: statePaths } = paths();
  const registry = WorkspaceRegistry.open({ paths: statePaths });
  seedSession(registry);
  const tmux = new FakeTmux();
  tmux.exists = true;
  assert.equal(await launchPiw(undefined, dependencies(registry, tmux, directory)), "opened-picker");
  assert.deepEqual(tmux.calls, ["picker", "select:@picker", "attach:pi"]);
});

test("switches a warm managed workspace without replacing its process", async () => {
  const { directory, paths: statePaths } = paths();
  const registry = WorkspaceRegistry.open({ paths: statePaths });
  seedSession(registry);
  const runtime = new RuntimeRegistry(registry, { isPidRunning: () => true, isTmuxLocationRunning: () => true });
  assert.ok(runtime.claim({ sessionId: "session", instanceId: "warm", pid: 1, cwd: "/repo", workspaceId: "workspace", tmuxLocation: "pi:2.0", agentState: "running" }));
  const tmux = new FakeTmux();
  tmux.exists = true;
  assert.equal(await openWorkspace("session", dependencies(registry, tmux, directory, runtime)), "opened-warm-workspace");
  assert.deepEqual(tmux.calls, ["select:pi:2.0", "attach:pi"]);
});

test("imports a cold raw session at its exact root and resumes its JSONL file", async () => {
  const { directory, paths: statePaths } = paths();
  const registry = WorkspaceRegistry.open({ paths: statePaths });
  seedSession(registry, "/repo/src");
  const runtime = new RuntimeRegistry(registry, { isPidRunning: () => true, isTmuxLocationRunning: () => true });
  const tmux = new FakeTmux();
  assert.equal(await openWorkspace("session", dependencies(registry, tmux, directory, runtime)), "imported-cold-session");
  assert.match(tmux.calls[0]!, /^create-session:\/repo\/src$/);
  assert.match(tmux.calls[1]!, /^workspace:\/repo\/src:\/sessions\/session\.jsonl:/);
  assert.deepEqual(tmux.calls.slice(2).map((call) => call.split(":")[0]), ["select", "attach"]);
});

test("switches to an active external session when its tmux location is known", async () => {
  const { directory, paths: statePaths } = paths();
  const registry = WorkspaceRegistry.open({ paths: statePaths });
  seedSession(registry);
  const runtime = new RuntimeRegistry(registry, { isPidRunning: () => true, isTmuxLocationRunning: () => true });
  assert.ok(runtime.claim({ sessionId: "session", instanceId: "raw", pid: 1, cwd: "/repo", workspaceId: null, tmuxLocation: "other:4.1", agentState: "idle" }));
  const tmux = new FakeTmux();
  assert.equal(await openWorkspace("session", dependencies(registry, tmux, directory, runtime)), "switched-to-active-session");
  assert.deepEqual(tmux.calls, ["select:other:4.1", "attach:other"]);
});

test("prevents concurrent cold imports before Pi claims the resumed session", async () => {
  const { directory, paths: statePaths } = paths();
  const seedRegistry = WorkspaceRegistry.open({ paths: statePaths });
  seedSession(seedRegistry);
  seedRegistry.close();
  const tmux = new FakeTmux();
  const makeDependencies = (): LaunchDependencies => ({
    openRegistry: () => WorkspaceRegistry.open({ paths: statePaths }),
    catalog: async () => {},
    runtime: (registry) => new RuntimeRegistry(registry, { isPidRunning: () => true, isTmuxLocationRunning: () => true }),
    tmux, cwd: () => directory, pid: () => process.pid, insideTmux: () => false,
    bootstrap: async (root) => ({ root: { id: "root", repositoryId: null, path: root, initializedAt: null, setupFailure: null }, environment: {} }),
  });
  assert.equal(await openWorkspace("session", makeDependencies()), "imported-cold-session");
  assert.equal(await openWorkspace("session", makeDependencies()), "session-active-elsewhere");
  assert.equal(tmux.calls.filter((call) => call.startsWith("workspace:")).length, 1);
});

test("refuses an active session with no tmux location", async () => {
  const { directory, paths: statePaths } = paths();
  const registry = WorkspaceRegistry.open({ paths: statePaths });
  seedSession(registry);
  const runtime = new RuntimeRegistry(registry, { isPidRunning: () => true, isTmuxLocationRunning: () => true });
  assert.ok(runtime.claim({ sessionId: "session", instanceId: "raw", pid: 1, cwd: "/repo", workspaceId: null, tmuxLocation: null, agentState: "idle" }));
  const tmux = new FakeTmux();
  assert.equal(await openWorkspace("session", dependencies(registry, tmux, directory, runtime)), "session-active-elsewhere");
  assert.deepEqual(tmux.calls, []);
});
