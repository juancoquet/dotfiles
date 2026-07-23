---
name: pickup-afk
description: Pick up an issue and work it end to end while I am away from the keyboard. Manual-invoke only. Gains full context — related issues, README, relevant code, docs, links — then, once the work is understood, claims the issue and implements it autonomously without waiting for me. Stops and reports instead of guessing when the issue genuinely needs my input. Invoke as `/pickup-afk <issue-id>`.
argument-hint: "[issue-id]"
disable-model-invocation: true
---

# Picking Up an Issue to Work Unattended

Given an issue ID, gain full context on the work and then carry it out end to
end. Unlike `/pickup`, which briefs back and stops for a design conversation,
this skill assumes I am away: once you understand the issue you start the work
yourself, rather than waiting for me to weigh in. The trade for that autonomy is
a hard rule — where the work genuinely needs my judgement, stop and leave a
clear report instead of guessing.

If no issue ID was given, say so and stop. Do not choose an issue yourself —
selecting unattended work from the backlog is `next-afk`'s job; this skill works
the one issue I hand it.

## 1. Gain Full Context

Read and follow the shared context contract in
[CONTEXT-CONTRACT.md](../pickup-common/CONTEXT-CONTRACT.md): identify the
canonical tracker, fetch and read the issue in full, follow the context graph
(related issues, links, docs, code, history), and verify the issue's claims
against the current state of the repo. The gaps and discrepancies it surfaces
feed directly into the safety check below.

## 2. Confirm It's Safe to Work Unattended

Before touching anything, judge whether this specific issue can be completed
without me in the loop. This is the same bar `next-afk` applies when it selects
work; here you apply it to the one issue you were handed, using the context you
just gathered.

Proceed only when all of these hold:

- **Unambiguous done condition.** The acceptance criteria or description make it
  objectively checkable when the work is complete.
- **No input from me required.** It needs no product, design, UX, or business
  judgement, no decision only I can make, and no information only I hold.
- **Self-verifiable.** You can prove correctness on your own — existing tests,
  or tests you write (including a red-green reproduction for a bug) — without
  manual QA, visual approval, or my sign-off.
- **Small, contained scope.** A localised, reversible change, not open-ended or
  exploratory work spanning many modules.
- **Low blast radius.** It stays clear of destructive, security-sensitive, or
  hard-to-reverse surfaces — data migrations, deletions, auth, billing,
  infrastructure, releases, and public-facing content.

Stop and report instead of proceeding when any of these apply: requirements are
absent, vague, or contradictory; the approach is genuinely open; the issue asks
a question or expects a decision; completion can only be judged by a human
looking at the result; the context-gathering showed the issue is stale, should
be split, or should be re-scoped. When a case is close to the bar, treat the
ambiguity as disqualifying — the cost of a wrong unattended change outweighs
finishing one more issue. In every stop case, leave a short note on the issue's
findings and the decision it needs, and do not change the code.

## 3. Start the Work

Once the issue clears the bar, work it end to end following the repository's
tracker workflow and my global engineering rules:

- **Claim it.** Per the tracker's documented workflow, self-assign the issue,
  move it to its in-progress status, and work on a linked branch named for the
  issue. (If a `/pickup` briefing already moved it into progress, continue on
  that branch.)
- **Implement.** Make the change guided by the acceptance criteria and the
  context you gathered. For bugs, follow red-green-refactor: write a failing
  test that reproduces the bug, confirm it fails for the expected reason, make
  the minimal change that passes, then refactor. Keep unrelated work out of
  scope — open a linked follow-up issue instead.
- **Verify.** Run the repository's configured formatting, linting,
  static-analysis, and test commands, and fix every diagnostic related to the
  work. Update generated artifacts when source changes affect them. Do not
  consider the work done until verification passes.
- **Follow through.** Reference the issue number in commits, keep the
  acceptance-criteria checkboxes current, and open a pull request that closes
  the issue, following the repo's PR conventions. Record any decision or
  scope change a future reader would need.

If you hit a genuine blocker or a decision only I can make partway through,
stop, leave the work in a clean state, and report what you did, what remains,
and the decision you need — the same discipline as the safety gate, applied
mid-flight.

## Boundaries

- Work only the issue you were given; spin off anything out of scope as a
  linked follow-up rather than folding it in.
- The autonomy bar is not negotiable to make an issue actionable. When in
  doubt, stop and report — a clear handoff beats a wrong unattended change.
