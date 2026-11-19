---
name: write-review-guide
description: Write a short review guide for a pull request — the order to read its files in, with one line of context per step — so a human reviewer builds understanding as they go. Callable by another skill, such as `pr-open`, or by me via `/write-review-guide`. Use when I ask for a review guide, reading order, or review walkthrough for a branch or PR.
argument-hint: "[base-branch | pr-number]"
---

# Writing a Review Guide

A review guide tells a reviewer which file to read first, what comes next, and
why. It gives only what the diff cannot: the order and the context. Keep it
short.

Return the guide as Markdown. When another skill calls you, hand it back for
that skill to place; never open, edit, or comment on a PR yourself. When I
invoke you directly, show me the guide.

## 1. Read the change

Diff against the base I supply, a PR's base (`gh pr view <n> --json
baseRefName`), or the default branch from `refs/remotes/origin/HEAD`. Read
`git log <base>..HEAD` and the full `git diff <base>...HEAD`. Know what each
file contributes to the change before ordering it.

## 2. Order the files

Order for understanding, not by directory or diff order:

1. Where the intent is clearest: the contract, schema, type, or interface the
   change introduces — or the test that states the new behaviour, when that
   explains it best.
2. The core logic that implements it.
3. Callers, wiring, and configuration that apply it.
4. Remaining tests.

Put dependencies before dependents and tightly coupled files in one step. Aim
for three to seven steps; past that, group files.

Every changed file appears exactly once, in a step or on the skim line. A glob
may stand in for a group.

## 3. Write it

```markdown
## Review guide

1. `api/schema/invoice.py` — adds nullable `due_date`, so existing invoices stay valid.
2. `billing/overdue.py` — the overdue rule. The grace period is a constant, not config; worth agreeing on.
3. `billing/jobs.py`, `config/schedule.yaml` — nightly job that applies the rule.
4. `tests/billing/test_overdue.py` — edge cases at the grace-period boundary.

Skim: `api/schema/invoice.gen.ts` (generated from the schema), `poetry.lock`.
```

- One line per step, at most about 20 words: what the files contribute and,
  where it matters, the one thing to scrutinise — a decision with a real
  alternative, something you are unsure of, or a wide blast radius.
- The skim line holds generated code, lockfiles, snapshots, and mechanical
  renames or moves. Drop it when nothing qualifies.
- Do not summarise the PR, restate the diff, or explain how to review code.
- With only one or two meaningful files, replace the list with one sentence
  naming where to start and what to look at.
- Use the heading `## Review guide` unless the caller or the repo's PR template
  names another.
