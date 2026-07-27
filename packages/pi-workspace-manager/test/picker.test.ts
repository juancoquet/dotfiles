import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createWorkspaceFromPicker, directoryPickerArguments, fzfArguments, listWorkspacePicker, renameSessionFromPicker, reorderFromPicker, renderPickerHelp, renderWorkspacePicker, showWorkspacePicker, WorkspaceRegistry, type PickerProcess } from "../src/index.ts";

function paths() {
  const directory = mkdtempSync(join(tmpdir(), "piw-picker-"));
  return { stateDirectory: join(directory, "state"), databasePath: join(directory, "state", "state.db"), runtimeDirectory: join(directory, "runtime") };
}

function seed(registry: WorkspaceRegistry): void {
  registry.upsertRepository({ id: "one", identity: "git:/one", displayName: "one", sortRank: 2, setupCommand: null });
  registry.upsertRepository({ id: "two", identity: "directory:/two", displayName: "two", sortRank: 1, setupCommand: null });
  registry.upsertRoot({ id: "one-main", repositoryId: "one", path: "/one", initializedAt: null, setupFailure: null });
  registry.upsertRoot({ id: "one-worktree", repositoryId: "one", path: "/worktrees/one", initializedAt: null, setupFailure: null });
  registry.upsertRoot({ id: "two-root", repositoryId: "two", path: "/two", initializedAt: null, setupFailure: null });
  registry.upsertSession({ id: "first", rootId: "one-main", sessionFile: "/sessions/first", name: null, firstMessage: "first\nmessage", parentSessionFile: null, parentSessionId: null, lastActivityAt: "2026-01-02", archived: false, unread: false, sortRank: 2 });
  registry.upsertSession({ id: "second", rootId: "one-worktree", sessionFile: "/sessions/second", name: "Second", firstMessage: null, parentSessionFile: null, parentSessionId: null, lastActivityAt: "2026-01-03", archived: false, unread: false, sortRank: 1 });
  registry.upsertSession({ id: "third", rootId: "two-root", sessionFile: "/sessions/third", name: "Third", firstMessage: null, parentSessionFile: null, parentSessionId: null, lastActivityAt: null, archived: false, unread: false, sortRank: 1 });
}

test("renders repository groups and sessions in persisted order", () => {
  const registry = WorkspaceRegistry.open({ paths: paths() });
  seed(registry);
  assert.equal(renderWorkspacePicker(registry), [
    "── two ──",
    "  ○     [missing] /two  Third\tthird",
    "── one ──",
    "  ○     [missing] /worktrees/one  Second  2026-01-03\tsecond",
    "  ○     [missing] /one  first message  2026-01-02\tfirst",
    "",
  ].join("\n"));
  registry.close();
});

test("renders independent runtime and unread columns", () => {
  const registry = WorkspaceRegistry.open({ paths: paths() });
  seed(registry);
  assert.ok(registry.claimRuntimeRegistration({ sessionId: "second", instanceId: "second-runtime", pid: process.pid, cwd: "/worktrees/one", workspaceId: "workspace", tmuxLocation: null, agentState: "running", heartbeatAt: new Date().toISOString() }, "2000-01-01T00:00:00.000Z"));
  assert.ok(registry.claimRuntimeRegistration({ sessionId: "third", instanceId: "third-runtime", pid: process.pid, cwd: "/two", workspaceId: null, tmuxLocation: null, agentState: "idle", heartbeatAt: new Date().toISOString() }, "2000-01-01T00:00:00.000Z"));
  registry.setSessionUnread("first", true);
  const listing = renderWorkspacePicker(registry, 1);
  assert.match(listing, /○  󰂚  \[missing\] \/one/);
  assert.match(listing, /⠙     \[missing\] \/worktrees\/one/);
  assert.match(listing, /◌     \[missing\] \/two/);
  registry.close();
});

test("reorders sessions only within their group and reorders groups persistently", async () => {
  const statePaths = paths();
  const registry = WorkspaceRegistry.open({ paths: statePaths });
  seed(registry);
  registry.close();
  const dependencies = { openRegistry: () => WorkspaceRegistry.open({ paths: statePaths }), catalog: async () => {} };

  assert.equal(await reorderFromPicker("session", "first", "up", "", dependencies), "moved");
  let reopened = WorkspaceRegistry.open({ paths: statePaths });
  assert.equal(reopened.getSession("first")?.sortRank, 1);
  assert.equal(reopened.getSession("second")?.sortRank, 2);
  assert.equal(reopened.getSession("third")?.sortRank, 1);
  reopened.close();

  assert.equal(await reorderFromPicker("group", "first", "up", "", dependencies), "moved");
  reopened = WorkspaceRegistry.open({ paths: statePaths });
  assert.equal(reopened.getRepository("one")?.sortRank, 1);
  assert.equal(reopened.getRepository("two")?.sortRank, 2);
  const beforeFilteredMove = renderWorkspacePicker(reopened);
  reopened.close();

  assert.equal(await reorderFromPicker("session", "first", "down", "first", dependencies), "filtered");
  reopened = WorkspaceRegistry.open({ paths: statePaths });
  assert.equal(renderWorkspacePicker(reopened), beforeFilteredMove);
  reopened.close();
});

test("opens the selected session and ignores repository headers", async () => {
  const opened: string[] = [];
  await showWorkspacePicker({
    process: { run: () => "  ○  /one  One\tselected\n" },
    open: async (sessionId) => { opened.push(sessionId); },
  });
  await showWorkspacePicker({
    process: { run: () => "── repository ──\n" },
    open: async (sessionId) => { opened.push(sessionId); },
  });
  assert.deepEqual(opened, ["selected"]);
});

test("creates a fresh workspace in the highlighted session's exact root or another chosen directory", async () => {
  const registry = WorkspaceRegistry.open({ paths: paths() });
  seed(registry);
  const roots: string[] = [];
  const defaults: string[] = [];
  const dependencies = {
    openRegistry: () => registry,
    catalog: async () => {},
    chooseDirectory(defaultRoot: string) { defaults.push(defaultRoot); return "/outside/non-git"; },
    createWorkspace: async (root: string) => { roots.push(root); },
    cwd: () => "/current/workspace/root",
  };

  assert.equal(await createWorkspaceFromPicker("second", dependencies), true);
  assert.deepEqual(defaults, ["/worktrees/one"]);
  assert.deepEqual(roots, ["/outside/non-git"]);

  const cancelRegistry = WorkspaceRegistry.open({ paths: paths() });
  const cancelDependencies = {
    ...dependencies,
    openRegistry: () => cancelRegistry,
    chooseDirectory(defaultRoot: string) { defaults.push(defaultRoot); return undefined; },
    createWorkspace: async () => assert.fail("cancel must not launch Pi"),
  };
  assert.equal(await createWorkspaceFromPicker(undefined, cancelDependencies), false);
  assert.deepEqual(defaults, ["/worktrees/one", "/current/workspace/root"]);
  assert.deepEqual(roots, ["/outside/non-git"]);
});

test("dispatches root, existing-worktree, and managed-worktree creation targets", async () => {
  const statePaths = paths();
  const seeded = WorkspaceRegistry.open({ paths: statePaths });
  seed(seeded);
  seeded.close();
  const opened: string[] = [];
  const existing = await createWorkspaceFromPicker("first", {
    openRegistry: () => WorkspaceRegistry.open({ paths: statePaths }), catalog: async () => {}, chooseDirectory: () => assert.fail("directory picker must not run"),
    chooseTarget: () => ({ kind: "existing-worktree", path: "/worktrees/one" }),
    createWorkspace: async (root) => { opened.push(root); }, cwd: () => "/current",
  });
  assert.equal(existing, true);
  assert.deepEqual(opened, ["/worktrees/one"]);

  let managedRoot: string | undefined;
  const managed = await createWorkspaceFromPicker("first", {
    openRegistry: () => WorkspaceRegistry.open({ paths: statePaths }), catalog: async () => {}, chooseDirectory: () => assert.fail("directory picker must not run"),
    chooseTarget: () => ({ kind: "managed-worktree" }), createWorkspace: async () => assert.fail("launcher belongs to worktree flow"),
    createManagedWorktree: async (root) => { managedRoot = root; return { kind: "created" }; }, cwd: () => "/current",
  });
  assert.equal(managed, true);
  assert.equal(managedRoot, "/one");
});

test("renames selected and archived sessions without changing manager-owned state", async () => {
  const statePaths = paths();
  const registry = WorkspaceRegistry.open({ paths: statePaths });
  seed(registry);
  registry.setSessionArchived("second", true);
  registry.setSessionUnread("second", true);
  const writes: Array<[string, string]> = [];
  const dependencies = {
    openRegistry: () => registry,
    catalog: async () => {},
    promptName: () => "Renamed",
    rename: (id: string, name: string, target: WorkspaceRegistry) => {
      writes.push([id, name]);
      return target.setSessionName(id, name);
    },
  };
  assert.equal(await renameSessionFromPicker("second", dependencies), true);
  assert.deepEqual(writes, [["second", "Renamed"]]);
  const renamed = WorkspaceRegistry.open({ paths: statePaths });
  assert.equal(renamed.getSession("second")?.name, "Renamed");
  assert.equal(renamed.getSession("second")?.archived, true);
  assert.equal(renamed.getSession("second")?.unread, true);
  renamed.close();

  const cancelled = WorkspaceRegistry.open({ paths: statePaths });
  assert.equal(await renameSessionFromPicker("second", { ...dependencies, openRegistry: () => cancelled, promptName: () => undefined }), false);
  const unchanged = WorkspaceRegistry.open({ paths: statePaths });
  assert.equal(unchanged.getSession("second")?.name, "Renamed");
  unchanged.close();
});

test("renders picker help from the same actions bound in fzf", () => {
  const help = renderPickerHelp();
  const bindings = fzfArguments().find((argument) => argument.startsWith("--bind=")) ?? "";
  assert.match(help, /Ctrl\+N\s+Create a workspace/);
  assert.match(help, /Ctrl\+Alt\+X\s+Move a cold session to macOS Trash/);
  assert.match(bindings, /ctrl-n:execute\([^)]*--create \{2}\)\+abort/);
  assert.match(bindings, /ctrl-alt-x:execute\([^)]*--trash \{2}\)/);
});

test("shows loading while fzf reloads empty and catalog-error states without sorting", async () => {
  const calls: Array<{ input: string; arguments_: readonly string[] }> = [];
  const process: PickerProcess = { run: (input, arguments_) => { calls.push({ input, arguments_ }); return undefined; } };
  await showWorkspacePicker({ process, open: async () => assert.fail("no session was selected") });
  assert.match(calls[0]!.input, /Loading Pi sessions/);
  assert.ok(calls[0]!.arguments_.includes("--no-sort"));
  assert.ok(calls[0]!.arguments_.includes("--disabled"));
  assert.ok(calls[0]!.arguments_.some((argument) => argument.includes("start:reload(~/.local/bin/piw-picker --list $(( $(date +%s%N) / 100000000 )))+enable-search")));
  assert.ok(calls[0]!.arguments_.some((argument) => argument.includes("ctrl-r:execute(~/.local/bin/piw-picker --restore)+reload(")));
  assert.ok(calls[0]!.arguments_.some((argument) => argument.includes("ctrl-e:execute(~/.local/bin/piw-picker --rename {2})+reload(")));
  assert.ok(calls[0]!.arguments_.some((argument) => argument.includes("alt-j:execute(~/.local/bin/piw-picker --move-session {2} down {q})+reload(")));
  assert.ok(calls[0]!.arguments_.some((argument) => argument.includes("alt-J:execute(~/.local/bin/piw-picker --move-group {2} down {q})+reload(")));
  assert.ok(calls[0]!.arguments_.some((argument) => argument.includes("ctrl-w:execute(~/.local/bin/piw-picker --close {2})+abort")));
  assert.ok(calls[0]!.arguments_.some((argument) => argument.includes("ctrl-a:execute(~/.local/bin/piw-picker --archive {2})+reload(")));
  assert.ok(calls[0]!.arguments_.some((argument) => argument.includes("ctrl-alt-a:execute(~/.local/bin/piw-picker --archive-tree {2})+reload(")));
  assert.ok(calls[0]!.arguments_.some((argument) => argument.includes("ctrl-alt-x:execute(~/.local/bin/piw-picker --trash {2})+reload(")));
  assert.ok(calls[0]!.arguments_.some((argument) => argument.includes("ctrl-x:execute(~/.local/bin/piw-picker --cleanup-worktree {2})+reload(")));
  assert.ok(calls[0]!.arguments_.includes("--track-current"));
  assert.ok(calls[0]!.arguments_.some((argument) => argument.includes("ctrl-n:execute(~/.local/bin/piw-picker --create {2})+abort")));
  assert.deepEqual(directoryPickerArguments("/repo/src"), [
    "--disabled", "--print-query", "--query=/repo/src", "--prompt=Directory> ",
    "--header=Edit the exact directory path, then press Enter. Esc cancels.", "--bind=enter:accept",
  ]);

  const emptyRegistry = WorkspaceRegistry.open({ paths: paths() });
  assert.match(await listWorkspacePicker({ openRegistry: () => emptyRegistry, catalog: async () => {} }), /No Pi sessions yet/);
  const failedRegistry = WorkspaceRegistry.open({ paths: paths() });
  assert.match(await listWorkspacePicker({ openRegistry: () => failedRegistry, catalog: async () => { throw new Error("catalog unavailable"); } }), /Unable to load Pi sessions: catalog unavailable/);
  assert.deepEqual(fzfArguments(), calls[0]!.arguments_);
});
