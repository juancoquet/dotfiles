import { chmod, mkdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { createConnection, createServer, type Server, type Socket } from "node:net";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

type CodeComment = {
  version: 1;
  path: string;
  startLine: number;
  endLine: number;
  selectedContent: string;
  side?: "old" | "new";
  comment: string;
};

const MAX_REQUEST_BYTES = 64 * 1024;
const HEADING = "## Code comments";

function socketDirectory(): string {
  return join(homedir(), ".local", "state", "pi-comments");
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

function parseComment(line: string): { comment?: CodeComment; error?: string } {
  if (Buffer.byteLength(line) > MAX_REQUEST_BYTES) return { error: "Code comment is too large" };

  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return { error: "Code comment is not valid JSON" };
  }

  if (!value || typeof value !== "object") return { error: "Code comment must be an object" };
  const comment = value as Record<string, unknown>;
  if (comment.version !== 1) return { error: "Code comment has an unsupported version" };
  if (typeof comment.path !== "string" || !comment.path) return { error: "Code comment has no path" };
  if (!Number.isSafeInteger(comment.startLine) || (comment.startLine as number) < 1) {
    return { error: "Code comment has an invalid start line" };
  }
  if (!Number.isSafeInteger(comment.endLine) || (comment.endLine as number) < (comment.startLine as number)) {
    return { error: "Code comment has an invalid end line" };
  }
  if (typeof comment.selectedContent !== "string") return { error: "Code comment has invalid selected content" };
  if (typeof comment.comment !== "string" || !comment.comment.trim()) {
    return { error: "Code comment has no text" };
  }
  if (comment.side !== undefined && comment.side !== "old" && comment.side !== "new") {
    return { error: "Code comment has an invalid diff side" };
  }

  return { comment: comment as CodeComment };
}

function renderComment(comment: CodeComment): string {
  const range = comment.startLine === comment.endLine
    ? `${comment.path}:${comment.startLine}`
    : `${comment.path}:${comment.startLine}-${comment.endLine}`;
  const side = comment.side ? ` (${comment.side})` : "";
  const selected = comment.selectedContent
    ? `\n\nSelected content:\n\`\`\`\n${comment.selectedContent}\n\`\`\``
    : "";

  return `- **${range}**${side}\n\n  ${comment.comment}${selected}`;
}

function appendComment(ctx: ExtensionContext, comment: CodeComment): void {
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
  ctx.ui.notify(`Code comment added: ${comment.path}:${comment.startLine}`, "info");
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
  if (active) throw new Error("A Pi process already owns this code-comment socket");
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
        socket.end('{"ok":false,"error":"Code comment is too large"}\n');
        return;
      }
      if (!input.includes("\n")) return;

      handled = true;
      const parsed = parseComment(input.slice(0, input.indexOf("\n")));
      if (!parsed.comment) {
        socket.end(`${JSON.stringify({ ok: false, error: parsed.error })}\n`);
        return;
      }

      appendComment(ctx, parsed.comment);
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
      ctx.ui.notify(`Code comments unavailable: ${String(error)}`, "error");
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
