import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { extractExcerpts, fzfArguments, renderSessionPreview, WorkspaceRegistry } from "../src/index.ts";

function paths() {
  const directory = mkdtempSync(join(tmpdir(), "piw-preview-"));
  return { stateDirectory: join(directory, "state"), databasePath: join(directory, "state", "state.db"), runtimeDirectory: join(directory, "runtime") };
}

function seed(registry: WorkspaceRegistry): void {
  registry.upsertRepository({ id: "repository", identity: "git:/repo", displayName: "repo", sortRank: 1, setupCommand: null });
  registry.upsertRoot({ id: "root", repositoryId: "repository", path: "/repo", initializedAt: null, setupFailure: null });
  registry.upsertSession({ id: "parent", rootId: "root", sessionFile: "/sessions/parent", name: "Parent", firstMessage: null, parentSessionFile: null, parentSessionId: null, lastActivityAt: "2026-01-01", archived: false, unread: false, sortRank: 2 });
  registry.upsertSession({ id: "session", rootId: "root", sessionFile: "/sessions/session", name: "Name\u001b[31m", firstMessage: null, parentSessionFile: "/sessions/parent", parentSessionId: "parent", lastActivityAt: "2026-01-02", archived: false, unread: false, sortRank: 1 });
  registry.upsertSession({ id: "child", rootId: "root", sessionFile: "/sessions/child", name: "Child", firstMessage: null, parentSessionFile: "/sessions/session", parentSessionId: "session", lastActivityAt: "2026-01-03", archived: false, unread: false, sortRank: 1 });
}

test("renders sanitized Git, relationship, and recent session context", () => {
  const registry = WorkspaceRegistry.open({ paths: paths() });
  seed(registry);
  const preview = renderSessionPreview("session", registry, {
    inspectGit: () => ({ branch: "feature", worktreePath: "/repo", dirty: true }),
    readSessionTail: () => [
      { type: "message", message: { role: "user", content: [{ type: "text", text: "Inspect\u001b[2J this" }] } },
      { type: "message", message: { role: "assistant", content: [{ type: "text", text: "Done" }] } },
    ].map((entry) => JSON.stringify(entry)).join("\n"),
  });
  assert.match(preview, /Name: Name \[31m/);
  assert.match(preview, /Root: \/repo/);
  assert.match(preview, /Branch: feature/);
  assert.match(preview, /Worktree: \/repo/);
  assert.match(preview, /Git: dirty/);
  assert.match(preview, /Parent: Parent/);
  assert.match(preview, /Forks: Child/);
  assert.match(preview, /You: Inspect \[2J this/);
  assert.match(preview, /Pi: Done/);
  assert.ok(!preview.includes("\u001b"));
  registry.close();
});

test("keeps useful metadata when Git and session reads fail", () => {
  const registry = WorkspaceRegistry.open({ paths: paths() });
  seed(registry);
  const preview = renderSessionPreview("session", registry, {
    inspectGit: () => undefined,
    readSessionTail: () => undefined,
  });
  assert.match(preview, /Name: Name/);
  assert.match(preview, /Repository: unavailable/);
  assert.match(preview, /Recent conversation: unavailable/);
  registry.close();
});

test("extracts only recent user and assistant text from bounded JSONL", () => {
  const jsonl = [
    "not json",
    ...["one", "two", "three", "four", "five"].map((text, index) => JSON.stringify({ type: "message", message: { role: index % 2 ? "assistant" : "user", content: [{ type: "text", text }] } })),
  ].join("\n");
  assert.deepEqual(extractExcerpts(jsonl), [
    { role: "Pi", text: "two" }, { role: "You", text: "three" }, { role: "Pi", text: "four" }, { role: "You", text: "five" },
  ]);
});

test("configures a togglable preview and hides it by default on narrow terminals", () => {
  const wide = fzfArguments("picker", 120);
  const narrow = fzfArguments("picker", 80);
  assert.ok(wide.includes("--preview=picker --preview {2}"));
  assert.ok(wide.includes("--preview-window=right:50%:wrap"));
  assert.ok(narrow.includes("--preview-window=right:50%:wrap:hidden"));
  assert.ok(wide.some((argument) => argument.includes("ctrl-/:toggle-preview")));
});
