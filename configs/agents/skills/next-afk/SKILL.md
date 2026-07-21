---
name: next-afk
description: Decide what work should be done next while I am away from the keyboard — a low-risk, self-contained item an agent can complete end to end without my input. Use when I ask for AFK work, unattended work, or something safe to hand to an autonomous agent.
---

# Choose the Next Piece of AFK Work

Survey the configured issue tracker and recommend one item an agent can start
and finish autonomously, with no clarification from me, no product or design
judgement, and a small, reversible blast radius. This is `[[next]]` with a
different lens: I am away, so the decisive question is not "what is most
important" but "what can be safely completed unattended and would otherwise
languish."

Deliberately favour small, low-priority, well-specified work. A simple task or a
clearly reproducible bug that keeps getting skipped because it is not urgent is
exactly the point: if it is safe to do and would otherwise not get done, picking
it up is a win.

Remain read-only: never create, claim, edit, close, or reprioritise work. Report
suspected metadata problems and offer to fix them instead of changing them
unprompted.

## 1. Establish the Tracker Contract

Identify the repository's canonical tracker from primed session context and
repository instructions. Follow that tracker's documented workflow, field
semantics, and relationship semantics. Use its available integration and
built-in help when query syntax or capabilities are unclear.

Do not combine multiple backlogs. If the canonical tracker is ambiguous or its
data is unavailable, explain the ambiguity or failure and stop without making a
recommendation.

Translate provider data into these concepts without requiring identical names:

- **Candidate:** open work in a startable state, of a workable type, with no
  unresolved blocker.
- **Container:** an epic, project, initiative, milestone, or other grouping that
  supplies context but is not itself directly workable.
- **Priority:** the tracker's ordered urgency levels. Here priority is a weak
  signal — low priority does not disqualify a candidate. Keep explicitly
  deferred work visible but do not recommend it while other work is viable.
- **Relationships:** blockers, work unblocked by completion, parent or container
  membership, and any declared sequence.

## 2. Gather Startable Candidates

Find every unblocked item in the tracker's startable state whose type represents
work rather than a container. Read each candidate's full description, not just
its title. Load the relevant parents, dependencies, and referenced sibling items
needed to judge scope and safety.

Prefer types that tend to be self-contained — concrete tasks and small, clearly
reproducible bugs — but let the autonomy assessment in the next step decide, not
the type label alone. Exclude closed or terminal work, blocked work, and
containers from the candidate set; use containers and completed dependencies as
context.

If metadata appears stale or contradictory, keep the item visible with a clear
warning rather than silently repairing or discarding it.

## 3. Assess Autonomy-Safety

This is the core of the skill. Judge each candidate against the bar for
unattended work and keep only those that clearly clear it.

A candidate **qualifies** only when all of these hold:

- **Unambiguous done condition.** The acceptance criteria, or the description,
  make it objectively checkable when the work is complete.
- **No input from me required.** It needs no product, design, UX, or business
  judgement, no decision only I can make, and no information only I hold.
- **Self-verifiable.** An agent can prove correctness on its own — existing
  tests, or tests it can write (including a red-green reproduction for a bug) —
  without manual QA, visual approval, or my sign-off.
- **Small, contained scope.** A localised, reversible change, not open-ended or
  exploratory work spanning many modules.
- **Low blast radius.** It stays clear of destructive, security-sensitive, or
  hard-to-reverse surfaces — data migrations, deletions, auth, billing,
  infrastructure, releases, and public-facing content.

A candidate is **disqualified** if any of these apply:

- Requirements are absent, vague, or contradictory, or the goal is stated but
  the approach is genuinely open.
- It asks a question, proposes options, or otherwise expects a decision.
- Completion can only be judged by a human looking at the result.
- It requires coordination with people or external services, or an approval.
- The scope is large, unbounded, or likely to grow once started.

When a candidate is close to the bar, treat the ambiguity as disqualifying: the
cost of a wrong autonomous change outweighs clearing one more backlog item. Do
not lower the bar just to have something to recommend.

## 4. Rank the Qualified Candidates

Among candidates that clear the autonomy bar, apply these criteria in descending
weight:

1. **Confidence.** Prefer the item whose scope, done condition, and verification
   path are clearest — the one least likely to surprise an unattended agent.
2. **Smallness.** Prefer the smaller, more contained change.
3. **Bugs before tasks.** At equal confidence, restoring clearly broken
   behaviour beats other work.
4. **Neglect.** Prefer work that would otherwise not get done — low priority or
   long untouched — since clearing it is this skill's whole value.
5. **Unblocking power.** All else close, prefer work whose completion unlocks
   other work.

Explicit priority is only a mild tiebreak here and never a filter: do not skip a
safe, simple, low-priority item in favour of a riskier higher-priority one. Use
judgement rather than a numeric score; when candidates are close, name the
trade-off that separates them.

## 5. Report the Decision

Produce exactly these sections.

### Candidates

Show the best AFK-suitable candidates first in a Markdown table:

| ID | Title | Type | Scope | Verify | Priority | Summary |
|---|---|---|---|---|---|---|

**Scope** is your one-word read of size (`tiny`, `small`, `medium`). **Verify**
states how an agent would prove the work correct (e.g. `existing tests`,
`new test`, `repro test`). Use the tracker-visible priority, writing `normal`
when absent. Keep summaries to one or two sentences grounded in the full
description, noting the done condition.

Cap the table at about ten rows. In one short paragraph, summarise the count and
shape of qualified work omitted for space.

### Excluded as not AFK-safe

Briefly list notable candidates you rejected and the single reason each failed
the autonomy bar (e.g. "needs a design decision", "no checkable done
condition", "touches auth"). This makes the filter's judgement auditable. Write
`None worth noting.` when there is nothing instructive to report.

### Recommendation

Name exactly one item to pick up. In a short paragraph, justify it against the
autonomy bar — why its done condition is unambiguous, how an agent would verify
it, and why its blast radius is small — then the ranking evidence that put it
first. Mention one runner-up only when the choice is genuinely close, including
what would change the decision.

If nothing clears the bar, say so plainly and recommend against unattended work
rather than lowering the bar. End by offering to pick up the recommended work.
