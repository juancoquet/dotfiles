---
name: next
description: Decide what work should be done next from a repository's configured issue tracker. Use when I ask what to work on next, request backlog triage or prioritisation, or want one concrete recommendation from the currently available work.
---

# Choose the Next Piece of Work

Survey the configured issue tracker, rank work that can actually be started, and
recommend one item.

## 1. Establish the Tracker Contract

Read and follow the shared selection contract in
[TRACKER-CONTRACT.md](../next-common/TRACKER-CONTRACT.md): stay read-only,
identify the canonical tracker, stop if it is ambiguous or unavailable, and use
the vocabulary it defines. Preserve the tracker's priority ordering when ranking
below.

## 2. Inspect Work Already in Progress

Find all in-progress work first and read each item's full description. Include
linked development work when the tracker exposes it. Finishing viable work
usually beats starting something new, so recommend finishing it unless it is
blocked, stalled, or explicitly deprioritised. State the evidence when starting
fresh is preferable.

## 3. Gather Startable Candidates

Build the candidate set as described under **Build the Candidate Set** in the
shared contract. No further filtering applies here — every startable, unblocked,
non-container item is in scope for ranking.

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

Follow the shared ranking and reporting conventions.

## 6. Report the Decision

Produce exactly these sections, following the shared ranking and reporting
conventions.

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
the closest relevant container in **Parent**, or `—`. Always show every item at
the tracker's highest urgency levels, even beyond the row cap.

### Recommendation

Name exactly one item to pick up, or recommend finishing one in-progress item.
Explain the decisive priority, dependency, sequence, and momentum evidence in a
short paragraph.
