export type RepositoryId = string;
export type RootId = string;
export type SessionId = string;

export interface Repository {
  id: RepositoryId;
  identity: string;
  displayName: string;
  sortRank: number;
  setupCommand: string | null;
}

export interface Root {
  id: RootId;
  repositoryId: RepositoryId | null;
  path: string;
  initializedAt: string | null;
  setupFailure: string | null;
}

export interface PiSession {
  id: SessionId;
  rootId: RootId;
  sessionFile: string;
  name: string | null;
  firstMessage: string | null;
  parentSessionFile: string | null;
  parentSessionId: SessionId | null;
  lastActivityAt: string | null;
  archived: boolean;
  unread: boolean;
  sortRank: number;
}

export interface ManagedWorktree {
  id: string;
  repositoryId: RepositoryId;
  rootId: RootId;
  path: string;
  branch: string;
}

export interface RuntimeRegistration {
  sessionId: SessionId;
  instanceId: string;
  pid: number;
  cwd: string;
  workspaceId: string | null;
  tmuxLocation: string | null;
  agentState: "idle" | "running";
  heartbeatAt: string;
}

export type RuntimeState = "cold" | "managed-warm" | "active-elsewhere";

export interface RuntimeOwnership {
  registration: RuntimeRegistration;
  state: Exclude<RuntimeState, "cold">;
}

export interface StatePaths {
  stateDirectory: string;
  databasePath: string;
  runtimeDirectory: string;
}

export interface RegistryOptions {
  paths?: StatePaths;
}

export interface RuntimeRegistryOptions {
  staleAfterMs?: number;
  now?: () => Date;
  isPidRunning?: (pid: number) => boolean;
  isTmuxLocationRunning?: (location: string) => boolean;
}
