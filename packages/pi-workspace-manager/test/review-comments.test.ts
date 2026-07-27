import assert from "node:assert/strict";
import { mkdtempSync, statSync } from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { appendReviewComment, serveReviewComments, type ReviewComment } from "../src/index.ts";

const COMMENT: ReviewComment = {
  path: "src/example.ts", startLine: 4, endLine: 5, selectedText: "old line\nremoved line", side: "old", comment: "Explain this change.",
};

test("review comments preserve drafts and accumulate in one section", () => {
  const once = appendReviewComment("Keep this draft.", COMMENT);
  const twice = appendReviewComment(once, { ...COMMENT, startLine: 9, endLine: 9, side: "new", comment: "Add a test." });
  assert.match(twice, /^Keep this draft\./);
  assert.equal((twice.match(/Review comments:/g) ?? []).length, 1);
  assert.match(twice, /src\/example\.ts:4-5 \(old\)/);
  assert.match(twice, /old line\nremoved line/);
  assert.match(twice, /src\/example\.ts:9 \(new\)/);
});

test("workspace socket accepts valid comments and removes itself on close", async () => {
  const directory = mkdtempSync(join(tmpdir(), "piw-review-"));
  const received: ReviewComment[] = [];
  const socket = await serveReviewComments(directory, "workspace-1", (comment) => received.push(comment));
  assert.equal(statSync(socket.path).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(await request(socket.path, COMMENT)), { ok: true });
  assert.deepEqual(received, [COMMENT]);
  await socket.close();
  assert.throws(() => statSync(socket.path));
});

test("workspace socket rejects malformed comments without mutation", async () => {
  const directory = mkdtempSync(join(tmpdir(), "piw-review-"));
  const received: ReviewComment[] = [];
  const socket = await serveReviewComments(directory, "workspace-2", (comment) => received.push(comment));
  const response = JSON.parse(await request(socket.path, { ...COMMENT, path: "/outside/root" }));
  assert.equal(response.ok, false);
  assert.equal(received.length, 0);
  await socket.close();
});

function request(path: string, value: unknown): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(path);
    let response = "";
    socket.setEncoding("utf8");
    socket.once("error", reject);
    socket.on("data", (chunk) => { response += chunk; });
    socket.on("end", () => resolve(response));
    socket.on("connect", () => socket.write(`${JSON.stringify(value)}\n`));
  });
}
