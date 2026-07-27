# Reconcile stale runtime state after crashes and restarts
status: complete

Warm switching preserves exact process state only while tmux lives. After crashes or reboot, the manager must degrade to cold sessions cleanly instead of pointing at dead windows, PIDs, panes, or sockets.

## Requirements

- Reconcile runtime rows, PIDs, tmux windows, parking panes, and sockets at launcher and picker startup.
- Treat all unrecoverable prior workspaces as cold while preserving Pi history and durable metadata.
- Recreate Pi lazily when selected and nvim lazily when revealed.
- Restore recorded pane preferences where available, but start nvim with fresh buffers after a cold restart.
- Clean orphaned implementation-only parking windows.
- Do not promise exact post-reboot nvim session restoration.

## Acceptance criteria

- [ ] Killing Pi, nvim, a workspace window, or the tmux server leaves no permanently warm state.
- [ ] After restart, selecting a prior session resumes Pi without duplicate writers.
- [ ] First nvim reveal after restart starts fresh in the correct root/environment.
- [ ] Durable archive, unread, ordering, initialization, and setup-command state survives.
- [ ] Reconciliation is idempotent.

## References

Read [Pi Workspace Manager](../../pi-workspace-manager.md) before implementation. Treat its terminology, constraints, and non-goals as requirements.

- [Product spec](../../pi-workspace-manager.md#persistence-and-storage) — defines the cold-restoration boundary.
- Depends on [003](003-register-live-pi-processes.md), [006](006-switch-and-import-pi-workspaces.md), and [010](010-toggle-a-lazy-nvim-pane.md).
