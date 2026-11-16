---
name: implement
description: >-
  Implement a prior agreed-upon plan or design. Builds a todo list ahead of
  time, implements without re-opening settled decisions, then runs Bugbot and
  addresses valid findings using best judgement. Use when I say /implement or
  ask to implement an agreed design or plan.
disable-model-invocation: true
---

# Implement an Agreed Design

Implements a prior agreed-upon plan, and finally runs Bugbot. Builds a todo
list ahead of time, ending with running Bugbot and addressing flagged issues
when valid, using best judgement.

This skill does **not** design. If there is no agreed plan in the conversation
(or a plan I explicitly point at), stop and say so — use `/grill-me` or finish
design first.

## 1. Lock the plan

Restate the agreed plan in a few bullets (scope in, scope out, key decisions).
If anything material is still open, ask once; do not invent a decision that was
never settled.

## 2. Todo list first

Before writing code, create a todo list that covers the whole job. Put
implementation and verification items first. **End the list with:**

1. Run Bugbot (`/review-bugbot`)
2. Address valid Bugbot findings (best judgement)

Do not start implementation until that list exists.

## 3. Implement

Work the todos in order. Follow the agreed plan and the repository's ordinary
engineering rules (tests, `make check` / project equivalents, British spelling
where the project requires it, focused diffs).

- Do not re-open settled design choices.
- Do not expand scope; park extras as follow-ups.
- Load project-specific skills when the change touches their area (e.g. Strallis
  `python-guide-strallis`, `software-design-strallis`, `docstrings`).

## 4. Verify

Run the repository's configured formatting, lint, typecheck, and relevant
tests. Fix diagnostics caused by this work before Bugbot.

## 5. Bugbot, then fix what earns it

Run `/review-bugbot` on the branch changes (default). Follow the
`review-bugbot` skill.

Then address flagged issues **when valid**, using best judgement:

- Fix clear bugs and clear guide violations that the plan or house rules care
  about.
- Skip noise, taste nits, and findings that re-litigate what lint/`make check`
  already owns — note those briefly if useful.
- Re-run Bugbot only if a fix was substantial enough to warrant it; otherwise
  stop after addressing the valid set.

## 6. Hand back

Briefly say what shipped, what Bugbot found, what you fixed or skipped, and
anything still open. Do not open a PR unless I ask (use `/pr-open` when I do).
