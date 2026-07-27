import { DatabaseSync } from "node:sqlite";
import { chmodSync, existsSync } from "node:fs";
import { ensurePrivateDirectory, ensurePrivateFile } from "./permissions.ts";
import { resolveStatePaths } from "./paths.ts";
import { migrations } from "./migrations.ts";
import type { ManagedWorktree, PiSession, RegistryOptions, Repository, Root, RuntimeRegistration, StatePaths } from "./types.ts";

export class WorkspaceRegistry {
  readonly paths: StatePaths;
  readonly #database: DatabaseSync;

  private constructor(paths: StatePaths, database: DatabaseSync) {
    this.paths = paths;
    this.#database = database;
  }

  static open(options: RegistryOptions = {}): WorkspaceRegistry {
    const paths = options.paths ?? resolveStatePaths();
    ensurePrivateDirectory(paths.stateDirectory);
    ensurePrivateDirectory(paths.runtimeDirectory);
    if (existsSync(paths.databasePath)) ensurePrivateFile(paths.databasePath);

    const database = new DatabaseSync(paths.databasePath);
    // The file was just created under a verified private directory, so tighten
    // the process umask-derived mode before validating it.
    chmodSync(paths.databasePath, 0o600);
    ensurePrivateFile(paths.databasePath);
    database.exec("PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON; PRAGMA synchronous = FULL;");
    enableWal(database);
    const registry = new WorkspaceRegistry(paths, database);
    registry.#migrate();
    registry.#secureSidecars();
    return registry;
  }

  close(): void {
    this.#secureSidecars();
    this.#database.close();
  }

  upsertRepository(record: Repository): void {
    this.#write(() => this.#database.prepare(`
      INSERT INTO repositories (id, identity, display_name, sort_rank, setup_command)
      VALUES (:id, :identity, :displayName, :sortRank, :setupCommand)
      ON CONFLICT(id) DO UPDATE SET identity = excluded.identity, display_name = excluded.display_name,
        sort_rank = excluded.sort_rank, setup_command = excluded.setup_command
    `).run({ id: record.id, identity: record.identity, displayName: record.displayName, sortRank: record.sortRank, setupCommand: record.setupCommand }));
  }

  upsertRoot(record: Root): void {
    this.#write(() => this.#database.prepare(`
      INSERT INTO roots (id, repository_id, path, initialized_at, setup_failure)
      VALUES (:id, :repositoryId, :path, :initializedAt, :setupFailure)
      ON CONFLICT(id) DO UPDATE SET repository_id = excluded.repository_id, path = excluded.path,
        initialized_at = excluded.initialized_at, setup_failure = excluded.setup_failure
    `).run({ id: record.id, repositoryId: record.repositoryId, path: record.path, initializedAt: record.initializedAt, setupFailure: record.setupFailure }));
  }

  upsertSession(record: PiSession): void {
    this.#write(() => this.#database.prepare(`
      INSERT INTO sessions (id, root_id, session_file, name, first_message, parent_session_file, parent_session_id, last_activity_at, archived, unread, sort_rank)
      VALUES (:id, :rootId, :sessionFile, :name, :firstMessage, :parentSessionFile, :parentSessionId, :lastActivityAt, :archived, :unread, :sortRank)
      ON CONFLICT(id) DO UPDATE SET root_id = excluded.root_id, session_file = excluded.session_file,
        name = excluded.name, first_message = excluded.first_message, parent_session_file = excluded.parent_session_file,
        parent_session_id = excluded.parent_session_id, last_activity_at = excluded.last_activity_at,
        archived = excluded.archived, unread = excluded.unread, sort_rank = excluded.sort_rank
    `).run({ ...record, archived: Number(record.archived), unread: Number(record.unread) }));
  }

  upsertManagedWorktree(record: ManagedWorktree): void {
    this.#write(() => this.#database.prepare(`
      INSERT INTO managed_worktrees (id, repository_id, root_id, path, branch)
      VALUES (:id, :repositoryId, :rootId, :path, :branch)
      ON CONFLICT(id) DO UPDATE SET repository_id = excluded.repository_id, root_id = excluded.root_id,
        path = excluded.path, branch = excluded.branch
    `).run({ id: record.id, repositoryId: record.repositoryId, rootId: record.rootId, path: record.path, branch: record.branch }));
  }

  claimRuntimeRegistration(record: RuntimeRegistration, staleBefore: string): boolean {
    return this.#write(() => this.#database.prepare(`
      INSERT INTO runtime_registrations (session_id, instance_id, pid, cwd, workspace_id, tmux_location, agent_state, heartbeat_at)
      VALUES (:sessionId, :instanceId, :pid, :cwd, :workspaceId, :tmuxLocation, :agentState, :heartbeatAt)
      ON CONFLICT(session_id) DO UPDATE SET instance_id = excluded.instance_id, pid = excluded.pid,
        cwd = excluded.cwd, workspace_id = excluded.workspace_id, tmux_location = excluded.tmux_location,
        agent_state = excluded.agent_state, heartbeat_at = excluded.heartbeat_at
      WHERE runtime_registrations.instance_id = excluded.instance_id
        OR runtime_registrations.heartbeat_at < :staleBefore
    `).run({ ...record, staleBefore }).changes === 1);
  }

  refreshRuntimeRegistration(record: RuntimeRegistration): boolean {
    return this.#write(() => this.#database.prepare(`
      UPDATE runtime_registrations
      SET pid = :pid, cwd = :cwd, workspace_id = :workspaceId, tmux_location = :tmuxLocation,
        agent_state = :agentState, heartbeat_at = :heartbeatAt
      WHERE session_id = :sessionId AND instance_id = :instanceId
    `).run({
      sessionId: record.sessionId, instanceId: record.instanceId, pid: record.pid, cwd: record.cwd,
      workspaceId: record.workspaceId, tmuxLocation: record.tmuxLocation,
      agentState: record.agentState, heartbeatAt: record.heartbeatAt,
    }).changes === 1);
  }

  removeRuntimeRegistration(sessionId: string, instanceId: string): boolean {
    return this.#write(() => this.#database.prepare(
      "DELETE FROM runtime_registrations WHERE session_id = ? AND instance_id = ?",
    ).run(sessionId, instanceId).changes === 1);
  }

  getRuntimeRegistration(sessionId: string): RuntimeRegistration | undefined {
    const row = this.#database.prepare(`
      SELECT session_id, instance_id, pid, cwd, workspace_id, tmux_location, agent_state, heartbeat_at
      FROM runtime_registrations WHERE session_id = ?
    `).get(sessionId) as RuntimeRegistrationRow | undefined;
    return row && toRuntimeRegistration(row);
  }

  listRuntimeRegistrations(): RuntimeRegistration[] {
    return (this.#database.prepare(`
      SELECT session_id, instance_id, pid, cwd, workspace_id, tmux_location, agent_state, heartbeat_at
      FROM runtime_registrations
    `).all() as unknown as RuntimeRegistrationRow[]).map(toRuntimeRegistration);
  }

  removeManagedWorktree(id: string): void {
    this.#write(() => this.#database.prepare("DELETE FROM managed_worktrees WHERE id = ?").run(id));
  }

  removeRootIfUnused(id: string): void {
    this.#write(() => this.#database.prepare("DELETE FROM roots WHERE id = ? AND NOT EXISTS (SELECT 1 FROM sessions WHERE root_id = ?)").run(id, id));
  }

  getManagedWorktreeByPath(path: string): ManagedWorktree | undefined {
    const row = this.#database.prepare("SELECT id, repository_id, root_id, path, branch FROM managed_worktrees WHERE path = ?").get(path) as ManagedWorktreeRow | undefined;
    return row && toManagedWorktree(row);
  }

  listManagedWorktrees(repositoryId: string): ManagedWorktree[] {
    return (this.#database.prepare("SELECT id, repository_id, root_id, path, branch FROM managed_worktrees WHERE repository_id = ? ORDER BY path").all(repositoryId) as unknown as ManagedWorktreeRow[]).map(toManagedWorktree);
  }

  setSessionUnread(id: string, unread: boolean): boolean {
    return this.#write(() => this.#database.prepare("UPDATE sessions SET unread = ? WHERE id = ?").run(Number(unread), id).changes === 1);
  }

  setSessionName(id: string, name: string | null): boolean {
    return this.#write(() => this.#database.prepare("UPDATE sessions SET name = ? WHERE id = ?").run(name, id).changes === 1);
  }

  setSessionArchived(id: string, archived: boolean): boolean {
    return this.#write(() => this.#database.prepare("UPDATE sessions SET archived = ? WHERE id = ?").run(Number(archived), id).changes === 1);
  }

  getSession(id: string): PiSession | undefined {
    const row = this.#database.prepare("SELECT id, root_id, session_file, name, first_message, parent_session_file, parent_session_id, last_activity_at, archived, unread, sort_rank FROM sessions WHERE id = ?").get(id) as SessionRow | undefined;
    return row && toSession(row);
  }

  listSessions(): PiSession[] {
    return (this.#database.prepare("SELECT id, root_id, session_file, name, first_message, parent_session_file, parent_session_id, last_activity_at, archived, unread, sort_rank FROM sessions ORDER BY sort_rank").all() as unknown as SessionRow[]).map(toSession);
  }

  getRepository(id: string): Repository | undefined {
    const row = this.#database.prepare("SELECT id, identity, display_name, sort_rank, setup_command FROM repositories WHERE id = ?").get(id) as RepositoryRow | undefined;
    return row && { id: row.id, identity: row.identity, displayName: row.display_name, sortRank: row.sort_rank, setupCommand: row.setup_command };
  }

  getRoot(id: string): Root | undefined {
    const row = this.#database.prepare("SELECT id, repository_id, path, initialized_at, setup_failure FROM roots WHERE id = ?").get(id) as RootRow | undefined;
    return row && toRoot(row);
  }

  getRootByPath(path: string): Root | undefined {
    const row = this.#database.prepare("SELECT id, repository_id, path, initialized_at, setup_failure FROM roots WHERE path = ?").get(path) as RootRow | undefined;
    return row && toRoot(row);
  }

  nextRepositoryRank(): number {
    return ((this.#database.prepare("SELECT MIN(sort_rank) AS rank FROM repositories").get() as { rank: number | null }).rank ?? 0) - 1;
  }

  nextSessionRank(repositoryId: string): number {
    return ((this.#database.prepare(`
      SELECT MIN(s.sort_rank) AS rank FROM sessions s
      JOIN roots r ON r.id = s.root_id WHERE r.repository_id = ?
    `).get(repositoryId) as { rank: number | null }).rank ?? 0) - 1;
  }

  schemaVersion(): number {
    return (this.#database.prepare("SELECT COALESCE(MAX(id), 0) AS version FROM schema_migrations").get() as { version: number }).version;
  }

  #migrate(): void {
    this.#write(() => {
      this.#database.exec("CREATE TABLE IF NOT EXISTS schema_migrations (id INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);");
      const applied = new Set((this.#database.prepare("SELECT id FROM schema_migrations").all() as { id: number }[]).map(({ id }) => id));
      for (const migration of migrations) {
        if (applied.has(migration.id)) continue;
        this.#database.exec(migration.sql);
        this.#database.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(migration.id, new Date().toISOString());
      }
    });
  }

  #write<T>(action: () => T): T {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        this.#database.exec("BEGIN IMMEDIATE");
        const result = action();
        this.#database.exec("COMMIT");
        this.#secureSidecars();
        return result;
      } catch (error) {
        try { this.#database.exec("ROLLBACK"); } catch { /* no transaction began */ }
        if (!isBusy(error) || attempt === 19) throw error;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10 * (attempt + 1));
      }
    }
    throw new Error("Unreachable database write retry exhaustion");
  }

  #secureSidecars(): void {
    for (const suffix of ["", "-wal", "-shm"]) {
      const path = `${this.paths.databasePath}${suffix}`;
      if (existsSync(path)) {
        chmodSync(path, 0o600);
        ensurePrivateFile(path);
      }
    }
  }
}

interface SessionRow { id: string; root_id: string; session_file: string; name: string | null; first_message: string | null; parent_session_file: string | null; parent_session_id: string | null; last_activity_at: string | null; archived: number; unread: number; sort_rank: number }
interface RepositoryRow { id: string; identity: string; display_name: string; sort_rank: number; setup_command: string | null }
interface RootRow { id: string; repository_id: string | null; path: string; initialized_at: string | null; setup_failure: string | null }
interface RuntimeRegistrationRow { session_id: string; instance_id: string; pid: number; cwd: string; workspace_id: string | null; tmux_location: string | null; agent_state: "idle" | "running"; heartbeat_at: string }
interface ManagedWorktreeRow { id: string; repository_id: string; root_id: string; path: string; branch: string }
function toManagedWorktree(row: ManagedWorktreeRow): ManagedWorktree {
  return { id: row.id, repositoryId: row.repository_id, rootId: row.root_id, path: row.path, branch: row.branch };
}
function toRuntimeRegistration(row: RuntimeRegistrationRow): RuntimeRegistration {
  return { sessionId: row.session_id, instanceId: row.instance_id, pid: row.pid, cwd: row.cwd, workspaceId: row.workspace_id, tmuxLocation: row.tmux_location, agentState: row.agent_state, heartbeatAt: row.heartbeat_at };
}
function toRoot(row: RootRow): Root {
  return { id: row.id, repositoryId: row.repository_id, path: row.path, initializedAt: row.initialized_at, setupFailure: row.setup_failure };
}

function toSession(row: SessionRow): PiSession {
  return {
    id: row.id, rootId: row.root_id, sessionFile: row.session_file, name: row.name,
    firstMessage: row.first_message, parentSessionFile: row.parent_session_file,
    parentSessionId: row.parent_session_id, lastActivityAt: row.last_activity_at,
    archived: row.archived === 1, unread: row.unread === 1, sortRank: row.sort_rank,
  };
}
function enableWal(database: DatabaseSync): void {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      database.exec("PRAGMA journal_mode = WAL;");
      return;
    } catch (error) {
      if (!isBusy(error) || attempt === 19) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10 * (attempt + 1));
    }
  }
}

function isBusy(error: unknown): boolean {
  return error instanceof Error && /SQLITE_BUSY|database is locked/i.test(error.message);
}
