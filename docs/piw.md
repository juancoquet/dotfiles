# `piw` workspace manager

`piw` manages persistent Pi workspaces in one tmux session named `piw`. It leaves
raw `pi` unchanged: use raw `pi` for an ephemeral, scripted, or diagnostic
conversation; use `piw` when a conversation needs a persistent workspace.

## Install and launch

On macOS, install the runtime requirements, then install this repository:

```sh
brew install node tmux fzf neovim git
npm install -g @earendil-works/pi-coding-agent

git clone https://github.com/juancoquet/dotfiles.git ~/dotfiles
cd ~/dotfiles
npm ci
./install.sh
```

`install.sh` links `piw`, `piw-picker`, `piw-nvim`, and the Pi extension into
their runtime locations. Open a new shell if `~/.local/bin` was not already on
`PATH`, then run:

```sh
piw                 # reopen the most recently viewed warm workspace
piw .               # create a fresh workspace in this exact directory
piw path/to/project # create a fresh workspace rooted at that exact path
```

Inside tmux, `piw` switches the current client to `piw`; it never nests tmux.
Outside tmux, it attaches to (or creates) that session. Bare `piw` creates a
workspace when no Pi session exists, returns to a warm workspace when one
exists, or opens the picker when only cold sessions remain.

## Everyday use

Press `Ctrl-Space w` in tmux to open the workspace picker. The most common
picker keys are:

| Key | Action |
| --- | --- |
| `Enter` | Open or switch to the selected workspace |
| `Ctrl+O` | Create a workspace in the current root, another directory, an existing worktree, or a new managed worktree |
| `Ctrl+E` | Rename a session |
| `Ctrl+U` | Toggle unread |
| `Ctrl+/` | Toggle the preview |
| `Alt+j` / `Alt+k` | Move a session within its group |
| `Ctrl+W` | Close a warm workspace but retain its session |
| `Ctrl+A` / `Ctrl+R` | Archive / restore a session |
| `?` | Show the complete live key reference |

The `?` reference and fzf bindings are generated from the same picker binding
definitions. Clear any fuzzy filter before reordering sessions or groups.

In a workspace, `Ctrl-Space l` lazily opens or parks its right-hand nvim pane;
`Ctrl-Space m` zooms the focused tmux pane. Nvim's `<leader>gc` still controls
Diffview. `<leader>lc` writes a line or visual-range review comment into the
workspace's Pi draft without sending it.

A **workspace** is one Pi session plus its tmux window, optional nvim process,
exact root, and environment. A **warm** workspace has live processes and keeps
its editor, pane width, zoom, and running agent while another workspace is
visible. A **cold session** is saved Pi history with no managed window; opening
it creates a new workspace and nvim starts fresh when revealed. A **managed
worktree** is a centrally created Git worktree whose lifetime is independent of
its sessions.

## Setup, worktrees, and storage

Setup runs once per exact root. If `.venv` already exists, `piw` activates it
for both Pi and nvim. Otherwise it prompts for a setup command; empty input
marks the root initialized without setup. `Ctrl+S` reruns or changes setup for
the selected root. Commands are always confirmed before execution.

New managed worktrees are created under:

```text
~/.local/share/pi/worktrees/<repository-id>/<branch-slug>
```

The flow fetches without pulling the primary checkout, asks you to confirm the
base revision and branch, then runs normal root setup. `Ctrl+X` removes only a
managed worktree and refuses it when it is warm, dirty, unpushed, or not known
to be merged. It never deletes sessions as part of worktree cleanup.

Manager metadata is stored in `~/.local/state/pi-workspaces/state.db`.
Runtime registrations and sockets use a private per-account runtime directory
(`$XDG_RUNTIME_DIR/runtime` when `XDG_RUNTIME_DIR` is set, or
`/tmp/piw-<uid>/runtime` otherwise). Pi's JSONL session history stays
where Pi owns it.

## Archive, Trash, and recovery

Archive (`Ctrl+A`) hides a session and closes its workspace without changing
its Pi session file. `Ctrl+R` reveals archived sessions so one can be restored.
`Ctrl+Alt+A` archives a selected session and its descendants after confirmation.

`Ctrl+Alt+X` moves a **cold** session file to macOS Trash after confirmation.
It refuses running sessions and never removes a worktree. Closing or archiving
a running agent asks for confirmation and requests graceful shutdown first.

On a tmux-server or machine restart, live workspaces become cold. On its next
startup `piw` reconciles stale PIDs, tmux locations, sockets, and parking
windows while retaining session history and ordering. Select the cold session
to recover it. If a session is active in another Pi process, `piw` switches to
its known tmux location or refuses to open a second writer.

## Verification

Run the manager's automated smoke suite after changes:

```sh
npm test
npm run typecheck
```

The suite covers the warm/cold launch boundary, root setup, managed worktree
safety, lazy nvim lifecycle and review comments, archive/restore/Trash,
runtime reconciliation, picker actions, and raw-session import. For an
interactive smoke check, create two workspaces in one root, switch between
them while one agent runs, reveal and park nvim, append a review comment,
archive and restore one session, then restart tmux and reopen its cold session.
Finally run `pi` directly in another directory; it remains independent of
`piw`.

## Deliberately deferred

`piw` does not embed a terminal or nvim in Pi's TUI, replace Pi chat rendering,
change raw `pi`, auto-archive sessions, remove worktrees on archive/deletion,
or force-open a session with an unknown active owner. It does not restore exact
nvim buffers after a restart, capture complete diff hunks for comments, send OS
notifications, or provide a compound nvim reveal/focus/fullscreen command.
