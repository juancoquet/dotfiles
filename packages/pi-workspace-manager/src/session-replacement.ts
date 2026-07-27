import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { catalogSessions } from "./catalog.ts";
import { WorkspaceRegistry } from "./database.ts";
import { openWorkspace } from "./launcher.ts";

export interface SessionReplacementDependencies {
  showPicker(sessionId?: string): void;
  createFork(sourceSessionFile: string, entryId: string, position: "before" | "at"): string | undefined;
  openSession(sessionFile: string): Promise<boolean>;
}

/** Routes managed replacement flows to new workspaces, leaving the source runtime intact. */
export class ManagedSessionReplacement {
  private readonly dependencies: SessionReplacementDependencies;

  constructor(dependencies: SessionReplacementDependencies = defaultDependencies()) {
    this.dependencies = dependencies;
  }

  showResumePicker(): void {
    this.dependencies.showPicker();
  }

  showCreationFlow(sessionId: string): void {
    this.dependencies.showPicker(sessionId);
  }

  async createFork(sourceSessionFile: string | undefined, entryId: string, position: "before" | "at"): Promise<boolean> {
    if (!sourceSessionFile) return false;
    const sessionFile = this.dependencies.createFork(sourceSessionFile, entryId, position);
    return Boolean(sessionFile && await this.dependencies.openSession(sessionFile));
  }
}

function createEmptyChildSession(parentSession: string, cwd: string, sessionDirectory: string): string | undefined {
  const session = SessionManager.create(cwd, sessionDirectory);
  session.newSession({ parentSession });
  return persistFork(session, session.getSessionFile());
}

/** Pi defers writing sessions without an assistant reply; the new process needs its header now. */
function persistFork(session: SessionManager, sessionFile: string | undefined): string | undefined {
  if (!sessionFile || existsSync(sessionFile)) return sessionFile;
  const header = session.getHeader();
  if (!header) return undefined;
  writeFileSync(sessionFile, `${JSON.stringify(header)}\n`, { mode: 0o600 });
  return sessionFile;
}

function defaultDependencies(): SessionReplacementDependencies {
  return {
    showPicker(sessionId) {
      const args = ["display-popup", "-E", "-w", "80%", "-h", "80%", "piw-picker"];
      if (sessionId) args.push("--create", sessionId);
      const child = spawn("tmux", args, { detached: true, stdio: "ignore" });
      child.unref();
    },
    createFork(sourceSessionFile, entryId, position) {
      // Open a second manager: createBranchedSession mutates its manager instance.
      const source = SessionManager.open(sourceSessionFile);
      const entry = source.getEntry(entryId);
      if (!entry) throw new Error("Invalid entry ID for forking");
      if (position === "before") {
        if (entry.type !== "message" || entry.message.role !== "user") throw new Error("Invalid entry ID for forking");
        if (!entry.parentId) return createEmptyChildSession(sourceSessionFile, source.getCwd(), source.getSessionDir());
        return persistFork(source, source.createBranchedSession(entry.parentId));
      }
      return persistFork(source, source.createBranchedSession(entry.id));
    },
    async openSession(sessionFile) {
      const registry = WorkspaceRegistry.open();
      try {
        await catalogSessions(registry);
        const session = registry.listSessions().find((candidate) => candidate.sessionFile === sessionFile);
        if (!session) return false;
        const result = await openWorkspace(session.id);
        return result === "imported-cold-session" || result === "opened-warm-workspace";
      } finally {
        registry.close();
      }
    },
  };
}
