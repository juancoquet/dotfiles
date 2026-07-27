export interface Migration {
  id: number;
  sql: string;
}

export const migrations: readonly Migration[] = [
  {
    id: 1,
    sql: `
      CREATE TABLE repositories (
        id TEXT PRIMARY KEY,
        identity TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        sort_rank REAL NOT NULL,
        setup_command TEXT
      );
      CREATE TABLE roots (
        id TEXT PRIMARY KEY,
        repository_id TEXT REFERENCES repositories(id) ON DELETE SET NULL,
        path TEXT NOT NULL UNIQUE,
        initialized_at TEXT,
        setup_failure TEXT
      );
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        root_id TEXT NOT NULL REFERENCES roots(id) ON DELETE RESTRICT,
        session_file TEXT NOT NULL UNIQUE,
        name TEXT,
        archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
        unread INTEGER NOT NULL DEFAULT 0 CHECK (unread IN (0, 1)),
        sort_rank REAL NOT NULL
      );
      CREATE TABLE managed_worktrees (
        id TEXT PRIMARY KEY,
        repository_id TEXT NOT NULL REFERENCES repositories(id) ON DELETE RESTRICT,
        root_id TEXT NOT NULL UNIQUE REFERENCES roots(id) ON DELETE RESTRICT,
        path TEXT NOT NULL UNIQUE,
        branch TEXT NOT NULL
      );
      CREATE TABLE runtime_registrations (
        session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
        pid INTEGER NOT NULL,
        workspace_id TEXT,
        tmux_location TEXT,
        agent_state TEXT NOT NULL CHECK (agent_state IN ('idle', 'running')),
        heartbeat_at TEXT NOT NULL
      );
      CREATE INDEX sessions_by_root_order ON sessions(root_id, sort_rank);
      CREATE INDEX roots_by_repository ON roots(repository_id);
      CREATE INDEX runtime_by_pid ON runtime_registrations(pid);
    `,
  },
  {
    id: 2,
    sql: `ALTER TABLE sessions ADD COLUMN last_activity_at TEXT;`,
  },
];
