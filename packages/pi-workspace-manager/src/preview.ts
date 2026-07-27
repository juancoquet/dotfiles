import { execFileSync } from "node:child_process";
import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { basename } from "node:path";
import { WorkspaceRegistry } from "./database.ts";
import type { PiSession, Root } from "./types.ts";

const MAX_SESSION_BYTES = 64 * 1024;
const EXCERPT_COUNT = 4;

export interface GitPreview {
  branch: string;
  worktreePath: string;
  dirty: boolean;
}

export interface SessionPreviewDependencies {
  inspectGit(root: string): GitPreview | undefined;
  readSessionTail(path: string): string | undefined;
}

/** Renders only selected-session context; fzf runs this outside its list reload. */
export function renderSessionPreview(
  sessionId: string,
  registry: WorkspaceRegistry,
  dependencies: SessionPreviewDependencies = defaultDependencies(),
): string {
  const session = registry.getSession(sessionId);
  if (!session) return "Session is no longer available.";
  const root = registry.getRoot(session.rootId);
  if (!root) return renderMissingRoot(session);

  const lines = [
    `Name: ${clean(session.name || session.firstMessage || "Untitled session")}`,
    `Root: ${clean(root.path)}`,
    `Last activity: ${clean(session.lastActivityAt || "Unknown")}`,
    ...renderGit(root, dependencies),
    ...renderRelationship(session, registry),
    ...renderExcerpts(session, dependencies),
  ];
  return `${lines.join("\n")}\n`;
}

export function previewSessionFromPicker(sessionId: string, registry = WorkspaceRegistry.open()): string {
  try {
    return renderSessionPreview(sessionId, registry);
  } finally {
    registry.close();
  }
}

function renderMissingRoot(session: PiSession): string {
  return [
    `Name: ${clean(session.name || session.firstMessage || "Untitled session")}`,
    "Root: unavailable",
    `Last activity: ${clean(session.lastActivityAt || "Unknown")}`,
    "Repository: unavailable",
    ...renderRelationship(session),
  ].join("\n") + "\n";
}

function renderGit(root: Root, dependencies: SessionPreviewDependencies): string[] {
  try {
    const git = dependencies.inspectGit(root.path);
    if (!git) return ["Repository: unavailable"];
    return [
      `Branch: ${clean(git.branch || "Detached HEAD")}`,
      `Worktree: ${clean(git.worktreePath)}`,
      `Git: ${git.dirty ? "dirty" : "clean"}`,
    ];
  } catch {
    return ["Repository: unavailable"];
  }
}

function renderRelationship(session: PiSession, registry?: WorkspaceRegistry): string[] {
  const parent = session.parentSessionId ? registry?.getSession(session.parentSessionId) : undefined;
  const parentLabel = parent ? parent.name || parent.firstMessage || parent.id : session.parentSessionFile ? basename(session.parentSessionFile) : undefined;
  const children = registry?.listSessions().filter((candidate) => candidate.parentSessionId === session.id) ?? [];
  return [
    `Parent: ${clean(parentLabel || "None")}`,
    `Forks: ${children.length ? children.map((child) => clean(child.name || child.firstMessage || child.id)).join(", ") : "None"}`,
  ];
}

function renderExcerpts(session: PiSession, dependencies: SessionPreviewDependencies): string[] {
  try {
    const tail = dependencies.readSessionTail(session.sessionFile);
    const excerpts = tail ? extractExcerpts(tail) : [];
    return excerpts.length ? ["", "Recent conversation:", ...excerpts.map(({ role, text }) => `${role}: ${text}`)] : ["", "Recent conversation: unavailable"];
  } catch {
    return ["", "Recent conversation: unavailable"];
  }
}

export function extractExcerpts(sessionJsonl: string): Array<{ role: "You" | "Pi"; text: string }> {
  const excerpts: Array<{ role: "You" | "Pi"; text: string }> = [];
  for (const line of sessionJsonl.split("\n")) {
    try {
      const entry: unknown = JSON.parse(line);
      if (!isMessageEntry(entry)) continue;
      const text = clean(entry.message.content.flatMap(extractText).join(" "));
      if (text) excerpts.push({ role: entry.message.role === "user" ? "You" : "Pi", text });
    } catch { /* A bounded tail can start within a JSON line. */ }
  }
  return excerpts.slice(-EXCERPT_COUNT);
}

function isMessageEntry(entry: unknown): entry is { type: "message"; message: { role: "user" | "assistant"; content: unknown[] } } {
  if (!entry || typeof entry !== "object") return false;
  const message = (entry as { message?: unknown }).message;
  return (entry as { type?: unknown }).type === "message" && !!message && typeof message === "object"
    && ((message as { role?: unknown }).role === "user" || (message as { role?: unknown }).role === "assistant")
    && Array.isArray((message as { content?: unknown }).content);
}

function extractText(content: unknown): string[] {
  if (!content || typeof content !== "object") return [];
  const text = (content as { text?: unknown }).text;
  return typeof text === "string" ? [text] : [];
}

function defaultDependencies(): SessionPreviewDependencies {
  return { inspectGit, readSessionTail };
}

function inspectGit(root: string): GitPreview | undefined {
  try {
    const worktreePath = execFileSync("git", ["-C", root, "rev-parse", "--show-toplevel"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const branch = execFileSync("git", ["-C", root, "branch", "--show-current"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    const dirty = execFileSync("git", ["-C", root, "status", "--porcelain"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim().length > 0;
    return { branch, worktreePath, dirty };
  } catch {
    return undefined;
  }
}

function readSessionTail(path: string): string | undefined {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, "r");
    const buffer = Buffer.alloc(MAX_SESSION_BYTES);
    const position = Math.max(0, fstatSync(descriptor).size - MAX_SESSION_BYTES);
    const bytes = readSync(descriptor, buffer, 0, buffer.length, position);
    return buffer.subarray(0, bytes).toString("utf8");
  } catch {
    return undefined;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function clean(value: string): string {
  return value.replace(/[\x00-\x1f\x7f-\x9f]/g, " ").replace(/\s+/g, " ").trim();
}
