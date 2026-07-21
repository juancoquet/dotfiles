---
name: pr-open
description: Open a pull request for the current branch. Prefers repo-local PR conventions, links the pertinent issue, and checks off its acceptance criteria on the issue itself before opening. Use when asked to open, raise, or create a PR for work that is ready. Invoke as `/pr-open`.
argument-hint: "[base-branch]"
---

# Opening a Pull Request

Turn the current branch into a PR a reviewer can act on cold, and leave the
linked issue in an honest state.

## 1. Prefer repo-local conventions

First, find how this repo wants PRs opened: a pull-request template
(`.github/`, `.gitlab/`), `CONTRIBUTING.md`, root or nested `AGENTS.md` /
`CLAUDE.md`, or a repo-local PR skill. Where any of these speak to something
below — title format, body sections, labels, the linking keyword, review
process — follow them over the defaults in this skill.

## 2. Resolve the base

Use a base branch I supply; otherwise the default branch from
`refs/remotes/origin/HEAD`. Stop if the current branch is the default branch,
or has no commits the base lacks. Read the diff so what follows describes the
branch, not the issue's assumptions.

## 3. Find the issue

Best-effort: look for the issue this branch implements in the branch name,
commit messages, and anything I've said this session. If nothing points
clearly to one, open the PR without a link rather than guessing at one.

## 4. Reconcile acceptance criteria — on the issue

If step 3 identified an issue, then before composing the PR check each
criterion against the diff and mark the satisfied ones done on the issue
itself, in whatever tracker holds it, fixing any stale wording. Never mark a criterion the branch does not satisfy: an
unmet one means the PR holds, opens as a draft, or descopes that criterion to
a follow-up — my call.

## 5. Compose and create

- **Title:** concise and imperative. **Body:** what changed, why, and how it
  was verified.
- Link the issue using the tracker's convention — a closing reference (e.g.
  `Closes #123`, `Fixes ENG-123`) for work that completes it, a plain
  reference otherwise.
- Never add `Co-Authored-By` or other AI-attribution trailers to pull request
  descriptions. This includes "🤖 Generated with Claude Code", or any other
  line that harnesses append by default — omit it.
