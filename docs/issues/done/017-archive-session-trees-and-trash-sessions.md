# Archive descendant trees and trash sessions safely
status: complete

Single-session archive handles routine cleanup, but abandoned forks sometimes need bulk archival and obsolete history sometimes needs deletion. Add both as low-prominence, explicitly confirmed picker operations.

## Requirements

- Add a direct archive-tree action documented in `?`.
- Show the affected descendant count and require confirmation before archiving the selected session tree.
- Keep restoration per-session; do not add tree restoration initially.
- Add a low-prominence direct trash action documented in `?`.
- Move session files to macOS Trash rather than unlinking them.
- Confirm trash with full session name and root.
- Refuse trash while the session is running.
- Never remove a worktree through either action.

## Acceptance criteria

- [ ] Single-session archive still affects no descendants.
- [ ] Confirmed tree archive hides exactly the selected session and descendants.
- [ ] Cancelled tree archive changes nothing.
- [ ] Trash removes a cold session from Pi discovery through recoverable macOS Trash.
- [ ] Running, current, or otherwise unsafe trash attempts are refused clearly.

## References

Read [Pi Workspace Manager](../../pi-workspace-manager.md) before implementation. Treat its terminology, constraints, and non-goals as requirements.

- [Product spec](../../pi-workspace-manager.md#closing-archive-and-deletion) — defines tree archive and Trash safeguards.
- Depends on [013](013-close-archive-and-restore-sessions.md).
