# Pi Workspace Manager
current issue: none

## Overview

Pi is effective as a terminal-native coding agent, but working across several conversations, repositories, and worktrees lacks the workspace management available in desktop agent applications. This project adds that missing layer without replacing Pi or embedding a terminal emulator inside its TUI.

The workflow uses tmux as the compositor, Pi as the agent interface, nvim as the editor and diff viewer, and fzf as the workspace picker. Switching a Pi session switches the entire visible workspace: conversation, directory, environment, editor process, and pane layout. Background agents and editors remain alive, so returning to a workspace restores it exactly as it was left.

Implementation work is tracked in [`docs/issues/todo/`](issues/todo/).

## Issue workflow

Keep the `current issue: <number>` line at the top of this document up to date. It identifies the issue to implement next or the one currently in progress. Use the issue's three-digit filename prefix. Increment it to the next numbered todo issue after completing the current issue. Use `current issue: none` only after every issue is complete.

Before implementing an issue, read this document in full and treat its terminology, constraints, and non-goals as requirements. Confirm that `current issue` matches that issue's number, then change the issue's line from:

```text
status: todo
```

to:

```text
status: in-progress
```

Keep the issue in `docs/issues/todo/` while work is underway. When every acceptance criterion passes, change the line to:

```text
status: complete
```

Then move the issue file to `docs/issues/done/`, increment `current issue` to the next numbered todo issue, commit the completed ticket, and push the commit. After completing the final issue, set `current issue: none`. Do not mark an issue complete or move it while any acceptance criterion remains unmet.

## Goals

The workflow should make terminal-native Pi usage feel like a coherent multi-session desktop application while preserving the strengths of independent terminal tools.

It must provide:

- Fast keyboard-driven switching between Pi sessions across repositories, directories, and worktrees.
- One persistent workspace per Pi session, including independent Pi and nvim processes.
- Warm background execution while another workspace is visible.
- Lazy, collapsible, and zoomable nvim integration.
- A central flow for creating sessions in existing directories or managed worktrees.
- Environment setup and `.venv` activation shared by Pi and nvim.
- Diff comments composed in nvim and accumulated in Pi's input editor.
- Manual organization, archive, unread, cleanup, and recovery controls.
- Compatibility with sessions created by raw Pi.

## Non-goals

The first version will not:

- Embed nvim or another PTY inside Pi's TUI.
- Replace Pi's chat rendering with an nvim or custom RPC client.
- Replace the raw `pi` command.
- Create one tmux session per project, worktree, or Pi session.
- Automatically archive old sessions.
- Remove worktrees when sessions are archived or deleted.
- Force-open a Pi session already active in another unknown process.
- Restore exact nvim buffers and windows after a machine or tmux-server restart.
- Add sounds or OS notifications.
- Capture whole diff hunks automatically when writing review comments.
- Add a compound reveal/focus/fullscreen nvim action unless real usage justifies it.

## Domain concepts

### Repository

One Git history and object-store identity. A primary checkout and all of its worktrees belong to the same repository. Repository identity exists for grouping and Git operations; it does not determine where a workspace runs.

### Root directory

The exact directory in which a Pi session was opened. A session opened in `project/src` has `project/src` as its root even when the Git worktree top-level is `project`.

### Workspace

One Pi session and its independently owned runtime state:

- primary tmux window
- Pi process
- optional, lazily created nvim process
- pane layout and width
- exact root and environment

Two workspaces never share Pi or nvim processes, even when they have the same root.

### Warm workspace

A workspace whose managed tmux window and Pi process are running. It can continue agent work in the background and retains live nvim and pane state.

### Cold session

A persisted Pi session without a running managed workspace. Selecting it creates a managed window and resumes the conversation.

### Managed worktree

A worktree created by this workflow under its central worktree directory. Its lifetime is independent from the Pi sessions that use it.

## Workspace model

All managed workspaces live in one tmux session named `piw`. Each warm workspace owns one primary tmux window. Collapsed nvim panes may use hidden implementation-only parking windows, but those are not workspaces and do not appear in the picker.

A workspace is identified by its Pi session, not by repository or directory. This permits several independent conversations and editor states in the same checkout.

Switching workspaces changes tmux windows rather than relocating or restarting processes. The workspace left behind remains warm unless explicitly closed or archived. This preserves:

- running agents
- nvim buffers and windows
- Diffview state
- pane width
- collapsed or expanded editor state
- zoom state
- root-specific environment

After a tmux-server or machine restart, prior workspaces become cold. Durable metadata survives, but nvim starts fresh on its next reveal.

## Entry point

The managed workflow is launched with `piw`. Raw `pi` remains unchanged for quick, ephemeral, scripted, or diagnostic use.

Bare `piw` behaves like reopening a desktop application:

1. If a warm workspace exists, return to the most recently viewed one.
2. If only cold sessions exist, enter the `piw` tmux session and open the picker.
3. If no Pi sessions exist, create a workspace in the invocation directory.

`piw <path>` starts the creation flow rooted at that exact path.

When invoked inside tmux, `piw` switches the current client to the `piw` session instead of nesting tmux. Outside tmux, it attaches to or creates the session normally.

## Workspace picker

`Ctrl-Space w` opens an fzf picker in a tmux popup. It replaces tmux's ordinary window tree and acts as the terminal equivalent of a session sidebar.

### Organization

The picker shows explicit repository groups. Worktrees belonging to one Git repository appear together while retaining their distinct roots and branches. Non-Git roots receive directory-based groups.

Both repository groups and sessions have manual persistent order:

- New groups appear at the top.
- New sessions appear at the top of their group.
- Existing items are seeded by recent activity during migration.
- Activity never reorders an item after it has been placed.
- Archived sessions retain their position for restoration.

Fuzzy filtering preserves this order instead of sorting by match score. Reordering is disabled while a filter is active because hidden items would make relative movement ambiguous.

### Session rows

Each session row includes:

- runtime status
- unread status in a separate column
- repository and branch, or root label
- session name, falling back to its first message
- last activity

Runtime status uses:

- `●` for warm and idle
- `○` for cold
- a distinct marker for active elsewhere
- Pi's animated Braille spinner while an agent runs

Unread state uses a Nerd Font bell. It remains independent from runtime state, so a cold session can still be unread.

Switching to a workspace clears unread automatically. `Ctrl+U` toggles it manually. If the current workspace is explicitly marked unread, it remains unread until switched away from and viewed again.

### Preview and help

A responsive right-hand preview shows:

- full session name and root
- branch and worktree path
- last activity
- Git dirty state
- recent conversation excerpts
- parent and fork relationships

The preview hides or can be toggled on narrow terminals.

The picker surface displays only frequent bindings. `?` opens the complete keybinding reference; `?` is therefore not available as a literal search character. Less frequent and destructive actions remain direct bindings documented in that reference rather than living in a secondary action menu.

### Primary actions

- `Enter`: open or switch to the highlighted workspace.
- `Ctrl+O`: create a workspace.
- `Ctrl+W`: close the warm workspace while retaining its session.
- `Ctrl+A`: archive the selected session.
- `Ctrl+R`: reveal archived sessions and restore one.
- `Ctrl+E`: rename the selected session.
- `Ctrl+U`: toggle unread.
- `Alt+j` / `Alt+k`: move a session within its group.
- `Alt+Shift+j` / `Alt+Shift+k`: move a repository group.
- `?`: show all bindings.

Bindings for setup, tree archive, session Trash, worktree cleanup, and preview toggling will be assigned during implementation and shown in `?`.

## Session discovery and process ownership

The picker includes every persisted Pi session, including sessions created outside `piw`. A cold raw session can be imported into the managed workflow simply by selecting it.

A global Pi extension publishes live process ownership and lifecycle state. It records session identity, PID, root, tmux location where available, managed workspace identity, and agent running state. Heartbeats and process validation prevent stale registrations from remaining warm forever.

The same Pi JSONL session must never be opened by two Pi processes concurrently.

When a selected session is active elsewhere:

- If its tmux location is known, selection switches there.
- If its location is unavailable, the picker explains the conflict and refuses to open a duplicate.

There is no force-open path in the first version.

## Creating workspaces

`Ctrl+O` opens one creation flow rather than separate commands for directories and worktrees. It can create a fresh Pi session in:

- the highlighted or current exact root
- another selected directory
- an existing worktree
- a new managed worktree

The highlighted session's root is the default when available. Git roots are never normalized to the worktree top-level.

Every created Pi session receives an independent workspace, even when another workspace already uses the same directory.

## Root setup and environments

Setup is language-agnostic and runs once per exact root, not once per Pi session.

If `<root>/.venv` already exists, setup is skipped and the environment is activated for both Pi and nvim. Activation is checked on every process launch, even after the root has been initialized.

When no `.venv` exists on first managed opening, the workflow prompts for an optional setup command. It may suggest detectable commands such as:

- `uv sync`
- `npm install`
- `bundle install`
- `go mod download`
- `sh ./setup.sh`

The repository's last successful setup command is remembered and prefilled for later roots, but it is never run without confirmation. Empty input skips setup and marks the root initialized.

If setup fails, the flow offers:

- edit and retry
- retry unchanged
- continue without setup
- cancel workspace creation

Only successful commands become repository defaults. An explicit continuation marks the root initialized while retaining failure information for diagnostics. Setup can be rerun or changed later from the picker.

## Managed worktrees

Managed worktrees live centrally under:

```text
~/.local/share/pi/worktrees/<repository-id>/<branch-slug>
```

The repository ID includes a short hash of the Git common-directory path to avoid collisions between repositories with the same name.

Creating a managed worktree:

1. Detects the remote default branch.
2. Fetches it with visible progress without pulling or mutating the primary checkout.
3. Always prompts for a base revision, prefilled with the latest remote default such as `origin/main`.
4. On fetch failure, offers the local default branch explicitly or cancellation.
5. Prompts for a branch.
6. Uses an available existing local branch or creates a new one from the confirmed base.
7. Creates a readable collision-safe worktree path.
8. Runs normal root setup before launching the workspace.

Worktree cleanup is always explicit. Before removal, the workflow shows associated sessions, dirty state, unpushed commits, merge status, and warm workspace usage. It refuses warm, dirty, or unpushed worktrees. No force-removal path exists initially.

## Nvim integration

Each workspace owns an optional nvim instance.

- `Ctrl-Space l` reveals or collapses the managed nvim pane.
- Nvim launches lazily on first reveal.
- The pane opens on the right at 50% width.
- Collapse parks the process rather than terminating it.
- Reveal restores its prior width and editor state.
- Existing tmux resize bindings preserve custom widths.
- Existing `Ctrl+h/j/k/l` navigation continues to work across tmux and nvim splits.
- `Ctrl-Space m` keeps its generic tmux zoom/unzoom behavior for the focused pane.
- `Ctrl-Space n/p` remain next/previous tmux-window bindings.

Showing the pane does not alter nvim buffers or Diffview. Diffview continues to be toggled manually with `<leader>gc`.

## Review comments

Nvim can append review comments to the owning Pi workspace without submitting them.

`<leader>lc` operates on:

- the current line in normal mode
- the selected range in visual mode

It opens a multiline `Snacks.win` editor. Normal-mode `Enter` submits the comment; insert-mode `Cmd+Enter` submits while plain `Enter` inserts a newline. Normal-mode `q` cancels.

A comment carries:

- workspace-relative path
- line or range
- selected content
- old/new revision side when applicable
- the written comment

Selected content is included so deleted Diffview lines remain meaningful. The workflow does not capture the full surrounding hunk.

Comments travel over a user-only workspace socket and append to one readable `Review comments` section in Pi's current input editor. Existing draft text is preserved. Submission does not send the Pi prompt or steal focus from nvim, allowing several comments to accumulate before review.

## Pi session replacement

A managed tmux window belongs permanently to one Pi session. Pi's normal in-process replacement flows would violate that invariant, so managed workspaces intercept them:

- `/resume` opens the workspace picker.
- `/new` opens the managed creation flow.
- `/fork` creates a new managed workspace while preserving the source workspace.
- `/clone` creates a new managed workspace while preserving the source workspace.

Raw Pi keeps its original behavior.

## Closing, archive, and deletion

### Close workspace

`Ctrl+W` terminates the managed runtime but retains an active, unarchived Pi session in the normal picker. This frees processes without declaring the work finished.

### Archive session

`Ctrl+A` archives only the selected session and closes its workspace. Archive state lives in manager metadata; Pi's session file is not moved or edited. Archived sessions are hidden by default but remain compatible with raw Pi.

Archival is manual only. A separately confirmed action can archive a selected session and all descendants. Restoration is per-session initially.

### Running agents

Closing or archiving a running workspace requires confirmation. On acceptance, the workflow requests graceful Pi shutdown, waits briefly, and then closes the tmux window. Rejection changes nothing.

### Trash session

Deletion is low-prominence and explicitly confirmed. It moves the Pi session file to macOS Trash rather than unlinking it, refuses running sessions, and never removes a worktree.

## Persistence and storage

Durable manager state is stored with Node's built-in SQLite support at:

```text
~/.local/state/pi-workspaces/state.db
```

It contains:

- repository and root identities
- Pi session metadata
- manual ordering
- archive and unread state
- root initialization
- remembered setup commands
- managed worktree records
- runtime registrations

Runtime sockets and ephemeral process data live in a user-only runtime directory. Startup reconciliation removes stale PIDs, tmux locations, sockets, and parking windows without losing Pi history or durable organization.

## Security and safety constraints

- Runtime sockets and state must be accessible only to the current OS account.
- Session previews must escape control characters and terminal sequences.
- Setup commands must always be confirmed before execution.
- The primary checkout must not be pulled or mutated during worktree creation.
- Active Pi session files must not have concurrent writers.
- Archive must not modify Pi session files.
- Session deletion and worktree removal must remain separate.
- Worktree removal must refuse known dirty, unpushed, or active roots.
- Recoverable manager failures must preserve Pi conversation history.

## Success criteria

The workflow is successful when:

- Switching a session switches the complete workspace and restores warm state immediately.
- Several agents can run in separate background workspaces without session corruption.
- Existing raw Pi sessions can be discovered and imported.
- Several sessions in one root retain independent Pi, nvim, and pane state.
- Worktrees of one repository are grouped together but run from their exact roots.
- New managed worktrees start from an explicitly confirmed latest base.
- Pi and nvim share the correct root environment and `.venv` when present.
- Nvim can collapse, restore, resize, and zoom without losing warm state.
- Line and visual review comments accumulate in Pi's draft without being sent.
- Running, unread, archive, and manual ordering state remain accurate.
- Crashes and restarts degrade stale workspaces to recoverable cold sessions.
- Raw `pi` remains available and unchanged.
