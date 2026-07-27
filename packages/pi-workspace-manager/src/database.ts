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
      INSERT INTO sessions (id, root_id, session_file, name, archived, unread, sort_rank)
      VALUES (:id, :rootId, :sessionFile, :name, :archived, :unread, :sortRank)
      ON CONFLICT(id) DO UPDATE SET root_id = excluded.root_id, session_file = excluded.session_file,
        name = excluded.name, archived = excluded.archived, unread = excluded.unread, sort_rank = excluded.sort_rank
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

  upsertRuntimeRegistration(record: RuntimeRegistration): void {
    this.#write(() => this.#database.prepare(`
      INSERT INTO runtime_registrations (session_id, pid, workspace_id, tmux_location, agent_state, heartbeat_at)
      VALUES (:sessionId, :pid, :workspaceId, :tmuxLocation, :agentState, :heartbeatAt)
      ON CONFLICT(session_id) DO UPDATE SET pid = excluded.pid, workspace_id = excluded.workspace_id,
        tmux_location = excluded.tmux_location, agent_state = excluded.agent_state, heartbeat_at = excluded.heartbeat_at
    `).run({ sessionId: record.sessionId, pid: record.pid, workspaceId: record.workspaceId, tmuxLocation: record.tmuxLocation, agentState: record.agentState, heartbeatAt: record.heartbeatAt }));
  }

  getSession(id: string): PiSession | undefined {
    const row = this.#database.prepare("SELECT id, root_id, session_file, name, archived, unread, sort_rank FROM sessions WHERE id = ?").get(id) as SessionRow | undefined;
    return row && toSession(row);
  }

  listSessions(): PiSession[] {
    return (this.#database.prepare("SELECT id, root_id, session_file, name, archived, unread, sort_rank FROM sessions ORDER BY sort_rank").all() as unknown as SessionRow[]).map(toSession);
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

  #write(action: () => void): void {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        this.#database.exec("BEGIN IMMEDIATE");
        action();
        this.#database.exec("COMMIT");
        this.#secureSidecars();
        return;
      } catch (error) {
        try { this.#database.exec("ROLLBACK"); } catch { /* no transaction began */ }
        if (!isBusy(error) || attempt === 19) throw error;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10 * (attempt + 1));
      }
    }
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

interface SessionRow { id: string; root_id: string; session_file: string; name: string | null; archived: number; unread: number; sort_rank: number }
function toSession(row: SessionRow): PiSession {
  return { id: row.id, rootId: row.root_id, sessionFile: row.session_file, name: row.name, archived: row.archived === 1, unread: row.unread === 1, sortRank: row.sort_rank };
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
