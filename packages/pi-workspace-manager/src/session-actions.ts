import { execFileSync } from "node:child_process";
import { catalogSessions } from "./catalog.ts";
import { WorkspaceRegistry } from "./database.ts";
import { RuntimeRegistry } from "./runtime.ts";
import type { PiSession } from "./types.ts";

const SHUTDOWN_WAIT_MS = 750;

export interface WorkspaceCloser {
  requestGracefulShutdown(location: string): void;
  closeWindow(location: string): void;
}

export interface SessionTrasher {
  trash(path: string): void;
}

export interface SessionActionDependencies {
  openRegistry(): WorkspaceRegistry;
  catalog(registry: WorkspaceRegistry): Promise<unknown>;
  runtime(registry: WorkspaceRegistry): RuntimeRegistry;
  closer: WorkspaceCloser;
  trasher: SessionTrasher;
  confirmRunning(sessionId: string, action: "close" | "archive"): boolean;
  confirmArchiveTree(session: PiSession, descendantCount: number): boolean;
  confirmTrash(session: PiSession, rootPath: string): boolean;
  wait(milliseconds: number): Promise<void>;
}

export type CloseSessionResult = "closed" | "already-cold" | "active-elsewhere" | "not-found" | "cancelled";
export type ArchiveSessionResult = CloseSessionResult | "archived";
export type ArchiveTreeResult = ArchiveSessionResult | "archived-tree";
export type TrashSessionResult = "trashed" | "not-found" | "unsafe" | "cancelled" | "failed";

/** Stops a managed workspace but deliberately leaves its Pi history visible. */
export async function closeWorkspace(sessionId: string, dependencies: SessionActionDependencies = defaultDependencies()): Promise<CloseSessionResult> {
  const registry = dependencies.openRegistry();
  try {
    await dependencies.catalog(registry);
    const session = registry.getSession(sessionId);
    if (!session) return "not-found";
    return closeSession(session, registry, dependencies, "close");
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
    const closed = await closeSession(session, registry, dependencies, "archive");
    if (closed === "active-elsewhere" || closed === "cancelled") return closed;
    registry.setSessionArchived(session.id, true);
    return "archived";
  } finally {
    registry.close();
  }
}

/** Archives the selected session and every persisted descendant after one explicit confirmation. */
export async function archiveSessionTree(sessionId: string, dependencies: SessionActionDependencies = defaultDependencies()): Promise<ArchiveTreeResult> {
  const registry = dependencies.openRegistry();
  try {
    await dependencies.catalog(registry);
    const session = registry.getSession(sessionId);
    if (!session) return "not-found";
    const sessions = sessionTree(session, registry.listSessions());
    if (!dependencies.confirmArchiveTree(session, sessions.length - 1)) return "cancelled";
    for (const member of sessions) {
      const ownership = dependencies.runtime(registry).ownership(member.id);
      if (ownership.state === "active-elsewhere") return "active-elsewhere";
      if (ownership.state === "managed-warm" && ownership.registration.agentState === "running" && !dependencies.confirmRunning(member.id, "archive")) return "cancelled";
    }
    for (const member of sessions) {
      const closed = await closeSession(member, registry, dependencies, "archive", false);
      if (closed === "active-elsewhere" || closed === "cancelled") return closed;
      registry.setSessionArchived(member.id, true);
    }
    return "archived-tree";
  } finally {
    registry.close();
  }
}

/** Moves a cold Pi session file to macOS Trash and removes only its manager record. */
export async function trashSession(sessionId: string, dependencies: SessionActionDependencies = defaultDependencies()): Promise<TrashSessionResult> {
  const registry = dependencies.openRegistry();
  try {
    await dependencies.catalog(registry);
    const session = registry.getSession(sessionId);
    if (!session) return "not-found";
    const root = registry.getRoot(session.rootId);
    if (!root || dependencies.runtime(registry).ownership(session.id).state !== "cold") return "unsafe";
    if (!dependencies.confirmTrash(session, root.path)) return "cancelled";
    try {
      dependencies.trasher.trash(session.sessionFile);
    } catch {
      return "failed";
    }
    registry.removeSession(session.id);
    return "trashed";
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

async function closeSession(session: PiSession, registry: WorkspaceRegistry, dependencies: SessionActionDependencies, action: "close" | "archive", confirm = true): Promise<CloseSessionResult> {
  const ownership = dependencies.runtime(registry).ownership(session.id);
  if (ownership.state === "cold") return "already-cold";
  if (ownership.state === "active-elsewhere" || !ownership.registration.tmuxLocation) return "active-elsewhere";
  if (ownership.registration.agentState === "running" && confirm && !dependencies.confirmRunning(session.id, action)) return "cancelled";
  if (ownership.registration.agentState === "running") {
    dependencies.closer.requestGracefulShutdown(ownership.registration.tmuxLocation);
    await dependencies.wait(SHUTDOWN_WAIT_MS);
  }
  dependencies.closer.closeWindow(ownership.registration.tmuxLocation);
  return "closed";
}

function sessionTree(session: PiSession, sessions: readonly PiSession[]): PiSession[] {
  const descendants = new Map<string, PiSession[]>();
  for (const candidate of sessions) {
    const parentId = candidate.parentSessionId ?? (candidate.parentSessionFile === session.sessionFile ? session.id : undefined);
    if (!parentId) continue;
    const children = descendants.get(parentId) ?? [];
    children.push(candidate);
    descendants.set(parentId, children);
  }
  const tree: PiSession[] = [];
  const visit = (member: PiSession): void => {
    tree.push(member);
    for (const child of descendants.get(member.id) ?? []) visit(child);
  };
  visit(session);
  return tree;
}

function defaultDependencies(): SessionActionDependencies {
  return {
    openRegistry: () => WorkspaceRegistry.open(),
    catalog: catalogSessions,
    runtime: (registry) => new RuntimeRegistry(registry),
    closer: new LocalWorkspaceCloser(),
    trasher: new MacOsSessionTrasher(),
    confirmRunning,
    confirmArchiveTree,
    confirmTrash,
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

class MacOsSessionTrasher implements SessionTrasher {
  trash(path: string): void {
    execFileSync("osascript", ["-e", "on run argv\ntell application \"Finder\" to delete POSIX file (item 1 of argv)\nend run", path], { stdio: "ignore", timeout: 10_000 });
  }
}

function confirmRunning(sessionId: string, action: "close" | "archive"): boolean {
  return confirm(`${action} ${sessionId}`, "An agent is running. Enter stops it and continues; Esc cancels.");
}

function confirmArchiveTree(session: PiSession, descendantCount: number): boolean {
  return confirm(`Archive ${session.name || session.firstMessage || "Untitled session"} and ${descendantCount} descendant${descendantCount === 1 ? "" : "s"}`, "Enter archives this session tree; Esc cancels.");
}

function confirmTrash(session: PiSession, rootPath: string): boolean {
  return confirm(`Trash ${session.name || session.firstMessage || "Untitled session"} (${rootPath})`, "Enter moves this cold session to macOS Trash; Esc cancels.");
}

function confirm(value: string, header: string): boolean {
  try {
    execFileSync("fzf", ["--prompt=Confirm> ", `--header=${header}`, "--select-1"], {
      input: `${value}\n`, stdio: ["pipe", "ignore", "inherit"], timeout: 60_000,
    });
    return true;
  } catch {
    return false;
  }
}
