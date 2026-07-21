# Shared Contract: Selecting Work From the Tracker

This file holds the machinery shared by the skills that recommend work from the
configured issue tracker without changing anything. Each such skill's `SKILL.md`
supplies its own selection lens and ranking on top. Read and follow this file
whenever a skill points you here.

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
