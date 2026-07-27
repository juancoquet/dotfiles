import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { statSync } from "node:fs";
import { resolve } from "node:path";
import { bootstrapRoot, type PreparedRoot } from "./bootstrap.ts";
import { catalogSessions } from "./catalog.ts";
import { WorkspaceRegistry } from "./database.ts";
import { reconcileRuntimeArtifacts, RuntimeRegistry } from "./runtime.ts";

const TMUX_SESSION = "pi";

export interface Tmux {
  hasSession(name: string): boolean;
  createSession(name: string, cwd: string): void;
  createPicker(session: string): string;
  createWorkspace(input: { session: string; cwd: string; workspaceId: string; runtimeInstanceId: string; sessionFile?: string; environment: NodeJS.ProcessEnv }): string;
  selectWindow(target: string): void;
  attach(session: string, insideTmux: boolean): void;
}

export interface LaunchDependencies {
  openRegistry(): WorkspaceRegistry;
  catalog(registry: WorkspaceRegistry): Promise<unknown>;
  runtime(registry: WorkspaceRegistry): RuntimeRegistry;
  tmux: Tmux;
  cwd(): string;
  pid(): number;
  insideTmux(): boolean;
  bootstrap(root: string, registry: WorkspaceRegistry): Promise<PreparedRoot | undefined>;
}

export type LaunchResult = "created-workspace" | "cancelled" | "opened-picker" | "returned-to-warm-workspace";
export type OpenWorkspaceResult = "opened-warm-workspace" | "imported-cold-session" | "switched-to-active-session" | "session-not-found" | "session-active-elsewhere";

/** Starts or enters the one tmux session which contains managed Pi workspaces. */
export async function launchPiw(path: string | undefined, dependencies: LaunchDependencies = defaultDependencies()): Promise<LaunchResult> {
  const root = proposedRoot(path, dependencies.cwd());
  const registry = dependencies.openRegistry();
  try {
    await dependencies.catalog(registry);
    const runtime = dependencies.runtime(registry);
    runtime.reconcile();
    reconcileRuntimeArtifacts(registry);
    const hasWarmWorkspace = registry.listRuntimeRegistrations().some((registration) =>
      registration.workspaceId !== null && registration.tmuxLocation?.startsWith(`${TMUX_SESSION}:`),
    );
    const hasPersistedSessions = registry.listSessions().length > 0;
    const hasTmuxSession = dependencies.tmux.hasSession(TMUX_SESSION);

    if (path === undefined && hasWarmWorkspace && hasTmuxSession) {
      dependencies.tmux.attach(TMUX_SESSION, dependencies.insideTmux());
      return "returned-to-warm-workspace";
    }

    if (!hasTmuxSession) dependencies.tmux.createSession(TMUX_SESSION, root);

    if (path !== undefined || !hasPersistedSessions) return createWorkspaceAtRoot(root, dependencies, registry);

    if (hasTmuxSession) dependencies.tmux.selectWindow(dependencies.tmux.createPicker(TMUX_SESSION));
    dependencies.tmux.attach(TMUX_SESSION, dependencies.insideTmux());
    return "opened-picker";
  } finally {
    registry.close();
  }
}

/** Opens a selected session without replacing any other workspace. */
export async function openWorkspace(sessionId: string, dependencies: LaunchDependencies = defaultDependencies()): Promise<OpenWorkspaceResult> {
  const registry = dependencies.openRegistry();
  try {
    await dependencies.catalog(registry);
    const session = registry.getSession(sessionId);
    if (!session) return "session-not-found";
    const root = registry.getRoot(session.rootId);
    if (!root) return "session-not-found";

    const runtime = dependencies.runtime(registry);
    const ownership = runtime.ownership(session.id);
    registry.setSessionUnread(session.id, false);
    if (ownership.state === "managed-warm") {
      if (!ownership.registration.tmuxLocation) return "session-active-elsewhere";
      selectWorkspaceWindow(ownership.registration.tmuxLocation, dependencies);
      return "opened-warm-workspace";
    }
    if (ownership.state === "active-elsewhere") {
      if (ownership.registration.tmuxLocation) {
        selectWorkspaceWindow(ownership.registration.tmuxLocation, dependencies);
        return "switched-to-active-session";
      }
      return "session-active-elsewhere";
    }

    if (!dependencies.tmux.hasSession(TMUX_SESSION)) dependencies.tmux.createSession(TMUX_SESSION, root.path);
    const prepared = await dependencies.bootstrap(root.path, registry);
    if (!prepared) return "session-not-found";
    const workspaceId = randomUUID();
    const runtimeInstanceId = randomUUID();
    const reservation = runtime.claim({
      sessionId: session.id, instanceId: runtimeInstanceId, pid: dependencies.pid(), cwd: root.path,
      workspaceId, tmuxLocation: null, agentState: "idle",
    });
    if (!reservation) return "session-active-elsewhere";
    try {
      const window = dependencies.tmux.createWorkspace({
        session: TMUX_SESSION, cwd: root.path, workspaceId, runtimeInstanceId, sessionFile: session.sessionFile, environment: prepared.environment,
      });
      dependencies.tmux.selectWindow(window);
      dependencies.tmux.attach(TMUX_SESSION, dependencies.insideTmux());
      return "imported-cold-session";
    } catch (error) {
      runtime.release(reservation);
      throw error;
    }
  } finally {
    registry.close();
  }
}

/** Creates an independent managed runtime for a new Pi conversation. */
export async function createNewWorkspace(root: string, dependencies: LaunchDependencies = defaultDependencies()): Promise<"created-workspace" | "cancelled"> {
  const registry = dependencies.openRegistry();
  try { return await createWorkspaceAtRoot(root, dependencies, registry); } finally { registry.close(); }
}

async function createWorkspaceAtRoot(root: string, dependencies: LaunchDependencies, registry: WorkspaceRegistry): Promise<"created-workspace" | "cancelled"> {
  const exactRoot = proposedRoot(root, dependencies.cwd());
  const prepared = await dependencies.bootstrap(exactRoot, registry);
  if (!prepared) return "cancelled";
  if (!dependencies.tmux.hasSession(TMUX_SESSION)) dependencies.tmux.createSession(TMUX_SESSION, exactRoot);
  const window = dependencies.tmux.createWorkspace({
    session: TMUX_SESSION, cwd: exactRoot, workspaceId: randomUUID(), runtimeInstanceId: randomUUID(), environment: prepared.environment,
  });
  dependencies.tmux.selectWindow(window);
  dependencies.tmux.attach(TMUX_SESSION, dependencies.insideTmux());
  return "created-workspace";
}

function selectWorkspaceWindow(location: string, dependencies: LaunchDependencies): void {
  const session = location.split(":", 1)[0];
  if (!session) return;
  dependencies.tmux.selectWindow(location);
  dependencies.tmux.attach(session, dependencies.insideTmux());
}

function proposedRoot(path: string | undefined, cwd: string): string {
  const root = resolve(cwd, path ?? ".");
  if (!statSync(root).isDirectory()) throw new Error(`piw root is not a directory: ${root}`);
  return root;
}

function defaultDependencies(): LaunchDependencies {
  return {
    openRegistry: () => WorkspaceRegistry.open(),
    catalog: catalogSessions,
    runtime: (registry) => new RuntimeRegistry(registry),
    tmux: new LocalTmux(),
    cwd: () => process.cwd(),
    pid: () => process.pid,
    insideTmux: () => Boolean(process.env.TMUX),
    bootstrap: (root, registry) => bootstrapRoot(root, registry),
  };
}

class LocalTmux implements Tmux {
  hasSession(name: string): boolean {
    try {
      execFileSync("tmux", ["has-session", "-t", name], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }

  createSession(name: string, cwd: string): void {
    runTmux(["new-session", "-d", "-s", name, "-c", cwd, "-n", "picker", "piw-picker"]);
  }

  createPicker(session: string): string {
    return runTmux(["new-window", "-d", "-a", "-P", "-F", "#{window_id}", "-t", session, "-n", "picker", "piw-picker"]).trim();
  }

  createWorkspace(input: { session: string; cwd: string; workspaceId: string; runtimeInstanceId: string; sessionFile?: string; environment: NodeJS.ProcessEnv }): string {
    const windowEnvironment = Object.entries(input.environment)
      .filter((entry): entry is [string, string] => entry[1] !== undefined)
      .flatMap(([key, value]) => ["-e", `${key}=${value}`]);
    const command = ["env", `PIW_WORKSPACE_ID=${input.workspaceId}`, `PIW_RUNTIME_INSTANCE_ID=${input.runtimeInstanceId}`, "pi"];
    if (input.sessionFile) command.push("--session", input.sessionFile);
    const window = runTmux([
      "new-window", "-d", "-a", "-P", "-F", "#{window_id}", "-t", input.session, "-c", input.cwd,
      ...windowEnvironment, "-n", `workspace-${input.workspaceId.slice(0, 8)}`, ...command,
    ]).trim();
    runTmux(["set-window-option", "-t", window, "@piw_workspace_id", input.workspaceId]);
    runTmux(["set-window-option", "-t", window, "@piw_root", input.cwd]);
    return window;
  }

  selectWindow(target: string): void {
    runTmux(["select-window", "-t", target]);
  }

  attach(session: string, insideTmux: boolean): void {
    const args = insideTmux ? ["switch-client", "-t", session] : ["attach-session", "-t", session];
    // attach-session needs the caller's terminal; captured stdin makes tmux
    // reject it with "open terminal failed: not a terminal".
    execFileSync("tmux", args, { stdio: "inherit" });
  }
}

function runTmux(args: string[]): string {
  return execFileSync("tmux", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

if (import.meta.main) {
  const [path, ...extra] = process.argv.slice(2);
  if (extra.length > 0) throw new Error("Usage: piw [path]");
  await launchPiw(path);
}
