import { execFileSync } from "node:child_process";
import { catalogSessions } from "./catalog.ts";
import { WorkspaceRegistry } from "./database.ts";
import { RuntimeRegistry } from "./runtime.ts";

const SHUTDOWN_WAIT_MS = 750;

export interface WorkspaceCloser {
  requestGracefulShutdown(location: string): void;
  closeWindow(location: string): void;
}

export interface SessionActionDependencies {
  openRegistry(): WorkspaceRegistry;
  catalog(registry: WorkspaceRegistry): Promise<unknown>;
  runtime(registry: WorkspaceRegistry): RuntimeRegistry;
  closer: WorkspaceCloser;
  confirmRunning(sessionId: string, action: "close" | "archive"): boolean;
  wait(milliseconds: number): Promise<void>;
}

export type CloseSessionResult = "closed" | "already-cold" | "active-elsewhere" | "not-found" | "cancelled";
export type ArchiveSessionResult = CloseSessionResult | "archived";

/** Stops a managed workspace but deliberately leaves its Pi history visible. */
export async function closeWorkspace(sessionId: string, dependencies: SessionActionDependencies = defaultDependencies()): Promise<CloseSessionResult> {
  const registry = dependencies.openRegistry();
  try {
    await dependencies.catalog(registry);
    const session = registry.getSession(sessionId);
    if (!session) return "not-found";
    const ownership = dependencies.runtime(registry).ownership(sessionId);
    if (ownership.state === "cold") return "already-cold";
    if (ownership.state === "active-elsewhere" || !ownership.registration.tmuxLocation) return "active-elsewhere";
    if (ownership.registration.agentState === "running" && !dependencies.confirmRunning(sessionId, "close")) return "cancelled";
    if (ownership.registration.agentState === "running") {
      dependencies.closer.requestGracefulShutdown(ownership.registration.tmuxLocation);
      await dependencies.wait(SHUTDOWN_WAIT_MS);
    }
    dependencies.closer.closeWindow(ownership.registration.tmuxLocation);
    return "closed";
  } finally {
    registry.close();
  }
}

/** Archives manager metadata only; Pi's JSONL history remains untouched. */
export async function archiveSession(sessionId: string, dependencies: SessionActionDependencies = defaultDependencies()): Promise<ArchiveSessionResult> {
  const registry = dependencies.openRegistry();
  try {
    await dependencies.catalog(registry);
    const session = registry.getSession(sessionId);
    if (!session) return "not-found";
    const ownership = dependencies.runtime(registry).ownership(sessionId);
    if (ownership.state === "active-elsewhere") return "active-elsewhere";
    if (ownership.state === "managed-warm") {
      if (!ownership.registration.tmuxLocation) return "active-elsewhere";
      if (ownership.registration.agentState === "running" && !dependencies.confirmRunning(sessionId, "archive")) return "cancelled";
      if (ownership.registration.agentState === "running") {
        dependencies.closer.requestGracefulShutdown(ownership.registration.tmuxLocation);
        await dependencies.wait(SHUTDOWN_WAIT_MS);
      }
      dependencies.closer.closeWindow(ownership.registration.tmuxLocation);
    }
    registry.setSessionArchived(session.id, true);
    return "archived";
  } finally {
    registry.close();
  }
}

/** Restores exactly one archived session, preserving all of its other metadata. */
export async function restoreSession(sessionId: string, dependencies: SessionActionDependencies = defaultDependencies()): Promise<boolean> {
  const registry = dependencies.openRegistry();
  try {
    await dependencies.catalog(registry);
    const session = registry.getSession(sessionId);
    return Boolean(session?.archived && registry.setSessionArchived(session.id, false));
  } finally {
    registry.close();
  }
}

function defaultDependencies(): SessionActionDependencies {
  return {
    openRegistry: () => WorkspaceRegistry.open(),
    catalog: catalogSessions,
    runtime: (registry) => new RuntimeRegistry(registry),
    closer: new LocalWorkspaceCloser(),
    confirmRunning: confirmRunning,
    wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  };
}

class LocalWorkspaceCloser implements WorkspaceCloser {
  requestGracefulShutdown(location: string): void {
    execFileSync("tmux", ["send-keys", "-t", location, "C-c"], { stdio: "ignore", timeout: 500 });
  }

  closeWindow(location: string): void {
    execFileSync("tmux", ["kill-window", "-t", location], { stdio: "ignore", timeout: 500 });
  }
}

function confirmRunning(sessionId: string, action: "close" | "archive"): boolean {
  try {
    execFileSync("fzf", ["--prompt=Confirm> ", "--header=An agent is running. Enter stops it and continues; Esc cancels.", "--select-1"], {
      input: `${action} ${sessionId}\n`, stdio: ["pipe", "ignore", "inherit"], timeout: 60_000,
    });
    return true;
  } catch {
    return false;
  }
}
