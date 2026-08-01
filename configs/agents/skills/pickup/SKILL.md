---
name: pickup
description: Pick up an issue as the next piece of work. Reads the issue and gains full context — related issues, README, relevant code, docs, links — then briefs back on the issue, its context, and the why. Stops before design; does NOT implement. Invoke as `/pickup <issue-id>`.
argument-hint: "[issue-id]"
---

# Picking Up an Issue

Given an issue ID, gain full context on the work and explain it back. The
deliverable is a briefing that puts writer and reader on the same footing, so
the design conversation that follows starts from shared understanding rather
than from the reader's first skim. This skill produces no design and no code:
design happens together with me afterwards, and implementation after that.

If no issue ID was given, ask for one.

## 1. Gain Full Context

Read and follow the shared context contract in
[CONTEXT-CONTRACT.md](../pickup-common/CONTEXT-CONTRACT.md): identify the
canonical tracker, fetch and read the issue in full, follow the context graph
(related issues, links, docs, code, history), and verify the issue's claims
against the current state of the repo. Carry every gap and discrepancy it
surfaces into the briefing below.

## 2. Respect Workflow Ownership

If the issue carries a `wayfinder:*` label, stop and direct me to `/wayfinder`
with the parent map and ticket. Wayfinder decision tickets are planning
questions, not implementation work; do not brief one as an ordinary pickup.

## 3. Brief Back

Deliver the briefing in this shape. Every section other than the opening is
optional: if there is nothing real to put under a heading, omit the section
entirely rather than writing filler.

```markdown
## <issue-id>: <issue title>

<The issue in your own words — what it asks for and why it matters: the
motivation, where it fits in the larger picture (parent intent, what it
unblocks, why now). Not a paraphrase of the title.>

### Current state
<How the relevant code and system behave today, with file references, and
how that differs from the desired outcome.>

### Constraints and prior decisions
<Anything from linked discussions, docs, or neighbouring issues that bounds
the solution space.>

### Gaps and staleness
<Where the issue is ambiguous, silent on something that matters, or
contradicted by the current state of the repo.>

### Open questions
<The decisions design must settle — the seeds of the design conversation,
with your read on where the key choices lie.>
```

Scale the briefing to the issue: a small, crisp ticket deserves a few
paragraphs, not a report. End by inviting the design phase — do not produce
a design, propose a full approach, or start implementing.

## Boundaries

- Read-only: no code changes, no issue edits, no status changes. The issue
  moves to in-progress when implementation actually begins, not during
  context-gathering.
- If context-gathering reveals the issue should be split, re-scoped, or
  scrapped, say so in the briefing and let me decide.
