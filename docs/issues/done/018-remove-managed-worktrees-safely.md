# Remove managed worktrees only after safety checks
status: complete

Managed worktrees outlive individual Pi sessions and will otherwise accumulate indefinitely. Add explicit cleanup that reports risk and never treats session archive as permission to delete repository state.

## Requirements

- Add a direct cleanup action documented in `?`.
- Limit the action to worktrees managed under the central directory.
- Before confirmation, show associated Pi sessions, dirty state, unpushed commits, merge status, and warm workspace usage.
- Refuse removal while any warm workspace uses the root.
- Refuse dirty or unpushed removal; do not add force removal initially.
- Remove through `git worktree` and prune stale metadata only after successful deletion.
- Never delete associated Pi session history.

## Acceptance criteria

- [ ] A clean, unused, safely merged managed worktree can be removed explicitly.
- [ ] Dirty, unpushed, and warm worktrees are refused with the reason shown.
- [ ] Unmanaged worktrees are never offered for deletion.
- [ ] Session records remain resumable after worktree removal, with missing-root state represented clearly.
- [ ] Failed removal leaves registry and Git metadata reconcilable.

## References

Read [Pi Workspace Manager](../../pi-workspace-manager.md) before implementation. Treat its terminology, constraints, and non-goals as requirements.

- [Product spec](../../pi-workspace-manager.md#managed-worktrees) — keeps worktree lifetime independent.
- Depends on [009](009-create-central-managed-worktrees.md) and [013](013-close-archive-and-restore-sessions.md).
