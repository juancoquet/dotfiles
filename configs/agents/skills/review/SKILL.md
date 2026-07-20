---
name: review
description: Review the current branch or working tree against its base branch. Use when asked to review changes, identify regressions, or assess whether work is ready to merge.
---

# Review Code Changes

Review all changes in the current working state relative to an appropriate base
branch. Report actionable findings; do not modify files.

## 1. Resolve the Base

Use a base branch supplied by the user. Otherwise, determine the repository's
default branch from `refs/remotes/origin/HEAD`. If that is unavailable, inspect
the repository and choose the first applicable conventional base such as
`main`, `master`, or `development`. State the chosen base when it is not obvious.

Find the merge base between that branch and `HEAD`. Compare the merge base to
the working tree so the review includes committed, staged, and unstaged changes.
Also inspect the branch's commits and changed-file list.

If the repository has no commits or no merge base exists, use the empty tree as
the base and review all staged, unstaged, and untracked files.

Read every changed file in full where needed to understand context beyond the
diff hunks. Include relevant tests and callers when a local change could affect
behaviour elsewhere.

## 2. Discover Applicable Guidance

Find and read review or engineering guidance that applies to the changed files.
This may include root or nested `AGENTS.md` and `CLAUDE.md` files,
`CONTRIBUTING.md`, scoped Cursor rules, architecture documentation, and review
configuration such as `.greptile/rules.md` or `.greptile/config.json`.

Use optional guidance only when it exists. Respect its scope and precedence.
When reporting a violation, cite its rule identifier when one is defined.

## 3. Review the Changes

Prioritise concrete defects and regressions:

- incorrect behaviour, edge cases, and broken invariants
- data loss, security, privacy, concurrency, and reliability risks
- incompatible API, schema, migration, or configuration changes
- missing or ineffective tests for changed behaviour
- violations of applicable repository guidance

Distinguish defects introduced by the changes from pre-existing issues. Do not
inflate the review with style preferences that are not required by repository
guidance. Verify each finding against the surrounding code and include a
specific remediation direction.

## 4. Report Findings

If a more specific output contract follows this procedure, it replaces this
section.

Put findings first, ordered by severity and then file path. Each finding must
include:

- severity (`high` or `medium`)
- repository-relative file path and line number
- applicable rule identifier, when one exists
- a concise explanation of the failure and how to address it

If there are no findings, say so explicitly. Mention remaining test gaps or
residual risks after the findings, not in place of them.
