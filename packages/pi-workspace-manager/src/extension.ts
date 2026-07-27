import { execFileSync } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { catalogSessions } from "./catalog.ts";
import { WorkspaceRegistry } from "./database.ts";
import { RuntimeRegistry } from "./runtime.ts";
import { appendReviewComment, serveReviewComments, type ReviewCommentSocket } from "./review-comments.ts";
import { ManagedSessionReplacement } from "./session-replacement.ts";
import type { RuntimeRegistration } from "./types.ts";

const HEARTBEAT_INTERVAL_MS = 5_000;

/** Publishes Pi process ownership for both raw Pi and managed workspaces. */
export default function workspaceManagerExtension(pi: ExtensionAPI): void {
  let registry: WorkspaceRegistry | undefined;
  let runtime: RuntimeRegistry | undefined;
  let registration: RuntimeRegistration | undefined;
  let heartbeat: NodeJS.Timeout | undefined;
  let reviewSocket: ReviewCommentSocket | undefined;
  const replacements = new ManagedSessionReplacement();

  async function clearRuntime(): Promise<void> {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = undefined;
    if (registration && runtime) runtime.release(registration);
    registration = undefined;
    runtime = undefined;
    registry?.close();
    registry = undefined;
    if (reviewSocket) await reviewSocket.close();
    reviewSocket = undefined;
  }

  function refresh(agentState: RuntimeRegistration["agentState"], name?: string, synchronizeName = false): void {
    if (!runtime || !registration) return;
    registration = runtime.heartbeat({ ...registration, tmuxLocation: currentTmuxLocation() }, agentState);
    if (!registration) {
      void clearRuntime();
      return;
    }
    if (synchronizeName) registry?.setSessionName(registration.sessionId, name || null);
    const session = registry?.getSession(registration.sessionId);
    updateWindowLabel(registration, session?.name ?? session?.firstMessage ?? null);
  }

  function markBackgroundCompletionUnread(): void {
    if (!registry || !registration?.workspaceId || isWorkspaceVisible(registration)) return;
    registry.setSessionUnread(registration.sessionId, true);
    updateWindowLabel(registration, registry.getSession(registration.sessionId)?.name ?? null, true);
  }

  pi.on("session_start", async (_event, ctx) => {
    await clearRuntime();
    registry = WorkspaceRegistry.open();
    await catalogSessions(registry);
    const sessionId = ctx.sessionManager.getSessionId();
    runtime = new RuntimeRegistry(registry);
    registration = runtime.claim({
      sessionId,
      ...(process.env.PIW_RUNTIME_INSTANCE_ID ? { instanceId: process.env.PIW_RUNTIME_INSTANCE_ID } : {}),
      pid: process.pid,
      cwd: ctx.cwd,
      workspaceId: process.env.PIW_WORKSPACE_ID ?? null,
      tmuxLocation: currentTmuxLocation(),
      agentState: ctx.isIdle() ? "idle" : "running",
    });
    if (!registration) {
      ctx.ui.notify("This Pi session is already active elsewhere.", "error");
      ctx.shutdown();
      await clearRuntime();
      return;
    }
    if (registration.workspaceId) {
      reviewSocket = await serveReviewComments(registry.paths.runtimeDirectory, registration.workspaceId, (comment) => {
        ctx.ui.setEditorText(appendReviewComment(ctx.ui.getEditorText(), comment));
      });
    }
    heartbeat = setInterval(() => refresh(ctx.isIdle() ? "idle" : "running"), HEARTBEAT_INTERVAL_MS);
    heartbeat.unref();
  });

  pi.on("session_before_switch", (event, ctx) => {
    if (!process.env.PIW_WORKSPACE_ID) return;
    if (event.reason === "resume") replacements.showResumePicker();
    else replacements.showCreationFlow(ctx.sessionManager.getSessionId());
    return { cancel: true };
  });
  pi.on("session_before_fork", async (event, ctx) => {
    if (!process.env.PIW_WORKSPACE_ID) return;
    try {
      const created = await replacements.createFork(ctx.sessionManager.getSessionFile(), event.entryId, event.position);
      if (!created) ctx.ui.notify("Could not create a managed fork; the current workspace is unchanged.", "error");
    } catch (error) {
      ctx.ui.notify(`Could not create a managed fork: ${error instanceof Error ? error.message : String(error)}`, "error");
    }
    return { cancel: true };
  });

  pi.on("session_info_changed", (event) => refresh(registration?.agentState ?? "idle", event.name, true));
  pi.on("agent_start", () => refresh("running"));
  pi.on("agent_settled", () => {
    refresh("idle");
    markBackgroundCompletionUnread();
  });
  pi.on("session_shutdown", async () => clearRuntime());
}

function isWorkspaceVisible(registration: RuntimeRegistration): boolean {
  return registration.tmuxLocation !== null && registration.tmuxLocation === currentTmuxLocation();
}

function updateWindowLabel(registration: RuntimeRegistration, name: string | null, unread = false): void {
  if (!registration.workspaceId || !registration.tmuxLocation) return;
  const marker = registration.agentState === "running" ? "⠋" : "●";
  const label = name?.replace(/[\x00-\x1f\x7f-\x9f]/g, " ").replace(/\s+/g, " ").trim() || `workspace-${registration.workspaceId.slice(0, 8)}`;
  try {
    execFileSync("tmux", ["rename-window", "-t", registration.tmuxLocation, `${marker}${unread ? " 󰂚" : ""} ${label}`], { stdio: "ignore", timeout: 500 });
  } catch { /* tmux may have exited between heartbeat and rename */ }
}

function currentTmuxLocation(): string | null {
  if (!process.env.TMUX) return null;
  try {
    const location = execFileSync("tmux", ["display-message", "-p", "#{session_name}:#{pane_id}"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"], timeout: 500,
    }).trim();
    return location || null;
  } catch {
    return null;
  }
}
