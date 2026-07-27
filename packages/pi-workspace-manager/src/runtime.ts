import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { WorkspaceRegistry } from "./database.ts";
import type { RuntimeOwnership, RuntimeRegistration, RuntimeRegistryOptions, RuntimeState } from "./types.ts";

const DEFAULT_STALE_AFTER_MS = 15_000;

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
