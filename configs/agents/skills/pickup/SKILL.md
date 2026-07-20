---
name: pickup
description: Pick up an issue as the next piece of work. Reads the issue and gains full context — related issues, README, relevant code, docs, links — then briefs back on the issue, its context, and the why. Stops before design; does NOT implement. Invoke as `/pickup <issue-id>`.
---

# Picking Up an Issue

Given an issue ID, gain full context on the work and explain it back. The
deliverable is a briefing that puts writer and reader on the same footing, so
the design conversation that follows starts from shared understanding rather
than from the reader's first skim. This skill produces no design and no code:
design happens together with the user afterwards, and implementation after
that.

If no issue ID was given, ask for one.

## 1. Read the Issue

Fetch the issue from the tracker and read the full body — not just the
title. Note its acceptance criteria, its status, and its relationships:
parent, children, blockers, and anything it blocks.

A well-written issue answers three questions: *why* the work matters, *what*
must be observably true when it's done, and how *done*-ness will be judged.
Read with those questions in mind — where the issue leaves one unanswered,
that's a gap to surface in the briefing, not a blank to silently fill with
guesses.

## 2. Follow the Context Graph

Chase everything the issue points at, and the things it should have pointed
at:

- **Related issues.** Read the bodies of the parent, blockers, and any
  referenced siblings — the parent carries the larger intent, blockers carry
  ordering rationale, and completed neighbours show what groundwork already
  landed.
- **Links.** Follow links in the issue body (discussions, docs, external
  references) and extract the load-bearing conclusion of each.
- **Project README and docs.** Read whatever explains the subsystem the
  issue touches — architecture notes, design docs, ADRs.
- **Relevant code.** Find the areas the work will touch and read enough to
  understand current behaviour: the modules, their tests, and how data flows
  through them. The briefing must describe what the code does *today*, not
  what the issue assumes it does.
- **History.** Skim recent commits and merged work in the affected area —
  the issue may predate changes that alter its premises.
- **Anything else** the issue's content makes relevant: config, schemas,
  logs, upstream dependency docs.

Use subagents for broad searches when the surface area is large; read the
load-bearing files yourself.

## 3. Verify Against Reality

Issues go stale. Before briefing, check the issue's claims against the
current state of the repo:

- Does the described problem still exist? Reproduce it cheaply if a bug.
- Have the assumptions changed — code refactored, dependency replaced,
  neighbouring issue completed in a way that shrinks or reshapes this one?
- Is the stated motivation still the actual motivation?

Discrepancies are findings, not obstacles: report them in the briefing.

## 4. Brief Back

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
  scrapped, say so in the briefing and let the user decide.
