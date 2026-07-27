import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import workspaceManagerExtension from "../src/extension.ts";
import { resolveStatePaths, WorkspaceRegistry } from "../src/index.ts";

test("marks a background managed workspace unread when its agent settles", async () => {
  const stateHome = mkdtempSync(join(tmpdir(), "piw-extension-"));
  const previousStateHome = process.env.XDG_STATE_HOME;
  const previousWorkspaceId = process.env.PIW_WORKSPACE_ID;
  const previousTmux = process.env.TMUX;
  process.env.XDG_STATE_HOME = stateHome;
  process.env.PIW_WORKSPACE_ID = "workspace";
  delete process.env.TMUX;
  const handlers = new Map<string, (event: unknown, context: never) => void | Promise<void>>();
  const context = { cwd: "/background-root", isIdle: () => true, sessionManager: { getSessionId: () => "background-session" }, ui: { notify: () => undefined }, shutdown: () => assert.fail("workspace must be claimed") } as never;
  try {
    const paths = resolveStatePaths({ ...process.env, XDG_STATE_HOME: stateHome });
    const registry = WorkspaceRegistry.open({ paths });
    registry.upsertRepository({ id: "repo", identity: "directory:/background-root", displayName: "background-root", sortRank: 1, setupCommand: null });
    registry.upsertRoot({ id: "root", repositoryId: "repo", path: "/background-root", initializedAt: null, setupFailure: null });
    registry.upsertSession({ id: "background-session", rootId: "root", sessionFile: "/sessions/background.jsonl", name: null, firstMessage: null, parentSessionFile: null, parentSessionId: null, lastActivityAt: null, archived: false, unread: false, sortRank: 1 });
    registry.close();
    workspaceManagerExtension({ on: (event: string, handler: (event: unknown, context: never) => void | Promise<void>) => handlers.set(event, handler) } as never);
    await handlers.get("session_start")!({}, context);
    await handlers.get("agent_settled")!({}, context);
    const reopened = WorkspaceRegistry.open({ paths });
    assert.equal(reopened.getSession("background-session")?.unread, true);
    reopened.close();
  } finally {
    await handlers.get("session_shutdown")?.({}, context);
    if (previousStateHome === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = previousStateHome;
    if (previousWorkspaceId === undefined) delete process.env.PIW_WORKSPACE_ID;
    else process.env.PIW_WORKSPACE_ID = previousWorkspaceId;
    if (previousTmux === undefined) delete process.env.TMUX;
    else process.env.TMUX = previousTmux;
  }
});

test("mirrors /name changes, including clearing a name, without restarting Pi", async () => {
  const stateHome = mkdtempSync(join(tmpdir(), "piw-extension-"));
  const previousStateHome = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = stateHome;
  const handlers = new Map<string, (event: unknown, context: never) => void | Promise<void>>();
  const paths = resolveStatePaths({ ...process.env, XDG_STATE_HOME: stateHome });
  const context = { cwd: "/named-root", isIdle: () => true, sessionManager: { getSessionId: () => "named-session", getSessionName: () => "Old name" }, ui: { notify: () => undefined }, shutdown: () => assert.fail("workspace must be claimed") } as never;
  try {
    const registry = WorkspaceRegistry.open({ paths });
    registry.upsertRepository({ id: "repo", identity: "directory:/named-root", displayName: "named-root", sortRank: 1, setupCommand: null });
    registry.upsertRoot({ id: "root", repositoryId: "repo", path: "/named-root", initializedAt: null, setupFailure: null });
    registry.upsertSession({ id: "named-session", rootId: "root", sessionFile: "/sessions/named.jsonl", name: "Old name", firstMessage: "First message", parentSessionFile: null, parentSessionId: null, lastActivityAt: null, archived: false, unread: false, sortRank: 1 });
    registry.close();
    workspaceManagerExtension({ on: (event: string, handler: (event: unknown, context: never) => void | Promise<void>) => handlers.set(event, handler) } as never);
    await handlers.get("session_start")!({}, context);
    await handlers.get("session_info_changed")!({ name: "New name" }, context);
    let reopened = WorkspaceRegistry.open({ paths });
    assert.equal(reopened.getSession("named-session")?.name, "New name");
    reopened.close();
    await handlers.get("session_info_changed")!({ name: undefined }, context);
    reopened = WorkspaceRegistry.open({ paths });
    assert.equal(reopened.getSession("named-session")?.name, null);
    reopened.close();
  } finally {
    await handlers.get("session_shutdown")?.({}, context);
    if (previousStateHome === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = previousStateHome;
  }
});

test("registers a fresh Pi session before its JSONL file exists and removes it on shutdown", async () => {
  const stateHome = mkdtempSync(join(tmpdir(), "piw-extension-"));
  const previousStateHome = process.env.XDG_STATE_HOME;
  process.env.XDG_STATE_HOME = stateHome;
  const handlers = new Map<string, (event: unknown, context: never) => void | Promise<void>>();
  try {
    workspaceManagerExtension({ on: (event: string, handler: (event: unknown, context: never) => void | Promise<void>) => handlers.set(event, handler) } as never);
    const context = {
      cwd: "/fresh-root",
      isIdle: () => true,
      sessionManager: { getSessionId: () => "fresh-session" },
      ui: { notify: () => undefined },
      shutdown: () => assert.fail("fresh session must be claimed"),
    } as never;
    await handlers.get("session_start")!({}, context);

    const registry = WorkspaceRegistry.open({ paths: resolveStatePaths({ ...process.env, XDG_STATE_HOME: stateHome }) });
    const registration = registry.getRuntimeRegistration("fresh-session");
    assert.equal(registration?.sessionId, "fresh-session");
    assert.equal(registration?.pid, process.pid);
    assert.equal(registration?.cwd, "/fresh-root");
    assert.equal(registration?.workspaceId, null);
    assert.equal(registration?.agentState, "idle");
    assert.ok(registration?.instanceId);
    assert.ok(registration?.heartbeatAt);
    registry.close();
    await handlers.get("session_shutdown")!({}, context);

    const reopened = WorkspaceRegistry.open({ paths: resolveStatePaths({ ...process.env, XDG_STATE_HOME: stateHome }) });
    assert.equal(reopened.getRuntimeRegistration("fresh-session"), undefined);
    reopened.close();
  } finally {
    if (previousStateHome === undefined) delete process.env.XDG_STATE_HOME;
    else process.env.XDG_STATE_HOME = previousStateHome;
  }
});
