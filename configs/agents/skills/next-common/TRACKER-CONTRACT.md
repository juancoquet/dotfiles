# Shared Contract: Selecting Work From the Tracker

This file holds the machinery shared by the skills that recommend work from the
configured issue tracker without changing anything. Each such skill's `SKILL.md`
supplies its own selection lens, ranking, and report shape on top. Read and
follow this file whenever a skill points you here.

## Stay Read-Only

Remain read-only: never create, claim, edit, close, or reprioritise work. Report
suspected metadata problems and offer to fix them instead of changing them
unprompted.

## Establish the Tracker Contract

Identify the repository's canonical tracker from primed session context and
repository instructions. Follow that tracker's documented workflow, field
semantics, and relationship semantics. Use its available integration and
built-in help when query syntax or capabilities are unclear.

Do not combine multiple backlogs. If the canonical tracker is ambiguous or its
data is unavailable, explain the ambiguity or failure and stop without making a
recommendation.

## Shared Vocabulary

Translate provider data into these concepts without requiring identical names:

- **In progress:** open work already claimed or actively underway.
- **Candidate:** open work in a startable state, of a workable type, with no
  unresolved blocker.
- **Container:** an epic, project, initiative, milestone, or other grouping that
  supplies context but is not itself directly workable.
- **Priority:** the tracker's ordered urgency levels. Treat an absent priority as
  normal unless the tracker contract says otherwise; keep explicitly deferred
  work visible but do not recommend it while other work is viable. Each skill
  decides how heavily priority weighs in its own ranking.
- **Relationships:** blockers, work unblocked by completion, parent or container
  membership, and any declared sequence.

## Labels Are Signals, Not Directives

Treat priority, type, and ordinary theme labels as evidence, not instructions.
The exception is a label that the tracker contract explicitly defines as
workflow ownership, such as `wayfinder:*`; it determines which skill may work
the item, not whether the item is worth doing. Otherwise, a label reflects what
someone believed when they applied it, so your reading of the item's
description, readiness, and this skill's lens is what decides:

- A theme label matching this skill's lens is a prior: it can break a tie, but
  never selects an item on its own or excuses skipping your own assessment.
- A missing label is not disqualifying; work that qualifies on its merits
  stays a candidate.
- When a label and the description disagree, trust the description and flag the
  label as suspected-stale.

## Build the Candidate Set

Find every unblocked item in the tracker's startable state whose type represents
work rather than a container. Read each candidate's full description, not just
its title. Load the relevant parents, dependencies, dependants, and referenced
sibling items needed to judge scope and ordering.

Exclude closed or otherwise terminal work, blocked work, and containers from the
candidate set; use containers and completed dependencies as context. If metadata
appears stale or contradictory, keep the item visible with a clear warning rather
than silently repairing or discarding it.

## Ranking and Reporting Conventions

Rank by judgement, not a numeric score; when candidates are close, name the
trade-off that separates them. Keep candidate summaries to one or two sentences
grounded in the full description. Cap any candidate table at about ten rows and
summarise the count and shape of what you omit in one short paragraph. Recommend
exactly one item, mention a runner-up only when the choice is genuinely close
(saying what would change the decision), and end by offering to pick up the
recommended work.
