---
name: cleanup
description: Remove stale local branches and worktrees. Manual-invoke only. Local-only by default; pass an argument to also prune and clean up remote-tracking branches.
disable-model-invocation: true
argument-hint: "[remote]"
---

# Cleanup Branches and Worktrees

Remove local branches and worktrees that no longer serve a purpose. This
touches repository state (deletes branches, removes worktrees), so always
list candidates and get explicit confirmation before acting — never delete
or force anything unconfirmed.

## 1. Determine Scope

No argument: local-only. Do not run `git fetch` and do not touch anything on
any remote.

Any argument passed (the conventional value is `remote`): also sync with the
remote and include remote-branch cleanup in the candidate set, per step 5.

## 2. Resolve Repository Context

Confirm this is a git repository. Determine the default/base branch the same
way the `review` skill does: prefer `refs/remotes/origin/HEAD`, falling back
to inspecting the repository for a conventional base (`main`, `master`,
`development`). Note the current branch and current worktree path — never
touch either.

## 3. Find Stale Worktrees

List all worktrees (`git worktree list --porcelain`).

- Administrative entries whose directory no longer exists are always safe to
  clear: preview with `git worktree prune --dry-run`, then run
  `git worktree prune`.
- For worktrees whose directory still exists, flag one as a removal
  candidate only when its checked-out branch is merged into the base branch
  (or already deleted) **and** the worktree is clean: no uncommitted changes
  (`git -C <path> status --porcelain`) and no unpushed commits when it has an
  upstream (`git -C <path> log @{u}..HEAD`).
- Never remove a worktree that has uncommitted changes or unpushed commits
  without calling that out explicitly and getting confirmation for that
  specific worktree.

## 4. Find Stale Local Branches

Enumerate local branches (`git branch -vv`). Exclude the current branch, the
default/base branch, and any branch checked out in another worktree (git
refuses to delete these anyway, but skip them without comment).

Group remaining candidates by evidence:

- **Merged:** branches merged into the base branch (`git branch --merged
  <base>`). Safe to delete with `git branch -d`.
- **Upstream gone:** branches whose tracked upstream was deleted (`git branch
  -vv | grep ': gone]'`) — typical after a squash-merged PR, since git does
  not see these as merged locally. Deleting these needs `-D` (force). Where
  the `gh` CLI and a GitHub remote are available, cross-check
  `gh pr list --state merged --head <branch>` to confirm the branch's PR
  actually merged, rather than the branch simply being deleted for other
  reasons.

## 5. Remote Scope (only when an argument was passed)

Fetch with prune (e.g. `git fetch --prune origin`) to refresh
remote-tracking branches. Identify remote branches on `origin` merged into
origin's default branch, excluding the default branch itself.

Deleting a remote branch changes shared state other people can see. Always
confirm explicitly, per branch or as a reviewed batch, before running
`git push origin --delete <branch>`.

## 6. Confirm Before Deleting

Present the full candidate list — branches to delete, worktrees to remove —
grouped by evidence (merged / upstream-gone / missing-directory), before
touching anything. Wait for explicit confirmation.

Never force a deletion (`-D`, or `worktree remove --force`) without calling
out, for that specific item, that it has unmerged or uncommitted content and
getting confirmation for it.

## 7. Report

After acting, list what was removed and what was deliberately left in place
(dirty worktrees, unmerged branches with no gone upstream, anything the user
declined), so there's a clear record of the outcome.
