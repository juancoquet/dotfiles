---
name: next
description: Decide what work should be done next from a repository's configured issue tracker. Use when I ask what to work on next, request backlog triage or prioritisation, or want one concrete recommendation from the currently available work.
---

# Choose the Next Piece of Work

Survey the configured issue tracker, rank work that can actually be started, and
recommend one item. Remain read-only: never create, claim, edit, close, or
reprioritise work. Report suspected metadata problems and offer to fix them
instead of changing them unprompted.

## 1. Establish the Tracker Contract

Identify the repository's canonical tracker from primed session context and
repository instructions. Follow that tracker's documented workflow, field
semantics, and relationship semantics. Use its available integration and
built-in help when query syntax or capabilities are unclear.

Do not combine multiple backlogs. If the canonical tracker is ambiguous or its
data is unavailable, explain the ambiguity or failure and stop without making a
recommendation.

Translate provider data into these concepts without requiring identical names:

- **In progress:** open work already claimed or actively underway.
- **Candidate:** open work in a startable state, of a workable type, with no
  unresolved blocker.
- **Container:** an epic, project, initiative, milestone, or other grouping that
  supplies context but is not itself directly workable.
- **Priority:** the tracker's ordered urgency levels. Treat an absent priority as
  normal unless the tracker contract says otherwise; keep explicitly deferred
  work visible but do not recommend it while other work is viable.
- **Relationships:** blockers, work unblocked by completion, parent or container
  membership, and any declared sequence.

## 2. Inspect Work Already in Progress

Find all in-progress work first and read each item's full description. Include
linked development work when the tracker exposes it. Finishing viable work
usually beats starting something new, so recommend finishing it unless it is
blocked, stalled, or explicitly deprioritised. State the evidence when starting
fresh is preferable.

## 3. Gather Startable Candidates

Find every unblocked item in the tracker's startable state whose type represents
work rather than a container. Read each candidate's full description, not just
its title. Load the relevant parents, dependencies, dependants, and referenced
sibling items needed to understand scope and ordering.

Exclude closed or otherwise terminal work, blocked work, and containers from the
candidate set. Use containers and completed dependencies as context for ranking.
If metadata appears stale or contradictory, keep the item visible with a clear
warning rather than silently repairing or discarding it.

## 4. Gather Momentum Context

Inspect recent repository history and recently completed tracker work. Use this
only to distinguish otherwise similar candidates: momentum must not override an
explicit priority or a dependency chain.

## 5. Rank the Candidates

Apply these criteria in descending weight:

1. **Explicit priority:** preserve the tracker's ordering from most urgent to
   least urgent.
2. **Unblocking power:** prefer work whose completion unlocks more downstream
   work, including transitively.
3. **Sequence:** follow declared ordering within the same container or workstream.
4. **Bugs before features:** at equal priority, restore broken behaviour before
   adding new capability.
5. **Momentum:** all else being close, continue the active workstream instead of
   paying for a context switch.

Use judgement rather than inventing a numeric score. When candidates are close,
say what trade-off separates them.

## 6. Report the Decision

Produce exactly these sections.

### In progress

List each in-progress item with its identifier, title, and whether it appears
viable, blocked, or stalled. Write `Nothing in progress.` when empty.

### Candidates

Show the best candidates first in a Markdown table:

| ID | Title | Type | Priority | Unblocks | Parent | Summary |
|---|---|---|---|---|---|---|

Use the tracker-visible priority, writing `normal` when it is absent unless the
tracker contract defines another default. Show direct identifiers in
**Unblocks**, or `—`; mention additional transitive impact in the summary. Use
the closest relevant container in **Parent**, or `—`.

Keep summaries to one or two sentences grounded in the full item description.
Cap the table at about ten rows, but always show every item at the tracker's
highest urgency levels. Summarise the count and shape of omitted lower-ranked
work in one short paragraph.

### Recommendation

Name exactly one item to pick up, or recommend finishing one in-progress item.
Explain the decisive priority, dependency, sequence, and momentum evidence in a
short paragraph. Mention one runner-up only when the choice is genuinely close,
including what would change the decision. End by offering to pick up the
recommended work.
