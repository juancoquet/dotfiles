import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createManagedWorktree, removeManagedWorktree, RuntimeRegistry, WorkspaceRegistry, type GitClient } from "../src/index.ts";

function paths() {
  const directory = mkdtempSync(join(tmpdir(), "piw-worktrees-"));
  return { directory, paths: { stateDirectory: join(directory, "state"), databasePath: join(directory, "state", "state.db"), runtimeDirectory: join(directory, "runtime") } };
}

class FakeGit implements GitClient {
  readonly calls: string[] = [];
  fetchFails = false;
  existingBranch = false;
  dirty = false;
  unpushed = false;
  merged = true;
  output(args: readonly string[]): string {
    this.calls.push(`output:${args.join(" ")}`);
    if (args[0] === "rev-parse") return args.includes("--show-toplevel") ? "/objects/example.git\n/primary\n" : "/objects/example.git\n";
    if (args[0] === "remote") return "origin\n";
    if (args[0] === "symbolic-ref" && args.at(-1) === "HEAD") return "main\n";
    if (args[0] === "symbolic-ref") return "origin/main\n";
    if (args[0] === "status") return this.dirty ? " M changed.ts\n" : "";
    if (args[0] === "log") return this.unpushed ? "deadbeef\n" : "";
    if (args[0] === "merge-base" && this.merged) return "";
    throw new Error(`unexpected output: ${args.join(" ")}`);
  }
  execute(args: readonly string[]): void {
    this.calls.push(`execute:${args.join(" ")}`);
    if (args[0] === "fetch" && this.fetchFails) throw new Error("network unavailable");
    if (args[0] === "show-ref" && !this.existingBranch) throw new Error("missing branch");
  }
}

function repositoryId(): string {
  return `repository-${createHash("sha256").update("git:/objects/example.git").digest("hex").slice(0, 20)}`;
}

function dependencies(registry: WorkspaceRegistry, home: string, git: FakeGit, result: "created-workspace" | "cancelled" = "created-workspace") {
  return {
    git,
    home: () => home,
    prompt: { base: async (value: string) => value, branch: async () => "feature/search", fetchFailure: async () => "fallback" as const },
    bootstrap: async (path: string) => {
      const root = { id: "new-root", repositoryId: repositoryId(), path, initializedAt: "2026-01-01", setupFailure: null };
      registry.upsertRoot(root);
      return result === "cancelled" ? undefined : { root, environment: {} };
    },
    createWorkspace: async () => result,
  };
}

test("creates from the fetched remote default in an isolated central path and persists only after launch", async () => {
  const fixture = paths(); const registry = WorkspaceRegistry.open({ paths: fixture.paths }); const git = new FakeGit();
  const result = await createManagedWorktree("/primary", registry, dependencies(registry, fixture.directory, git));
  assert.equal(result.kind, "created");
  if (result.kind !== "created") return;
  assert.equal(result.worktree.path, join(fixture.directory, ".local/share/pi/worktrees", repositoryId(), "feature-search"));
  assert.deepEqual(registry.getManagedWorktreeByPath(result.worktree.path), result.worktree);
  assert.ok(git.calls.includes("execute:fetch origin"));
  assert.ok(git.calls.includes("execute:worktree add -b feature/search " + result.worktree.path + " origin/main"));
  registry.close();
});

test("uses an explicit local fallback after fetch failure and an existing branch without recreating it", async () => {
  const fixture = paths(); const registry = WorkspaceRegistry.open({ paths: fixture.paths }); const git = new FakeGit();
  git.fetchFails = true; git.existingBranch = true;
  const result = await createManagedWorktree("/primary", registry, dependencies(registry, fixture.directory, git));
  assert.equal(result.kind, "created");
  assert.ok(git.calls.some((call) => call.includes("worktree add ") && call.includes(" feature/search") && !call.includes(" -b ")));
  registry.close();
});

test("cancellation after adding a worktree removes it and leaves no managed record", async () => {
  const fixture = paths(); const registry = WorkspaceRegistry.open({ paths: fixture.paths }); const git = new FakeGit();
  const result = await createManagedWorktree("/primary", registry, dependencies(registry, fixture.directory, git, "cancelled"));
  assert.deepEqual(result, { kind: "cancelled" });
  assert.ok(git.calls.some((call) => call.startsWith("execute:worktree remove --force ")));
  assert.equal(registry.getRootByPath(join(fixture.directory, ".local/share/pi/worktrees", repositoryId(), "feature-search")), undefined);
  assert.deepEqual(registry.listManagedWorktrees(repositoryId()), []);
  registry.close();
});

test("removes only a clean, merged, unused managed worktree and preserves its session history", () => {
  const fixture = paths(); const registry = WorkspaceRegistry.open({ paths: fixture.paths }); const git = new FakeGit();
  registry.upsertRepository({ id: repositoryId(), identity: "git:/objects/example.git", displayName: "example", sortRank: 1, setupCommand: null });
  registry.upsertRoot({ id: "managed-root", repositoryId: repositoryId(), path: "/managed", initializedAt: null, setupFailure: null });
  registry.upsertManagedWorktree({ id: "managed", repositoryId: repositoryId(), rootId: "managed-root", path: "/managed", branch: "feature/search" });
  registry.upsertSession({ id: "history", rootId: "managed-root", sessionFile: "/sessions/history", name: null, firstMessage: null, parentSessionFile: null, parentSessionId: null, lastActivityAt: null, archived: false, unread: false, sortRank: 1 });
  const result = removeManagedWorktree("/managed", registry, { git, runtime: (target) => new RuntimeRegistry(target, { isPidRunning: () => true }), confirm: () => true });
  assert.equal(result.kind, "removed");
  assert.ok(git.calls.includes("execute:worktree remove /managed"));
  assert.ok(git.calls.includes("execute:worktree prune"));
  assert.equal(registry.getManagedWorktreeByPath("/managed"), undefined);
  assert.equal(registry.getSession("history")?.rootId, "managed-root");
  registry.close();
});

test("refuses dirty, unpushed, warm, or unmerged managed worktrees without mutating Git", () => {
  for (const unsafe of ["dirty", "unpushed", "warm", "not-merged"] as const) {
    const fixture = paths(); const registry = WorkspaceRegistry.open({ paths: fixture.paths }); const git = new FakeGit();
    registry.upsertRepository({ id: repositoryId(), identity: "git:/objects/example.git", displayName: "example", sortRank: 1, setupCommand: null });
    registry.upsertRoot({ id: "managed-root", repositoryId: repositoryId(), path: "/managed", initializedAt: null, setupFailure: null });
    registry.upsertManagedWorktree({ id: "managed", repositoryId: repositoryId(), rootId: "managed-root", path: "/managed", branch: "feature/search" });
    registry.upsertSession({ id: "history", rootId: "managed-root", sessionFile: "/sessions/history", name: null, firstMessage: null, parentSessionFile: null, parentSessionId: null, lastActivityAt: null, archived: false, unread: false, sortRank: 1 });
    git.dirty = unsafe === "dirty"; git.unpushed = unsafe === "unpushed"; git.merged = unsafe !== "not-merged";
    if (unsafe === "warm") assert.ok(registry.claimRuntimeRegistration({ sessionId: "history", instanceId: "runtime", pid: process.pid, cwd: "/managed", workspaceId: "workspace", tmuxLocation: null, agentState: "idle", heartbeatAt: new Date().toISOString() }, "2000-01-01T00:00:00.000Z"));
    const result = removeManagedWorktree("/managed", registry, { git, runtime: (target) => new RuntimeRegistry(target, { isPidRunning: () => true }), confirm: () => assert.fail("unsafe deletion must not prompt") });
    assert.equal(result.kind, "refused");
    if (result.kind === "refused") assert.equal(result.reason, unsafe);
    assert.equal(registry.getManagedWorktreeByPath("/managed")?.id, "managed");
    assert.equal(git.calls.some((call) => call.startsWith("execute:worktree remove")), false);
    registry.close();
  }
});

test("uses a collision-safe branch slug path", async () => {
  const fixture = paths(); const registry = WorkspaceRegistry.open({ paths: fixture.paths }); const git = new FakeGit();
  const collision = join(fixture.directory, ".local/share/pi/worktrees", repositoryId(), "feature-search");
  mkdirSync(collision, { recursive: true });
  const result = await createManagedWorktree("/primary", registry, dependencies(registry, fixture.directory, git));
  assert.equal(result.kind, "created");
  if (result.kind === "created") assert.match(result.worktree.path, /feature-search-2$/);
  registry.close();
});
