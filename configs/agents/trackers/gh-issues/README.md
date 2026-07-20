# GitHub Issues prime

This directory is the canonical, reusable source for priming agent sessions in
repositories that use GitHub Issues. Installing the dotfiles does not activate
it globally: each repository opts in with its own harness wiring.

`gh-issues-context.md` is the only instructional payload. `gh-issues-prime`
emits it as plain text for Claude Code, Codex, and OpenCode, or as Cursor's
`additional_context` JSON shape with `--cursor`.

## Repository setup

1. Copy this directory into the target repository as `.agents/gh-issues/`.
2. Create the type, status, and priority labels enumerated in
   `gh-issues-context.md`. Their names and meanings are part of the workflow
   contract; colors are presentation-only.
3. Confirm that `gh auth status` succeeds.
4. Add the repo-local wiring for every harness used in the repository.

The command used by Claude Code, Codex, and OpenCode is:

```text
sh .agents/gh-issues/gh-issues-prime
```

Cursor uses:

```text
sh .agents/gh-issues/gh-issues-prime --cursor
```

## Harness wiring

| Harness | Project configuration | Lifecycle wiring |
| --- | --- | --- |
| Claude Code | `.claude/settings.json` | Run the plain command on `SessionStart` for `startup`, `resume`, `clear`, and `compact`. |
| Codex | `.codex/hooks.json` | Run the plain command on `SessionStart` for `startup`, `resume`, `clear`, and `compact`; review and trust it with `/hooks`. |
| OpenCode | `.opencode/plugins/gh-issues-prime.ts` | Load the plain output once, add it through `experimental.chat.system.transform`, and preserve it through `experimental.session.compacting`. |
| Cursor | `.cursor/hooks.json` | Run the Cursor command from `sessionStart`. |

This repository's [.claude settings](../../../../.claude/settings.json),
[.codex hooks](../../../../.codex/hooks.json),
[OpenCode plugin](../../../../.opencode/plugins/gh-issues-prime.ts), and
[Cursor hooks](../../../../.cursor/hooks.json) are the maintained reference
implementations. Copy the relevant wiring and change only the command path when
installing the package elsewhere.

## Validation

Run the package check after changing the payload or wiring:

```bash
.agents/gh-issues/check
```

When editing the canonical dotfiles copy, use:

```bash
configs/agents/trackers/gh-issues/check
configs/agents/scripts/check
```
