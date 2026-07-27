import { chmodSync, unlinkSync } from "node:fs";
import { createServer, type Server } from "node:net";
import { join } from "node:path";

const MAX_REQUEST_BYTES = 1_000_000;

export interface ReviewComment {
  path: string;
  startLine: number;
  endLine: number;
  selectedText: string;
  side: "old" | "new" | null;
  comment: string;
}

export interface ReviewCommentSocket {
  path: string;
  close(): Promise<void>;
}

/** Serves one managed workspace's nvim review comments over a private Unix socket. */
export async function serveReviewComments(
  runtimeDirectory: string,
  workspaceId: string,
  append: (comment: ReviewComment) => void,
): Promise<ReviewCommentSocket> {
  const path = join(runtimeDirectory, `workspace-${workspaceId}.sock`);
  removeSocket(path);
  const server = createServer((socket) => {
    let request = "";
    let handled = false;
    const handle = (): void => {
      if (handled) return;
      handled = true;
      try {
        append(parseReviewComment(request.trim()));
        socket.end('{"ok":true}\n');
      } catch (error) {
        const message = error instanceof Error ? error.message : "Invalid review comment";
        socket.end(`${JSON.stringify({ ok: false, error: message })}\n`);
      }
    };
    socket.setEncoding("utf8");
    socket.on("data", (chunk: string) => {
      request += chunk;
      if (Buffer.byteLength(request) > MAX_REQUEST_BYTES) socket.destroy(new Error("Review comment is too large"));
      else if (request.endsWith("\n")) handle();
    });
    socket.on("end", handle);
  });
  await listen(server, path);
  chmodSync(path, 0o600);
  return {
    path,
    async close(): Promise<void> {
      await close(server);
      removeSocket(path);
    },
  };
}

export function appendReviewComment(draft: string, comment: ReviewComment): string {
  const hasReviewSection = draft.startsWith("Review comments:\n") || draft.includes("\n\nReview comments:\n");
  if (hasReviewSection) return `${draft.endsWith("\n") ? draft : `${draft}\n`}${renderReviewComment(comment)}`;
  const heading = draft.length === 0 ? "Review comments:\n" : "\n\nReview comments:\n";
  return `${draft}${heading}\n${renderReviewComment(comment)}`;
}

export function renderReviewComment(comment: ReviewComment): string {
  const location = comment.startLine === comment.endLine
    ? `${comment.path}:${comment.startLine}`
    : `${comment.path}:${comment.startLine}-${comment.endLine}`;
  const side = comment.side ? ` (${comment.side})` : "";
  return `- ${location}${side}\n  Selected:\n  \`\`\`\n${comment.selectedText}\n  \`\`\`\n  Comment:\n  ${comment.comment.split("\n").join("\n  ")}\n`;
}

function parseReviewComment(input: string): ReviewComment {
  let value: unknown;
  try { value = JSON.parse(input); } catch { throw new Error("Invalid review comment payload"); }
  if (!isRecord(value) || typeof value.path !== "string" || typeof value.startLine !== "number" || typeof value.endLine !== "number"
    || typeof value.selectedText !== "string" || typeof value.comment !== "string"
    || (value.side !== "old" && value.side !== "new" && value.side !== null)) throw new Error("Invalid review comment payload");
  if (value.path.length === 0 || value.path.startsWith("/") || value.path.includes("\0")
    || !Number.isInteger(value.startLine) || !Number.isInteger(value.endLine) || value.startLine < 1 || value.endLine < value.startLine
    || value.comment.trim().length === 0) throw new Error("Invalid review comment payload");
  return {
    path: value.path,
    startLine: value.startLine,
    endLine: value.endLine,
    selectedText: value.selectedText,
    side: value.side,
    comment: value.comment,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function removeSocket(path: string): void {
  try { unlinkSync(path); } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
  }
}

function listen(server: Server, path: string): Promise<void> {
  return new Promise((resolve, reject) => server.once("error", reject).listen(path, () => {
    server.off("error", reject);
    resolve();
  }));
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
