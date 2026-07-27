import assert from "node:assert/strict";
import test from "node:test";
import { ManagedSessionReplacement, type SessionReplacementDependencies } from "../src/index.ts";

function dependencies(overrides: Partial<SessionReplacementDependencies> = {}): SessionReplacementDependencies & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    showPicker(sessionId) { calls.push(`picker:${sessionId ?? ""}`); },
    createFork(source, entry, position) { calls.push(`fork:${source}:${entry}:${position}`); return "/sessions/fork.jsonl"; },
    async openSession(file) { calls.push(`open:${file}`); return true; },
    ...overrides,
  };
}

test("routes managed resume and new through the picker flows", () => {
  const deps = dependencies();
  const replacement = new ManagedSessionReplacement(deps);

  replacement.showResumePicker();
  replacement.showCreationFlow("source-session");

  assert.deepEqual(deps.calls, ["picker:", "picker:source-session"]);
});

test("creates a selected fork in a separate workspace without replacing its source", async () => {
  const deps = dependencies();
  const replacement = new ManagedSessionReplacement(deps);

  assert.equal(await replacement.createFork("/sessions/source.jsonl", "selected-entry", "before"), true);
  assert.deepEqual(deps.calls, [
    "fork:/sessions/source.jsonl:selected-entry:before",
    "open:/sessions/fork.jsonl",
  ]);
});

test("does not open a workspace when fork creation is cancelled or unavailable", async () => {
  const deps = dependencies({ createFork: () => undefined });
  const replacement = new ManagedSessionReplacement(deps);

  assert.equal(await replacement.createFork(undefined, "selected-entry", "before"), false);
  assert.equal(await replacement.createFork("/sessions/source.jsonl", "selected-entry", "at"), false);
  assert.deepEqual(deps.calls, []);
});
