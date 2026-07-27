# Route Pi session replacement through managed workspaces
status: complete

Pi's in-process `/resume`, `/new`, `/fork`, and `/clone` replace the current session, which would attach one window and nvim state to the wrong identity. Intercept these flows only in managed workspaces and preserve one session per window.

## Requirements

- Route `/resume` to the managed workspace picker.
- Route `/new` to the unified `Ctrl+N` creation flow.
- Make `/fork` and `/clone` create separate managed windows while leaving the source process/window/editor intact.
- Preserve the chosen fork/clone point and Pi parent relationship.
- Leave all four commands unchanged in raw Pi.
- Never silently transfer a managed window to another session identity.

## Acceptance criteria

- [x] Managed `/resume` cannot replace the current workspace's session.
- [x] Managed `/new` produces an independent window.
- [x] Managed fork/clone preserve the original workspace and create valid Pi history relationships.
- [x] Cancellation leaves the source workspace untouched.
- [x] Raw Pi retains its standard command behavior.

## References

Read [Pi Workspace Manager](../../pi-workspace-manager.md) before implementation. Treat its terminology, constraints, and non-goals as requirements.

- [Product spec](../../pi-workspace-manager.md#pi-session-replacement) — defines the immutable session/window association.
- Depends on [006](006-switch-and-import-pi-workspaces.md) and [007](007-create-workspace-in-an-existing-directory.md).
