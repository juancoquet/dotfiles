import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import test from "node:test";
import { bootstrapRoot, WorkspaceRegistry } from "../src/index.ts";

function paths() {
  const directory = mkdtempSync(join(tmpdir(), "piw-bootstrap-"));
  return { directory, paths: { stateDirectory: join(directory, "state"), databasePath: join(directory, "state", "state.db"), runtimeDirectory: join(directory, "runtime") } };
}

function dependencies(commands: string[], answers: Array<string | undefined>, failures: Array<"edit" | "retry" | "continue" | "cancel"> = []) {
  return {
    inspector: { inspect: (path: string) => ({ identity: "directory:repository", displayName: "repository" }) },
    prompt: { command: async (_defaultValue: string) => answers.shift(), failure: async (_command: string, _error: string) => failures.shift() ?? "cancel" },
    run(command: string) { commands.push(command); if (command === "fail") throw new Error("failed command"); },
    now: () => new Date("2026-01-01T00:00:00.000Z"),
    environment: () => ({ PATH: "/usr/bin" }),
  };
}

test("activates an existing venv without prompting", async () => {
  const fixture = paths();
  const root = join(fixture.directory, "root");
  mkdirSync(join(root, ".venv", "bin"), { recursive: true });
  const registry = WorkspaceRegistry.open({ paths: fixture.paths });
  const commands: string[] = [];
  const prepared = await bootstrapRoot(root, registry, { dependencies: dependencies(commands, ["must not prompt"]) });
  assert.equal(prepared?.environment.VIRTUAL_ENV, join(root, ".venv"));
  assert.equal(prepared?.environment.PATH, `${join(root, ".venv", "bin")}:/usr/bin`);
  assert.deepEqual(commands, []);
  assert.ok(registry.getRootByPath(root)?.initializedAt);
  registry.close();
});

test("remembers a successful repository command and initializes each exact root once", async () => {
  const fixture = paths();
  const first = join(fixture.directory, "first");
  const second = join(fixture.directory, "second");
  mkdirSync(first); mkdirSync(second);
  const registry = WorkspaceRegistry.open({ paths: fixture.paths });
  const commands: string[] = [];
  await bootstrapRoot(first, registry, { dependencies: dependencies(commands, ["npm install"]) });
  const prompts: string[] = [];
  const deps = dependencies(commands, ["npm install"]);
  deps.prompt.command = async (defaultValue: string) => { prompts.push(defaultValue); return ""; };
  await bootstrapRoot(second, registry, { dependencies: deps });
  await bootstrapRoot(second, registry, { dependencies: dependencies(commands, ["must not prompt"]) });
  assert.deepEqual(commands, ["npm install"]);
  assert.deepEqual(prompts, ["npm install"]);
  assert.ok(registry.getRootByPath(second)?.initializedAt);
  registry.close();
});

test("retry, edit, continue, and cancel have distinct durable outcomes", async () => {
  const fixture = paths();
  const registry = WorkspaceRegistry.open({ paths: fixture.paths });
  const commands: string[] = [];
  const retryRoot = join(fixture.directory, "retry"); mkdirSync(retryRoot);
  await bootstrapRoot(retryRoot, registry, { dependencies: dependencies(commands, ["fail"], ["retry", "continue"]) });
  assert.equal(commands.join(","), "fail,fail");
  assert.match(registry.getRootByPath(retryRoot)?.setupFailure ?? "", /failed command/);

  const editRoot = join(fixture.directory, "edit"); mkdirSync(editRoot);
  await bootstrapRoot(editRoot, registry, { dependencies: dependencies(commands, ["fail", "fixed"], ["edit"]) });
  assert.equal(registry.getRootByPath(editRoot)?.setupFailure, null);

  const cancelRoot = join(fixture.directory, "cancel"); mkdirSync(cancelRoot);
  assert.equal(await bootstrapRoot(cancelRoot, registry, { dependencies: dependencies(commands, ["fail"], ["cancel"]) }), undefined);
  assert.equal(registry.getRootByPath(cancelRoot)?.initializedAt, null);
  registry.close();
});

test("suggests detected setup without executing it until confirmed", async () => {
  const fixture = paths();
  const root = join(fixture.directory, "root"); mkdirSync(root);
  writeFileSync(join(root, "package.json"), "{}");
  const registry = WorkspaceRegistry.open({ paths: fixture.paths });
  const commands: string[] = []; const defaults: string[] = [];
  const deps = dependencies(commands, [""]);
  deps.prompt.command = async (defaultValue: string) => { defaults.push(defaultValue); return ""; };
  await bootstrapRoot(root, registry, { dependencies: deps });
  assert.deepEqual(defaults, ["npm install"]);
  assert.deepEqual(commands, []);
  registry.close();
});
