import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstatSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { WorkspaceRegistry } from "./database.ts";
import type { RuntimeOwnership, RuntimeRegistration, RuntimeRegistryOptions, RuntimeState } from "./types.ts";

const DEFAULT_STALE_AFTER_MS = 15_000;

export interface RuntimeArtifactClient {
  /** Undefined means tmux could not be queried; reconciliation must not mutate it. */
  listManagedWindows(): Array<{ window: string; workspaceId: string }> | undefined;
  listParkingEditorPanes(): Array<{ pane: string; workspaceId: string }> | undefined;
  killWindow(window: string): void;
  killPane(pane: string): void;
  killParkingSession(): void;
}

/** Removes stale manager sockets and parked nvim panes after runtime reconciliation. */
export function reconcileRuntimeArtifacts(
  registry: WorkspaceRegistry,
  artifacts: RuntimeArtifactClient = new LocalRuntimeArtifactClient(),
): void {
  const activeWorkspaceIds = new Set(registry.listRuntimeRegistrations()
    .flatMap((registration) => registration.workspaceId ? [registration.workspaceId] : []));
  removeOrphanedSockets(registry.paths.runtimeDirectory, activeWorkspaceIds);

  const windows = artifacts.listManagedWindows();
  if (windows) {
    for (const window of windows) {
      if (!activeWorkspaceIds.has(window.workspaceId)) artifacts.killWindow(window.window);
    }
  }

  const panes = artifacts.listParkingEditorPanes();
  if (!panes) return;
  for (const pane of panes) {
    if (!activeWorkspaceIds.has(pane.workspaceId)) artifacts.killPane(pane.pane);
  }
  if (!panes.some((pane) => activeWorkspaceIds.has(pane.workspaceId))) artifacts.killParkingSession();
}

export class RuntimeRegistry {
  readonly #registry: WorkspaceRegistry;
  readonly #staleAfterMs: number;
  readonly #now: () => Date;
  readonly #isPidRunning: (pid: number) => boolean;
  readonly #isTmuxLocationRunning: (location: string) => boolean;

  constructor(registry: WorkspaceRegistry, options: RuntimeRegistryOptions = {}) {
    this.#registry = registry;
    this.#staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
    this.#now = options.now ?? (() => new Date());
    this.#isPidRunning = options.isPidRunning ?? isPidRunning;
    this.#isTmuxLocationRunning = options.isTmuxLocationRunning ?? isTmuxLocationRunning;
  }

  claim(input: Omit<RuntimeRegistration, "instanceId" | "heartbeatAt"> & { instanceId?: string }): RuntimeRegistration | undefined {
    this.reconcile();
    const registration: RuntimeRegistration = {
      ...input,
      instanceId: input.instanceId ?? randomUUID(),
      heartbeatAt: this.#now().toISOString(),
    };
    return this.#registry.claimRuntimeRegistration(registration, this.#staleBefore()) ? registration : undefined;
  }

  heartbeat(registration: RuntimeRegistration, agentState = registration.agentState): RuntimeRegistration | undefined {
    const next = { ...registration, agentState, heartbeatAt: this.#now().toISOString() };
    return this.#registry.refreshRuntimeRegistration(next) ? next : undefined;
  }

  release(registration: RuntimeRegistration): void {
    this.#registry.removeRuntimeRegistration(registration.sessionId, registration.instanceId);
  }

  reconcile(): void {
    const staleBefore = this.#now().getTime() - this.#staleAfterMs;
    for (const registration of this.#registry.listRuntimeRegistrations()) {
      if (Date.parse(registration.heartbeatAt) < staleBefore
        || !this.#isPidRunning(registration.pid)
        || (registration.tmuxLocation !== null && !this.#isTmuxLocationRunning(registration.tmuxLocation))) {
        this.#registry.removeRuntimeRegistration(registration.sessionId, registration.instanceId);
      }
    }
  }

  ownership(sessionId: string): RuntimeOwnership | { state: "cold" } {
    this.reconcile();
    const registration = this.#registry.getRuntimeRegistration(sessionId);
    if (!registration) return { state: "cold" };
    return {
      registration,
      state: registration.workspaceId === null ? "active-elsewhere" : "managed-warm",
    };
  }

  state(sessionId: string): RuntimeState {
    return this.ownership(sessionId).state;
  }

  #staleBefore(): string {
    return new Date(this.#now().getTime() - this.#staleAfterMs).toISOString();
  }
}

function removeOrphanedSockets(runtimeDirectory: string, activeWorkspaceIds: ReadonlySet<string>): void {
  try {
    for (const name of readdirSync(runtimeDirectory)) {
      const workspaceId = /^workspace-(.+)\.sock$/.exec(name)?.[1];
      if (!workspaceId || activeWorkspaceIds.has(workspaceId)) continue;
      const path = join(runtimeDirectory, name);
      if (lstatSync(path).isSocket()) unlinkSync(path);
    }
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
  }
}

class LocalRuntimeArtifactClient implements RuntimeArtifactClient {
  listManagedWindows(): Array<{ window: string; workspaceId: string }> | undefined {
    const rows = this.#list("list-windows", "pi", "#{window_id}\t#{@piw_workspace_id}");
    return rows?.flatMap(([window, workspaceId]) => window && workspaceId ? [{ window, workspaceId }] : []);
  }

  listParkingEditorPanes(): Array<{ pane: string; workspaceId: string }> | undefined {
    const rows = this.#list("list-panes", "piw-parking", "#{pane_id}\t#{@piw_nvim_workspace_id}");
    return rows?.flatMap(([pane, workspaceId]) => pane && workspaceId ? [{ pane, workspaceId }] : []);
  }

  killWindow(window: string): void {
    try { execFileSync("tmux", ["kill-window", "-t", window], { stdio: "ignore", timeout: 500 }); } catch { /* tmux changed during reconciliation */ }
  }

  killPane(pane: string): void {
    try { execFileSync("tmux", ["kill-pane", "-t", pane], { stdio: "ignore", timeout: 500 }); } catch { /* tmux changed during reconciliation */ }
  }

  killParkingSession(): void {
    try { execFileSync("tmux", ["kill-session", "-t", "piw-parking"], { stdio: "ignore", timeout: 500 }); } catch { /* no parking session remains */ }
  }

  #list(command: "list-windows" | "list-panes", target: string, format: string): string[][] | undefined {
    try {
      return execFileSync("tmux", [command, "-t", target, "-F", format], {
        encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 500,
      }).trim().split("\n").map((line) => line.split("\t"));
    } catch {
      return undefined;
    }
  }
}

function isPidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isTmuxLocationRunning(location: string): boolean {
  try {
    execFileSync("tmux", ["display-message", "-p", "-t", location, "#{pane_id}"], { stdio: "ignore", timeout: 500 });
    return true;
  } catch {
    return false;
  }
}
