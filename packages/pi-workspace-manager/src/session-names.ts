import { execFileSync } from "node:child_process";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { WorkspaceRegistry } from "./database.ts";

export interface SessionNameStore {
  setSessionName(id: string, name: string | null): boolean;
}

export interface PiSessionNameWriter {
  set(sessionFile: string, name: string): void;
}

const piSessionNameWriter: PiSessionNameWriter = {
  set(sessionFile, name) {
    SessionManager.open(sessionFile).appendSessionInfo(name);
  },
};

/** Writes Pi's canonical session metadata, then mirrors it in the manager cache. */
export function renameSession(
  sessionId: string,
  name: string,
  registry: WorkspaceRegistry & SessionNameStore,
  writer: PiSessionNameWriter = piSessionNameWriter,
): boolean {
  const session = registry.getSession(sessionId);
  if (!session) return false;
  const normalized = name.replace(/[\r\n]+/g, " ").trim();
  writer.set(session.sessionFile, normalized);
  const renamed = registry.setSessionName(sessionId, normalized || null);
  if (renamed) updateWorkspaceWindow(registry, sessionId, normalized || session.firstMessage);
  return renamed;
}

function updateWorkspaceWindow(registry: WorkspaceRegistry, sessionId: string, name: string | null): void {
  const registration = registry.getRuntimeRegistration(sessionId);
  if (!registration?.workspaceId || !registration.tmuxLocation) return;
  const marker = registration.agentState === "running" ? "⠋" : "●";
  const label = name?.replace(/[\x00-\x1f\x7f-\x9f]/g, " ").replace(/\s+/g, " ").trim() || `workspace-${registration.workspaceId.slice(0, 8)}`;
  try {
    execFileSync("tmux", ["rename-window", "-t", registration.tmuxLocation, `${marker} ${label}`], { stdio: "ignore", timeout: 500 });
  } catch { /* tmux may exit while a rename is in progress */ }
}
