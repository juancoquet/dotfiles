import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { basename, resolve } from "node:path";
import { SessionManager, type SessionInfo } from "@earendil-works/pi-coding-agent";
import { WorkspaceRegistry } from "./database.ts";
import type { PiSession, Repository, Root } from "./types.ts";

export interface SessionCatalogSource {
  listAll(): Promise<readonly SessionInfo[]>;
}

export interface RootInspector {
  inspect(path: string): CatalogGroup;
}

export interface CatalogGroup {
  identity: string;
  displayName: string;
}

export interface CatalogResult {
  discovered: number;
  skipped: number;
}

const piSessions: SessionCatalogSource = { listAll: () => SessionManager.listAll() };

export function catalogSessions(
  registry: WorkspaceRegistry,
  source: SessionCatalogSource = piSessions,
  inspector: RootInspector = new GitRootInspector(),
): Promise<CatalogResult> {
  return source.listAll().then((sessions) => catalogDiscoveredSessions(registry, sessions, inspector));
}

export function catalogDiscoveredSessions(
  registry: WorkspaceRegistry,
  sessions: readonly SessionInfo[],
  inspector: RootInspector,
): CatalogResult {
  const knownSessions = new Map(registry.listSessions().map((session) => [session.id, session]));
  const groups = new Map<string, CatalogGroup>();
  // Process older sessions first: each new rank precedes known ranks, leaving
  // the most recent first-run discovery at the top.
  const discoveries = sessions
    .slice()
    .sort((left, right) => activityTimestamp(left) - activityTimestamp(right));
  let skipped = 0;

  for (const session of discoveries) {
    if (!isCatalogable(session)) {
      skipped += 1;
      continue;
    }
    try {
      const rootPath = session.cwd;
      const group = groups.get(rootPath) ?? inspector.inspect(rootPath);
      groups.set(rootPath, group);
      const repositoryId = idFor("repository", group.identity);
      const rootId = idFor("root", rootPath);
      const existing = knownSessions.get(session.id);
      const repository = registry.getRepository(repositoryId);
      const root = registry.getRoot(rootId);
      registry.upsertRepository({
        id: repositoryId,
        identity: group.identity,
        displayName: group.displayName,
        sortRank: repository?.sortRank ?? registry.nextRepositoryRank(),
        setupCommand: repository?.setupCommand ?? null,
      });
      registry.upsertRoot({
        id: rootId, repositoryId, path: rootPath,
        initializedAt: root?.initializedAt ?? null, setupFailure: root?.setupFailure ?? null,
      });
      registry.upsertSession({
        id: session.id,
        rootId,
        sessionFile: session.path,
        name: session.name ?? null,
        firstMessage: session.firstMessage,
        parentSessionFile: session.parentSessionPath ?? null,
        parentSessionId: session.parentSessionPath ? sessionIdFromPath(sessions, session.parentSessionPath) : null,
        lastActivityAt: session.modified.toISOString(),
        archived: existing?.archived ?? false,
        unread: existing?.unread ?? false,
        sortRank: existing?.sortRank ?? registry.nextSessionRank(repositoryId),
      });
    } catch {
      skipped += 1;
    }
  }
  return { discovered: discoveries.length - skipped, skipped };
}

export class GitRootInspector implements RootInspector {
  inspect(rootPath: string): CatalogGroup {
    try {
      const [commonDirectory, worktreeTopLevel] = execFileSync(
        "git",
        ["-C", rootPath, "rev-parse", "--path-format=absolute", "--git-common-dir", "--show-toplevel"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      ).trim().split("\n");
      if (!commonDirectory || !worktreeTopLevel) throw new Error("incomplete Git identity");
      return {
        identity: `git:${resolve(commonDirectory)}`,
        displayName: basename(worktreeTopLevel),
      };
    } catch {
      return { identity: `directory:${rootPath}`, displayName: basename(rootPath) || rootPath };
    }
  }
}

function isCatalogable(session: SessionInfo): boolean {
  return typeof session.id === "string" && session.id.length > 0
    && typeof session.path === "string" && session.path.length > 0
    && typeof session.cwd === "string" && session.cwd.length > 0
    && typeof session.firstMessage === "string"
    && (session.name === undefined || typeof session.name === "string")
    && (session.parentSessionPath === undefined || typeof session.parentSessionPath === "string")
    && Number.isFinite(activityTimestamp(session));
}

function activityTimestamp(session: SessionInfo): number {
  return session.modified instanceof Date ? session.modified.getTime() : Number.NaN;
}

function idFor(kind: string, value: string): string {
  return `${kind}-${createHash("sha256").update(value).digest("hex").slice(0, 20)}`;
}

function sessionIdFromPath(sessions: readonly SessionInfo[], path: string): string | null {
  return sessions.find((session) => session.path === path)?.id ?? null;
}
