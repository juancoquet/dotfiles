import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { GitRootInspector, type RootInspector } from "./catalog.ts";
import { WorkspaceRegistry } from "./database.ts";
import type { Repository, Root } from "./types.ts";

export type SetupResult = "ready" | "cancelled";

export interface SetupPrompter {
  command(defaultValue: string): Promise<string | undefined>;
  failure(command: string, error: string): Promise<"edit" | "retry" | "continue" | "cancel">;
}

export interface RootBootstrapDependencies {
  inspector: RootInspector;
  prompt: SetupPrompter;
  run(command: string, root: string, environment: NodeJS.ProcessEnv): void;
  now(): Date;
  environment(): NodeJS.ProcessEnv;
}

export interface PreparedRoot {
  root: Root;
  environment: NodeJS.ProcessEnv;
}

/** Prepares one exact root and returns the environment every workspace must use. */
export async function bootstrapRoot(
  rootPath: string,
  registry: WorkspaceRegistry,
  options: { force?: boolean; dependencies?: RootBootstrapDependencies } = {},
): Promise<PreparedRoot | undefined> {
  const root = ensureRoot(resolve(rootPath), registry, options.dependencies?.inspector ?? new GitRootInspector());
  const dependencies = options.dependencies ?? defaultDependencies();
  const environment = environmentForRoot(root.path, dependencies.environment());
  const venv = join(root.path, ".venv");

  if (existsSync(venv) && !options.force) {
    markInitialized(registry, root, dependencies.now(), null);
    return { root: registry.getRoot(root.id)!, environment };
  }
  if (root.initializedAt && !options.force) return { root, environment };

  const repository = root.repositoryId ? registry.getRepository(root.repositoryId) : undefined;
  let command = await dependencies.prompt.command(repository?.setupCommand ?? suggestedSetupCommand(root.path));
  if (command === undefined) return undefined;
  command = command.trim();
  if (!command) {
    markInitialized(registry, root, dependencies.now(), null);
    return { root: registry.getRoot(root.id)!, environment };
  }

  while (true) {
    try {
      dependencies.run(command, root.path, environment);
      rememberSuccess(registry, root, command, dependencies.now());
      return { root: registry.getRoot(root.id)!, environment };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const choice = await dependencies.prompt.failure(command, message);
      if (choice === "cancel") return undefined;
      if (choice === "continue") {
        markInitialized(registry, root, dependencies.now(), message);
        return { root: registry.getRoot(root.id)!, environment };
      }
      if (choice === "edit") {
        const edited = await dependencies.prompt.command(command);
        if (edited === undefined) return undefined;
        command = edited.trim();
        if (!command) {
          markInitialized(registry, root, dependencies.now(), null);
          return { root: registry.getRoot(root.id)!, environment };
        }
      }
    }
  }
}

export function environmentForRoot(root: string, base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const venv = join(root, ".venv");
  if (!existsSync(venv)) return { ...base };
  return { ...base, VIRTUAL_ENV: venv, PATH: `${join(venv, "bin")}:${base.PATH ?? ""}` };
}

export function suggestedSetupCommand(root: string): string {
  if (existsSync(join(root, "uv.lock")) || existsSync(join(root, "pyproject.toml"))) return "uv sync";
  if (existsSync(join(root, "package.json"))) return "npm install";
  if (existsSync(join(root, "Gemfile"))) return "bundle install";
  if (existsSync(join(root, "go.mod"))) return "go mod download";
  if (existsSync(join(root, "setup.sh"))) return "sh ./setup.sh";
  return "";
}

function ensureRoot(path: string, registry: WorkspaceRegistry, inspector: RootInspector): Root {
  const existing = registry.getRootByPath(path);
  if (existing) return existing;
  const group = inspector.inspect(path);
  const repositoryId = idFor("repository", group.identity);
  const repository = registry.getRepository(repositoryId);
  registry.upsertRepository({ id: repositoryId, identity: group.identity, displayName: group.displayName, sortRank: repository?.sortRank ?? registry.nextRepositoryRank(), setupCommand: repository?.setupCommand ?? null });
  const root: Root = { id: idFor("root", path), repositoryId, path, initializedAt: null, setupFailure: null };
  registry.upsertRoot(root);
  return root;
}

function rememberSuccess(registry: WorkspaceRegistry, root: Root, command: string, now: Date): void {
  markInitialized(registry, root, now, null);
  if (!root.repositoryId) return;
  const repository = registry.getRepository(root.repositoryId);
  if (!repository) return;
  registry.upsertRepository({ ...repository, setupCommand: command });
}

function markInitialized(registry: WorkspaceRegistry, root: Root, now: Date, failure: string | null): void {
  registry.upsertRoot({ ...root, initializedAt: now.toISOString(), setupFailure: failure });
}

function idFor(kind: string, value: string): string {
  return `${kind}-${createHash("sha256").update(value).digest("hex").slice(0, 20)}`;
}

function defaultDependencies(): RootBootstrapDependencies {
  return {
    inspector: new GitRootInspector(),
    prompt: new TerminalPrompter(),
    run(command, root, environment) { execFileSync("/bin/sh", ["-lc", command], { cwd: root, env: environment, stdio: "inherit" }); },
    now: () => new Date(),
    environment: () => process.env,
  };
}

class TerminalPrompter implements SetupPrompter {
  async command(defaultValue: string): Promise<string | undefined> {
    return ask(`Optional setup command${defaultValue ? ` [${defaultValue}]` : ""} (Enter skips): `, defaultValue);
  }
  async failure(command: string, error: string): Promise<"edit" | "retry" | "continue" | "cancel"> {
    process.stderr.write(`Setup failed: ${error}\n`);
    while (true) {
      const answer = (await ask(`Setup '${command}': [e]dit, [r]etry, [c]ontinue, [q]ancel: `, "q"))?.toLowerCase();
      if (answer === "e" || answer === "edit") return "edit";
      if (answer === "r" || answer === "retry") return "retry";
      if (answer === "c" || answer === "continue") return "continue";
      if (answer === "q" || answer === "cancel" || answer === undefined) return "cancel";
    }
  }
}

async function ask(question: string, defaultValue: string): Promise<string | undefined> {
  const { createInterface } = await import("node:readline/promises");
  const readline = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await readline.question(question);
    return answer;
  } catch { return undefined; } finally { readline.close(); }
}
