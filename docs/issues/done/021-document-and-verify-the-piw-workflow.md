# Document and verify the complete piw workflow
status: complete

The managed workflow spans Pi, tmux, fzf, Git worktrees, and nvim. Finish rollout with one concise operating guide and cross-feature verification so the fallback and persistence boundaries are clear.

## Requirements

- Document installation, `piw`, the dedicated `pi` tmux session, terminology, storage paths, setup reruns, archive/restore, Trash, worktree cleanup, and recovery.
- Document primary bindings near launcher instructions.
- Generate the `?` help reference from the same binding definitions used by the picker.
- Explain warm-switch persistence versus cold restart behavior.
- Preserve and document raw `pi` as the fallback.
- Run the end-to-end scenarios from the workflow spec and record any intentionally deferred behavior.

## Acceptance criteria

- [ ] A fresh shell can install dependencies and launch `piw` using only repository documentation.
- [ ] Documented keys match the live picker help.
- [ ] The full warm/cold, worktree, setup, nvim, comment, archive, and recovery smoke path passes.
- [ ] Raw `pi` remains usable independently.
- [ ] Deferred features are stated without implying they already work.

## References

Read [Pi Workspace Manager](../../pi-workspace-manager.md) before implementation. Treat its terminology, constraints, and non-goals as requirements.

- [Product spec success criteria](../../pi-workspace-manager.md#success-criteria) — defines the end-to-end outcomes.
- [Product spec non-goals](../../pi-workspace-manager.md#non-goals) — defines deferred behavior.
- Depends on [008](008-bootstrap-workspace-roots.md), [009](009-create-central-managed-worktrees.md), [011](011-append-nvim-review-comments-to-pi.md), [012](012-show-running-and-unread-session-state.md), [013](013-close-archive-and-restore-sessions.md), [015](015-reorder-projects-and-sessions.md), [016](016-preview-session-context.md), [017](017-archive-session-trees-and-trash-sessions.md), [018](018-remove-managed-worktrees-safely.md), [019](019-route-pi-session-replacement-through-workspaces.md), and [020](020-reconcile-cold-and-stale-workspaces.md).
