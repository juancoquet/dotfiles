import { spawnSync } from "node:child_process";
import { bootstrapRoot } from "./bootstrap.ts";
import { catalogSessions } from "./catalog.ts";
import { WorkspaceRegistry } from "./database.ts";
import { createNewWorkspace, openWorkspace } from "./launcher.ts";
import { RuntimeRegistry } from "./runtime.ts";
import { renderSessionPreview } from "./preview.ts";
import { renameSession } from "./session-names.ts";
import { archiveSession, archiveSessionTree, closeWorkspace, trashSession } from "./session-actions.ts";
import { createManagedWorktree, listGitWorktrees } from "./worktrees.ts";
import type { PiSession, Repository, Root } from "./types.ts";

const PRIMARY_HINTS = "Ctrl+N new  Ctrl+E rename  Ctrl+/ preview  Alt+j/k move session  Ctrl+W close  Ctrl+A archive  Ctrl+R restore  ? help  Esc close";
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const UNREAD_BELL = "󰂚";
const HELP = [
  "Pi workspaces",
  "",
  "?          Show this help",
  "Ctrl+S     Rerun or change root setup",
  "Ctrl+E     Rename a session",
  "Ctrl+U     Toggle unread",
  "Ctrl+/     Toggle session preview",
  "Alt+j/k   Move a session down/up within its group",
  "Alt+Shift+j/k  Move the highlighted group down/up",
  "Ctrl+W     Close a warm workspace",
  "Ctrl+A     Archive a session",
  "Ctrl+Alt+A Archive a session and descendants",
  "Ctrl+Alt+X Move a cold session to macOS Trash",
  "Ctrl+R     Restore one archived session",
  "Esc        Return to the picker",
  "",
  "Press ? or Esc to return to the picker.",
].join("\n");

export interface PickerProcess {
  run(input: string, arguments_: readonly string[]): string | undefined;
}

export interface PickerDependencies {
  process: PickerProcess;
  open(sessionId: string): Promise<unknown>;
}

export interface PickerListingDependencies {
  openRegistry(): WorkspaceRegistry;
  catalog(registry: WorkspaceRegistry): Promise<unknown>;
}

export interface PickerRenameDependencies extends PickerListingDependencies {
  promptName(currentName: string): string | undefined;
  rename(sessionId: string, name: string, registry: WorkspaceRegistry): boolean;
}

export type CreationTarget =
  | { kind: "root"; path: string }
  | { kind: "existing-worktree"; path: string }
  | { kind: "directory" }
  | { kind: "managed-worktree" };

export interface PickerCreationDependencies extends PickerListingDependencies {
  chooseDirectory(defaultRoot: string): string | undefined;
  chooseTarget?(defaultRoot: string): CreationTarget | undefined;
  createWorkspace(root: string): Promise<unknown>;
  createManagedWorktree?(sourceRoot: string, registry: WorkspaceRegistry): Promise<{ kind: "created" | "cancelled" }>;
  cwd(): string;
}

interface Group {
  repository: Repository;
  sessions: Array<{ session: PiSession; root: Root }>;
}

/** Opens fzf immediately, then reloads its catalog so loading is explicit. */
export async function showWorkspacePicker(dependencies: PickerDependencies = defaultDependencies()): Promise<void> {
  const selected = dependencies.process.run(renderLoading(), fzfArguments());
  const sessionId = selected?.trim().split("\t")[1];
  if (sessionId) await dependencies.open(sessionId);
}

/** Builds the fzf listing after cataloging; this also powers fzf's initial reload. */
export async function listWorkspacePicker(dependencies: PickerListingDependencies = defaultListingDependencies(), frame = 0): Promise<string> {
  const registry = dependencies.openRegistry();
  try {
    try {
      await dependencies.catalog(registry);
    } catch (error) {
      return renderCatalogError(error);
    }
    return renderWorkspacePicker(registry, frame);
  } finally {
    registry.close();
  }
}

export function renderWorkspacePicker(registry: WorkspaceRegistry, frame = 0): string {
  const runtime = new RuntimeRegistry(registry);
  const groups = new Map<string, Group>();
  for (const session of registry.listSessions()) {
    if (session.archived) continue;
    const root = registry.getRoot(session.rootId);
    if (!root || !root.repositoryId) continue;
    const repository = registry.getRepository(root.repositoryId);
    if (!repository) continue;
    const group = groups.get(repository.id) ?? { repository, sessions: [] };
    group.sessions.push({ session, root });
    groups.set(repository.id, group);
  }
  if (groups.size === 0) return "No Pi sessions yet. Run piw <directory> to create one.\n";

  return [...groups.values()]
    .sort((left, right) => left.repository.sortRank - right.repository.sortRank)
    .flatMap((group) => [
      `── ${clean(group.repository.displayName)} ──`,
      ...group.sessions
        .sort((left, right) => left.session.sortRank - right.session.sortRank)
        .map(({ session, root }) => renderSession(session, root, runtime, frame)),
    ])
    .join("\n") + "\n";
}

export function fzfArguments(command = "~/.local/bin/piw-picker", terminalColumns = process.stdout.columns): string[] {
  const listing = `${command} --list $(( $(date +%s%N) / 100000000 ))`;
  const refresh = `reload(${listing})`;
  const animate = "execute-silent(while kill -0 $PPID 2>/dev/null; do sleep 0.1; tmux send-keys -t \"$TMUX_PANE\" C-r 2>/dev/null || exit; done)";
  const previewWindow = terminalColumns >= 110 ? "right:50%:wrap" : "right:50%:wrap:hidden";
  return [
    "--no-sort",
    "--disabled",
    "--layout=reverse",
    "--delimiter=\\t",
    "--with-nth=1",
    `--header=${PRIMARY_HINTS}`,
    "--prompt=Workspace> ",
    `--preview=${command} --preview {2}`,
    `--preview-window=${previewWindow}`,
    `--bind=start:${refresh}+enable-search+${animate},?:execute(${command} --help),ctrl-/:toggle-preview,ctrl-n:execute(${command} --create {2})+abort,ctrl-s:execute(${command} --setup {2})+abort,ctrl-e:execute(${command} --rename {2})+${refresh},ctrl-u:execute(${command} --toggle-unread {2})+${refresh},alt-j:execute(${command} --move-session {2} down {q})+${refresh},alt-k:execute(${command} --move-session {2} up {q})+${refresh},alt-shift-j:execute(${command} --move-group {2} down {q})+${refresh},alt-shift-k:execute(${command} --move-group {2} up {q})+${refresh},ctrl-w:execute(${command} --close {2})+abort,ctrl-a:execute(${command} --archive {2})+${refresh},ctrl-alt-a:execute(${command} --archive-tree {2})+${refresh},ctrl-alt-x:execute(${command} --trash {2})+${refresh},ctrl-r:execute(${command} --restore)+${refresh}`,
    "--track-current",
    "--select-1",
  ];
}

/** Prompts for a directory, then starts a fresh workspace without touching existing sessions. */
export async function createWorkspaceFromPicker(
  selectedSessionId: string | undefined,
  dependencies: PickerCreationDependencies = defaultCreationDependencies(),
): Promise<boolean> {
  const registry = dependencies.openRegistry();
  try {
    await dependencies.catalog(registry);
    const selectedRoot = selectedSessionId
      ? registry.getRoot(registry.getSession(selectedSessionId)?.rootId ?? "")
      : undefined;
    const defaultRoot = selectedRoot?.path ?? dependencies.cwd();
    const target = dependencies.chooseTarget?.(defaultRoot) ?? { kind: "directory" } as CreationTarget;
    if (target.kind === "managed-worktree") {
      return (await (dependencies.createManagedWorktree ?? createManagedWorktree)(defaultRoot, registry)).kind === "created";
    }
    const root = target.kind === "directory" ? dependencies.chooseDirectory(defaultRoot) : target.path;
    if (!root) return false;
    await dependencies.createWorkspace(root);
    return true;
  } finally {
    registry.close();
  }
}

/** Prompts to rerun or change setup for the selected session's exact root. */
export async function rerunRootSetupFromPicker(sessionId: string, dependencies: PickerListingDependencies = defaultListingDependencies()): Promise<boolean> {
  const registry = dependencies.openRegistry();
  try {
    await dependencies.catalog(registry);
    const root = registry.getRoot(registry.getSession(sessionId)?.rootId ?? "");
    if (!root) return false;
    return Boolean(await bootstrapRoot(root.path, registry, { force: true }));
  } finally { registry.close(); }
}

/** Lets the picker reveal archives without putting them in the normal listing. */
export async function restoreArchivedSessionFromPicker(dependencies: PickerListingDependencies = defaultListingDependencies()): Promise<boolean> {
  const registry = dependencies.openRegistry();
  try {
    await dependencies.catalog(registry);
    const rows = renderArchivedSessionRows(registry);
    if (!rows) return false;
    const selected = spawnSync("fzf", ["--no-sort", "--delimiter=\\t", "--with-nth=1", "--prompt=Archived sessions> ", "--bind=ctrl-e:execute(~/.local/bin/piw-picker --rename {2})+reload(~/.local/bin/piw-picker --list-archives)"], {
      input: `${rows}\n`, encoding: "utf8", stdio: ["pipe", "pipe", "inherit"],
    }).stdout.trim().split("\t")[1];
    return Boolean(selected && registry.getSession(selected)?.archived && registry.setSessionArchived(selected, false));
  } finally { registry.close(); }
}

/** Renames a session through Pi metadata; cancelling leaves all state untouched. */
export async function renameSessionFromPicker(
  sessionId: string,
  dependencies: PickerRenameDependencies = defaultRenameDependencies(),
): Promise<boolean> {
  const registry = dependencies.openRegistry();
  try {
    await dependencies.catalog(registry);
    const session = registry.getSession(sessionId);
    if (!session) return false;
    const name = dependencies.promptName(session.name ?? "");
    return name === undefined ? false : dependencies.rename(sessionId, name, registry);
  } finally { registry.close(); }
}

export type ReorderResult = "moved" | "unavailable" | "filtered";

/** Moves a session or its repository group, unless a fuzzy filter hides adjacent items. */
export async function reorderFromPicker(
  kind: "session" | "group",
  sessionId: string,
  direction: "up" | "down",
  query: string,
  dependencies: PickerListingDependencies = defaultListingDependencies(),
): Promise<ReorderResult> {
  if (query.trim()) return "filtered";
  const registry = dependencies.openRegistry();
  try {
    await dependencies.catalog(registry);
    const moved = kind === "session"
      ? registry.moveSession(sessionId, direction)
      : registry.moveRepositoryForSession(sessionId, direction);
    return moved ? "moved" : "unavailable";
  } finally { registry.close(); }
}

function explainReorder(result: ReorderResult): void {
  if (result !== "filtered") return;
  spawnSync("tmux", ["display-message", "Clear the filter before reordering workspaces."], { stdio: "ignore" });
}

export function directoryPickerArguments(defaultRoot: string): string[] {
  return [
    "--disabled",
    "--print-query",
    `--query=${defaultRoot}`,
    "--prompt=Directory> ",
    "--header=Edit the exact directory path, then press Enter. Esc cancels.",
    "--bind=enter:accept",
  ];
}

function renderSession(session: PiSession, root: Root, runtime: RuntimeRegistry, frame: number): string {
  const name = session.name || session.firstMessage || "Untitled session";
  const activity = session.lastActivityAt ? `  ${clean(session.lastActivityAt)}` : "";
  const ownership = runtime.ownership(session.id);
  const status = ownership.state === "cold" ? "○"
    : ownership.state === "active-elsewhere" ? "◌"
    : ownership.registration.agentState === "running" ? SPINNER_FRAMES[frame % SPINNER_FRAMES.length]
    : "●";
  const unread = session.unread ? UNREAD_BELL : " ";
  return `  ${status}  ${unread}  ${clean(root.path)}  ${clean(name)}${activity}\t${session.id}`;
}

/** Supplies fzf reloads while editing archived session names. */
export async function listArchivedWorkspacePicker(dependencies: PickerListingDependencies = defaultListingDependencies()): Promise<string> {
  const registry = dependencies.openRegistry();
  try {
    await dependencies.catalog(registry);
    return `${renderArchivedSessionRows(registry)}\n`;
  } finally { registry.close(); }
}

function renderArchivedSessionRows(registry: WorkspaceRegistry): string {
  return registry.listSessions().filter((session) => session.archived)
    .map((session) => `  ○  ${clean(session.name || session.firstMessage || "Untitled session")}\t${session.id}`)
    .join("\n");
}

export function renderLoading(): string {
  return "Loading Pi sessions…\n";
}

function renderCatalogError(error: unknown): string {
  const message = error instanceof Error ? error.message : "unknown failure";
  return `Unable to load Pi sessions: ${clean(message)}\nRun piw again after resolving the catalog error.\n`;
}

function clean(value: string): string {
  return value.replace(/[\x00-\x1f\x7f-\x9f]/g, " ").replace(/\s+/g, " ").trim();
}

function defaultDependencies(): PickerDependencies {
  return {
    process: {
      run(input, arguments_) {
        return spawnSync("fzf", arguments_, { input, encoding: "utf8", stdio: ["pipe", "pipe", "inherit"] }).stdout;
      },
    },
    open: openWorkspace,
  };
}

function defaultListingDependencies(): PickerListingDependencies {
  return { openRegistry: () => WorkspaceRegistry.open(), catalog: catalogSessions };
}

function defaultRenameDependencies(): PickerRenameDependencies {
  return {
    ...defaultListingDependencies(),
    promptName(currentName) {
      const output = spawnSync("fzf", ["--disabled", "--phony", "--print-query", `--query=${currentName}`, "--prompt=Session name> ", "--header=Edit the name. Empty clears it; Esc cancels.", "--bind=enter:accept"], {
        input: "", encoding: "utf8", stdio: ["pipe", "pipe", "inherit"],
      });
      return output.status === 0 ? output.stdout.trim() : undefined;
    },
    rename: renameSession,
  };
}

function defaultCreationDependencies(): PickerCreationDependencies {
  return {
    ...defaultListingDependencies(),
    chooseDirectory(defaultRoot) {
      const output = spawnSync("fzf", directoryPickerArguments(defaultRoot), { input: "", encoding: "utf8", stdio: ["pipe", "pipe", "inherit"] }).stdout;
      const path = output.trim();
      return path || undefined;
    },
    chooseTarget(defaultRoot) {
      let worktrees: string[] = [];
      try { worktrees = listGitWorktrees(defaultRoot).map((worktree) => worktree.path).filter((path) => path !== defaultRoot); } catch { /* directory choices remain available */ }
      const input = [
        `Current root\troot:${defaultRoot}`,
        ...worktrees.map((path) => `Existing worktree: ${path}\texisting:${path}`),
        "New managed worktree\tmanaged",
        "Another directory…\tdirectory",
      ].join("\n");
      const output = spawnSync("fzf", ["--no-sort", "--delimiter=\\t", "--with-nth=1", "--prompt=New workspace> "], { input, encoding: "utf8", stdio: ["pipe", "pipe", "inherit"] }).stdout.trim();
      const value = output.split("\t")[1];
      if (value === "managed") return { kind: "managed-worktree" };
      if (value === "directory") return { kind: "directory" };
      if (value?.startsWith("root:")) return { kind: "root", path: value.slice("root:".length) };
      if (value?.startsWith("existing:")) return { kind: "existing-worktree", path: value.slice("existing:".length) };
      return undefined;
    },
    createWorkspace: async (root) => { await createNewWorkspace(root); },
    createManagedWorktree: async (sourceRoot, registry) => createManagedWorktree(sourceRoot, registry),
    cwd: () => process.cwd(),
  };
}

function showHelp(): void {
  process.stdout.write(`${HELP}\n`);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once("data", () => process.exit(0));
  }
}

if (import.meta.main) {
  const [argument, sessionId, frame, ...extra] = process.argv.slice(2);
  if (argument === "--help" && !sessionId) showHelp();
  else if (argument === "--list" && extra.length === 0) process.stdout.write(await listWorkspacePicker(undefined, Number(frame) || 0));
  else if (argument === "--preview" && sessionId && !frame && extra.length === 0) {
    const registry = WorkspaceRegistry.open();
    try { process.stdout.write(renderSessionPreview(sessionId, registry)); } finally { registry.close(); }
  }
  else if (argument === "--list-archives" && !sessionId && !frame && extra.length === 0) process.stdout.write(await listArchivedWorkspacePicker());
  else if (argument === "--create" && extra.length === 0) await createWorkspaceFromPicker(sessionId);
  else if (argument === "--setup" && sessionId && !frame && extra.length === 0) await rerunRootSetupFromPicker(sessionId);
  else if (argument === "--rename" && sessionId && !frame && extra.length === 0) await renameSessionFromPicker(sessionId);
  else if (argument === "--move-session" && sessionId && (frame === "up" || frame === "down") && extra.length <= 1) {
    explainReorder(await reorderFromPicker("session", sessionId, frame, extra[0] ?? ""));
  }
  else if (argument === "--move-group" && sessionId && (frame === "up" || frame === "down") && extra.length <= 1) {
    explainReorder(await reorderFromPicker("group", sessionId, frame, extra[0] ?? ""));
  }
  else if (argument === "--close" && sessionId && !frame && extra.length === 0) await closeWorkspace(sessionId);
  else if (argument === "--archive" && sessionId && !frame && extra.length === 0) await archiveSession(sessionId);
  else if (argument === "--archive-tree" && sessionId && !frame && extra.length === 0) await archiveSessionTree(sessionId);
  else if (argument === "--trash" && sessionId && !frame && extra.length === 0) {
    const result = await trashSession(sessionId);
    if (result === "unsafe") process.stderr.write("Cannot trash a running or active Pi session. Close it first.\n");
    else if (result === "failed") process.stderr.write("Could not move this Pi session to macOS Trash; its history was retained.\n");
  }
  else if (argument === "--restore" && !sessionId && !frame && extra.length === 0) await restoreArchivedSessionFromPicker();
  else if (argument === "--toggle-unread" && sessionId && !frame && extra.length === 0) {
    const registry = WorkspaceRegistry.open();
    try {
      await catalogSessions(registry);
      const session = registry.getSession(sessionId);
      if (session) registry.setSessionUnread(session.id, !session.unread);
    } finally { registry.close(); }
  }
  else if (argument === "--open" && sessionId && extra.length === 0) {
    const result = await openWorkspace(sessionId);
    if (result === "session-active-elsewhere") process.stderr.write("This Pi session is active elsewhere and cannot be opened here.\n");
    else if (result === "session-not-found") process.stderr.write("This Pi session no longer exists.\n");
  } else if (!argument) await showWorkspacePicker();
  else throw new Error("Usage: piw-picker [--list [frame]|--help|--create [session-id]|--setup <session-id>|--rename <session-id>|--move-session <session-id> <up|down> [query]|--move-group <session-id> <up|down> [query]|--close <session-id>|--archive <session-id>|--archive-tree <session-id>|--trash <session-id>|--restore|--toggle-unread <session-id>|--preview <session-id>|--open <session-id>]");
}
