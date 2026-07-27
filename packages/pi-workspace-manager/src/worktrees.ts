import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, rmdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { WorkspaceRegistry } from "./database.ts";
import { bootstrapRoot, type PreparedRoot } from "./bootstrap.ts";
import { createNewWorkspace } from "./launcher.ts";
import type { ManagedWorktree, Repository } from "./types.ts";

export interface GitWorktree {
  path: string;
  branch: string | null;
}

export interface ManagedWorktreePrompter {
  base(defaultValue: string): Promise<string | undefined>;
  branch(): Promise<string | undefined>;
  fetchFailure(localDefault: string): Promise<"fallback" | "cancel">;
}

export interface ManagedWorktreeDependencies {
  git: GitClient;
  prompt: ManagedWorktreePrompter;
  bootstrap(path: string, registry: WorkspaceRegistry): Promise<PreparedRoot | undefined>;
  createWorkspace(path: string): Promise<"created-workspace" | "cancelled">;
  home(): string;
}

export interface GitClient {
  output(args: readonly string[], cwd: string): string;
  execute(args: readonly string[], cwd: string): void;
}

export type ManagedWorktreeResult =
  | { kind: "created"; worktree: ManagedWorktree }
  | { kind: "cancelled" };

/** Lists worktrees belonging to the repository containing `root`. */
export function listGitWorktrees(root: string, git: GitClient = new LocalGit()): GitWorktree[] {
  const lines = git.output(["worktree", "list", "--porcelain"], root).split("\n");
  const worktrees: GitWorktree[] = [];
  let path: string | undefined;
  let branch: string | null = null;
  for (const line of [...lines, ""]) {
    if (!line) {
      if (path) worktrees.push({ path, branch });
      path = undefined;
      branch = null;
    } else if (line.startsWith("worktree ")) path = line.slice("worktree ".length);
    else if (line.startsWith("branch refs/heads/")) branch = line.slice("branch refs/heads/".length);
  }
  return worktrees;
}

/** Creates a centrally located worktree, bootstraps it, then records it durably. */
export async function createManagedWorktree(
  sourceRoot: string,
  registry: WorkspaceRegistry,
  dependencies: ManagedWorktreeDependencies = defaultDependencies(),
): Promise<ManagedWorktreeResult> {
  const source = inspectRepository(sourceRoot, dependencies.git);
  const repository = ensureRepository(source, registry);
  const remote = selectRemote(source.topLevel, dependencies.git);
  const localDefault = localDefaultBranch(source.topLevel, dependencies.git);
  let defaultBase: string;
  try {
    dependencies.git.execute(["fetch", remote], source.topLevel);
    defaultBase = remoteDefaultBranch(source.topLevel, remote, dependencies.git);
  } catch (error) {
    if (!localDefault || await dependencies.prompt.fetchFailure(localDefault) === "cancel") return { kind: "cancelled" };
    defaultBase = localDefault;
  }

  const base = (await dependencies.prompt.base(defaultBase))?.trim();
  if (!base) return { kind: "cancelled" };
  const branch = (await dependencies.prompt.branch())?.trim();
  if (!branch) return { kind: "cancelled" };
  dependencies.git.execute(["check-ref-format", "--branch", branch], source.topLevel);

  const target = availableWorktreePath(join(dependencies.home(), ".local", "share", "pi", "worktrees", repository.id), branch);
  mkdirSync(join(dependencies.home(), ".local", "share", "pi", "worktrees", repository.id), { recursive: true, mode: 0o700 });
  const existingBranch = hasLocalBranch(source.topLevel, branch, dependencies.git);
  let added = false;
  let prepared: PreparedRoot | undefined;
  let record: ManagedWorktree | undefined;
  try {
    dependencies.git.execute(existingBranch
      ? ["worktree", "add", target, branch]
      : ["worktree", "add", "-b", branch, target, base], source.topLevel);
    added = true;
    prepared = await dependencies.bootstrap(target, registry);
    if (!prepared) return { kind: "cancelled" };
    record = { id: idFor("worktree", target), repositoryId: repository.id, rootId: prepared.root.id, path: target, branch };
    // Persist before starting Pi. This eliminates a post-launch persistence
    // failure that could otherwise strand a live workspace in a removed root.
    registry.upsertManagedWorktree(record);
    const created = await dependencies.createWorkspace(target);
    if (created === "cancelled") return { kind: "cancelled" };
    added = false; // Ownership has transferred to the durable manager record.
    return { kind: "created", worktree: record };
  } finally {
    // This worktree was created by this call, so force removal is safe during
    // compensation even when a failed setup left untracked output behind.
    if (added) {
      if (record) registry.removeManagedWorktree(record.id);
      removeCreatedWorktree(source.topLevel, target, dependencies.git);
      const root = prepared?.root ?? registry.getRootByPath(target);
      if (root) registry.removeRootIfUnused(root.id);
    }
  }
}

function inspectRepository(root: string, git: GitClient): { commonDirectory: string; topLevel: string } {
  const [commonDirectory, topLevel] = git.output(["rev-parse", "--path-format=absolute", "--git-common-dir", "--show-toplevel"], root).trim().split("\n");
  if (!commonDirectory || !topLevel) throw new Error(`Not a Git worktree: ${root}`);
  return { commonDirectory: resolve(commonDirectory), topLevel: resolve(topLevel) };
}

function ensureRepository(source: { commonDirectory: string; topLevel: string }, registry: WorkspaceRegistry): Repository {
  const identity = `git:${source.commonDirectory}`;
  const id = idFor("repository", identity);
  const existing = registry.getRepository(id);
  const repository: Repository = existing ?? { id, identity, displayName: basename(source.topLevel), sortRank: registry.nextRepositoryRank(), setupCommand: null };
  registry.upsertRepository(repository);
  return repository;
}

function selectRemote(root: string, git: GitClient): string {
  const remotes = git.output(["remote"], root).split("\n").filter(Boolean);
  const remote = remotes.includes("origin") ? "origin" : remotes[0];
  if (!remote) throw new Error("Cannot create a managed worktree: this repository has no remote");
  return remote;
}

function remoteDefaultBranch(root: string, remote: string, git: GitClient): string {
  const ref = git.output(["symbolic-ref", "--quiet", "--short", `refs/remotes/${remote}/HEAD`], root).trim();
  if (!ref) throw new Error(`Remote ${remote} has no configured default branch`);
  return ref;
}

function localDefaultBranch(root: string, git: GitClient): string | undefined {
  try { return git.output(["symbolic-ref", "--quiet", "--short", "HEAD"], root).trim() || undefined; } catch { return undefined; }
}

function hasLocalBranch(root: string, branch: string, git: GitClient): boolean {
  try { git.execute(["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], root); return true; } catch { return false; }
}

function availableWorktreePath(directory: string, branch: string): string {
  const slug = branch.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "branch";
  for (let suffix = 1; ; suffix += 1) {
    const path = join(directory, suffix === 1 ? slug : `${slug}-${suffix}`);
    if (!existsSync(path)) return path;
  }
}

function removeCreatedWorktree(sourceRoot: string, path: string, git: GitClient): void {
  try { git.execute(["worktree", "remove", "--force", path], sourceRoot); } catch { /* retain the original failure */ }
  try { rmdirSync(path); } catch { /* Git normally removed it */ }
}

function idFor(kind: string, value: string): string {
  return `${kind}-${createHash("sha256").update(value).digest("hex").slice(0, 20)}`;
}

function defaultDependencies(): ManagedWorktreeDependencies {
  return {
    git: new LocalGit(), prompt: new TerminalWorktreePrompter(), bootstrap: bootstrapRoot,
    createWorkspace: createNewWorkspace, home: homedir,
  };
}

export class LocalGit implements GitClient {
  output(args: readonly string[], cwd: string): string {
    return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
  }
  execute(args: readonly string[], cwd: string): void {
    execFileSync("git", ["-C", cwd, ...args], { stdio: "inherit" });
  }
}

class TerminalWorktreePrompter implements ManagedWorktreePrompter {
  base(defaultValue: string): Promise<string | undefined> { return ask(`Base revision [${defaultValue}]: `, defaultValue); }
  branch(): Promise<string | undefined> { return ask("Branch name: ", ""); }
  async fetchFailure(localDefault: string): Promise<"fallback" | "cancel"> {
    const answer = (await ask(`Fetch failed. Use local ${localDefault}? [y/N]: `, ""))?.toLowerCase();
    return answer === "y" || answer === "yes" ? "fallback" : "cancel";
  }
}

async function ask(question: string, defaultValue: string): Promise<string | undefined> {
  const { createInterface } = await import("node:readline/promises");
  const readline = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await readline.question(question);
    return answer || defaultValue;
  } catch { return undefined; } finally { readline.close(); }
}
