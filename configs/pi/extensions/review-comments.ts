import { chmod, mkdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { createConnection, createServer, type Server, type Socket } from "node:net";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type ReviewComment = {
  version: 1;
  path: string;
  startLine: number;
  endLine: number;
  selectedContent: string;
  side?: "old" | "new";
  comment: string;
};

const MAX_REQUEST_BYTES = 64 * 1024;
const HEADING = "## Review comments";

function socketDirectory(): string {
  return join(homedir(), ".local", "state", "pi-review");
}

function tmuxSocket(): string | undefined {
  return process.env.TMUX?.split(",", 1)[0];
}

function socketPath(): string | undefined {
  const pane = process.env.TMUX_PANE;
  const tmux = tmuxSocket();
  if (!pane || !/^%\d+$/.test(pane) || !tmux) return undefined;

  const serverId = createHash("sha256").update(tmux).digest("hex").slice(0, 16);
  return join(socketDirectory(), `${serverId}-${process.getuid()}-${pane.slice(1)}.sock`);
}

function parseComment(line: string): ReviewComment | undefined {
  if (Buffer.byteLength(line) > MAX_REQUEST_BYTES) return undefined;

  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return undefined;
  }

  if (!value || typeof value !== "object") return undefined;
  const comment = value as Record<string, unknown>;
  if (
    comment.version !== 1 ||
    typeof comment.path !== "string" ||
    !comment.path ||
    typeof comment.startLine !== "number" ||
    !Number.isSafeInteger(comment.startLine) ||
    comment.startLine < 1 ||
    typeof comment.endLine !== "number" ||
    !Number.isSafeInteger(comment.endLine) ||
    comment.endLine < comment.startLine ||
    typeof comment.selectedContent !== "string" ||
    typeof comment.comment !== "string" ||
    !comment.comment.trim() ||
    (comment.side !== undefined && comment.side !== "old" && comment.side !== "new")
  ) {
    return undefined;
  }

  return comment as ReviewComment;
}

function renderComment(comment: ReviewComment): string {
  const range = comment.startLine === comment.endLine
    ? `${comment.path}:${comment.startLine}`
    : `${comment.path}:${comment.startLine}-${comment.endLine}`;
  const side = comment.side ? ` (${comment.side})` : "";
  const selected = comment.selectedContent
    ? `\n\nSelected content:\n\`\`\`\n${comment.selectedContent}\n\`\`\``
    : "";

  return `- **${range}**${side}\n\n  ${comment.comment}${selected}`;
}

function appendComment(ctx: ExtensionContext, comment: ReviewComment): void {
  const draft = ctx.ui.getEditorText();
  const entry = renderComment(comment);
  const sectionStart = draft.indexOf(HEADING);
  let text: string;
  if (sectionStart === -1) {
    text = [draft.trimEnd(), HEADING, entry].filter(Boolean).join("\n\n");
  } else {
    const nextSection = draft.indexOf("\n## ", sectionStart + HEADING.length);
    if (nextSection === -1) {
      text = `${draft.trimEnd()}\n\n${entry}`;
    } else {
      text = `${draft.slice(0, nextSection).trimEnd()}\n\n${entry}\n\n${draft.slice(nextSection).trimStart()}`;
    }
  }

  ctx.ui.setEditorText(text);
  ctx.ui.notify(`Review comment added: ${comment.path}:${comment.startLine}`, "info");
}

async function removeStaleSocket(path: string): Promise<void> {
  const active = await new Promise<boolean>((resolve, reject) => {
    const socket = createConnection(path);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "ECONNREFUSED" || error.code === "ENOENT") resolve(false);
      else reject(error);
    });
  });
  if (active) throw new Error("A Pi process already owns this review-comment socket");
  await rm(path, { force: true });
}

async function startServer(
  ctx: ExtensionContext,
  connections: Set<Socket>,
): Promise<{ server: Server; path: string } | undefined> {
  const path = socketPath();
  if (!path) return undefined;

  await mkdir(socketDirectory(), { recursive: true, mode: 0o700 });
  await chmod(socketDirectory(), 0o700);
  await removeStaleSocket(path);

  const server = createServer((socket) => {
    let input = "";
    let handled = false;
    connections.add(socket);
    socket.setEncoding("utf8");
    socket.setTimeout(5000, () => socket.destroy());
    socket.once("close", () => connections.delete(socket));
    socket.on("data", (chunk) => {
      if (handled) return;
      input += chunk;
      if (Buffer.byteLength(input) > MAX_REQUEST_BYTES) {
        handled = true;
        socket.end('{"ok":false,"error":"Review comment is too large"}\n');
        return;
      }
      if (!input.includes("\n")) return;

      handled = true;
      const comment = parseComment(input.slice(0, input.indexOf("\n")));
      if (!comment || ctx.mode !== "tui") {
        socket.end('{"ok":false,"error":"Review comments require an interactive Pi session"}\n');
        return;
      }

      appendComment(ctx, comment);
      socket.end('{"ok":true}\n');
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(path, () => {
      server.off("error", reject);
      resolve();
    });
  });
  await chmod(path, 0o600);
  return { server, path };
}

export default function (pi: ExtensionAPI) {
  let server: Server | undefined;
  let path: string | undefined;
  const connections = new Set<Socket>();

  pi.on("session_start", async (_event, ctx) => {
    try {
      const resource = await startServer(ctx, connections);
      server = resource?.server;
      path = resource?.path;
    } catch (error) {
      ctx.ui.notify(`Review comments unavailable: ${String(error)}`, "error");
    }
  });

  pi.on("session_shutdown", async () => {
    for (const socket of connections) socket.destroy();
    connections.clear();
    if (server) await new Promise<void>((resolve) => server?.close(() => resolve()));
    if (path) await rm(path, { force: true });
    server = undefined;
    path = undefined;
  });
}
