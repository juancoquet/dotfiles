import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createManagedWorktree, WorkspaceRegistry, type GitClient } from "../src/index.ts";

function paths() {
  const directory = mkdtempSync(join(tmpdir(), "piw-worktrees-"));
  return { directory, paths: { stateDirectory: join(directory, "state"), databasePath: join(directory, "state", "state.db"), runtimeDirectory: join(directory, "runtime") } };
}

class FakeGit implements GitClient {
  readonly calls: string[] = [];
  fetchFails = false;
  existingBranch = false;
  output(args: readonly string[]): string {
    this.calls.push(`output:${args.join(" ")}`);
    if (args[0] === "rev-parse") return "/objects/example.git\n/primary\n";
    if (args[0] === "remote") return "origin\n";
    if (args[0] === "symbolic-ref" && args.at(-1) === "HEAD") return "main\n";
    if (args[0] === "symbolic-ref") return "origin/main\n";
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

test("uses a collision-safe branch slug path", async () => {
  const fixture = paths(); const registry = WorkspaceRegistry.open({ paths: fixture.paths }); const git = new FakeGit();
  const collision = join(fixture.directory, ".local/share/pi/worktrees", repositoryId(), "feature-search");
  mkdirSync(collision, { recursive: true });
  const result = await createManagedWorktree("/primary", registry, dependencies(registry, fixture.directory, git));
  assert.equal(result.kind, "created");
  if (result.kind === "created") assert.match(result.worktree.path, /feature-search-2$/);
  registry.close();
});
