# Preview session and repository context in the picker
status: complete

Names alone are insufficient when several sessions discuss similar work. Add a responsive preview that helps identify a session without opening it or slowing basic filtering.

## Requirements

- Show full name/root, branch and worktree path, last activity, Git dirty state, recent user/assistant excerpts, and parent/fork relationship.
- Load preview data without blocking the main list.
- Toggle the preview through a documented binding.
- Hide it automatically on narrow terminals.
- Escape control characters and avoid rendering raw terminal sequences from session text.
- Handle missing roots and unreadable Git/session data gracefully.

## Acceptance criteria

- [ ] Moving selection updates preview to the highlighted session.
- [ ] Large sessions do not noticeably block picker startup.
- [ ] Narrow terminals remain usable without truncated-list collapse.
- [ ] Session content cannot inject terminal control sequences.
- [ ] Missing repositories show useful session metadata instead of failing.

## References

Read [Pi Workspace Manager](../../pi-workspace-manager.md) before implementation. Treat its terminology, constraints, and non-goals as requirements.

- [Product spec](../../pi-workspace-manager.md#preview-and-help) — defines preview content and responsive behavior.
- Depends on [002](002-catalog-existing-pi-sessions.md) and [005](005-show-grouped-workspace-picker.md).
