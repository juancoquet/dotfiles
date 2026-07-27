import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { catalogDiscoveredSessions, WorkspaceRegistry } from "../src/index.ts";
import type { CatalogGroup, RootInspector } from "../src/index.ts";
import type { SessionInfo } from "@earendil-works/pi-coding-agent";

function paths() {
  const directory = mkdtempSync(join(tmpdir(), "piw-catalog-"));
  return { stateDirectory: join(directory, "state"), databasePath: join(directory, "state", "state.db"), runtimeDirectory: join(directory, "runtime") };
}

function session(id: string, cwd: string, modified: string, options: Partial<SessionInfo> = {}): SessionInfo {
  return {
    id,
    path: `/sessions/${id}.jsonl`,
    cwd,
    created: new Date("2026-01-01T00:00:00.000Z"),
    modified: new Date(modified),
    messageCount: 1,
    firstMessage: `first ${id}`,
    allMessagesText: `first ${id}`,
    ...options,
  };
}

class StubInspector implements RootInspector {
  inspect(path: string): CatalogGroup {
    if (path.startsWith("/project")) return { identity: "git:/project/.git", displayName: "project" };
    return { identity: `directory:${path}`, displayName: path.split("/").at(-1) ?? path };
  }
}

test("catalogs raw sessions with exact roots, Git grouping, relationships, and stable order", () => {
  const registry = WorkspaceRegistry.open({ paths: paths() });
  const sessions = [
    session("parent", "/project/src", "2026-01-02T00:00:00.000Z"),
    session("child", "/project-worktree", "2026-01-03T00:00:00.000Z", { name: "Review", parentSessionPath: "/sessions/parent.jsonl" }),
    session("same-root", "/project/src", "2026-01-04T00:00:00.000Z"),
    session("outside", "/missing/path", "2026-01-05T00:00:00.000Z"),
    session("legacy", "", "2026-01-06T00:00:00.000Z"),
    { ...session("malformed", "/project", "2026-01-07T00:00:00.000Z"), id: undefined } as unknown as SessionInfo,
  ];

  assert.deepEqual(catalogDiscoveredSessions(registry, sessions, new StubInspector()), { discovered: 4, skipped: 2 });

  const parent = registry.getSession("parent")!;
  const child = registry.getSession("child")!;
  const sameRoot = registry.getSession("same-root")!;
  const outside = registry.getSession("outside")!;
  assert.equal(parent.rootId, sameRoot.rootId);
  assert.notEqual(parent.rootId, child.rootId);
  assert.equal(child.parentSessionFile, "/sessions/parent.jsonl");
  assert.equal(child.parentSessionId, "parent");
  assert.equal(child.name, "Review");
  assert.equal(parent.firstMessage, "first parent");
  assert.equal(parent.lastActivityAt, "2026-01-02T00:00:00.000Z");
  assert.equal(registry.getRoot(parent.rootId)!.path, "/project/src");
  assert.equal(registry.getRepository(registry.getRoot(parent.rootId)!.repositoryId!)!.identity, "git:/project/.git");
  assert.equal(registry.getRepository(registry.getRoot(child.rootId)!.repositoryId!)!.identity, "git:/project/.git");
  assert.equal(registry.getRepository(registry.getRoot(outside.rootId)!.repositoryId!)!.identity, "directory:/missing/path");
  assert.deepEqual(
    registry.listSessions().filter(({ id }) => id !== "outside").map(({ id }) => id),
    ["same-root", "child", "parent"],
  );

  registry.upsertSession({ ...child, archived: true, unread: true, sortRank: 77 });
  const refreshed = session("child", "/project-worktree", "2026-02-01T00:00:00.000Z", { name: "Renamed", parentSessionPath: "/sessions/not-cataloged.jsonl" });
  assert.deepEqual(catalogDiscoveredSessions(registry, [...sessions.slice(0, 1), refreshed], new StubInspector()), { discovered: 2, skipped: 0 });
  assert.deepEqual(registry.getSession("child"), {
    ...child,
    name: "Renamed",
    parentSessionFile: "/sessions/not-cataloged.jsonl",
    parentSessionId: null,
    lastActivityAt: "2026-02-01T00:00:00.000Z",
    archived: true,
    unread: true,
    sortRank: 77,
  });
  registry.close();
});
