# Shared Contract: Gaining Full Context on an Issue

This file holds the machinery shared by the skills that take a single issue and
build full context on it before acting. Each such skill's `SKILL.md` supplies
what happens once the context is understood — brief it back, or start the work.
Read and follow this file whenever a skill points you here.

Given an issue ID, gain full context on the work: understand what it asks for,
why it matters, and how the surrounding code and history actually behave today.
Building this understanding is the same regardless of what you do next; only the
follow-through differs. Produce no design and no code while gathering context —
that belongs to whatever your skill does afterwards.

## Identify the Tracker and the Issue

Identify the repository's canonical tracker from primed session context and
repository instructions. Follow that tracker's documented workflow, field
semantics, and relationship semantics; use its integration and built-in help
when query syntax or capabilities are unclear.

Fetch the issue and read the full body — not just the title. Note its
acceptance criteria, its status, and its relationships: parent, children,
blockers, and anything it blocks.

A well-written issue answers three questions: *why* the work matters, *what*
must be observably true when it's done, and how *done*-ness will be judged. Read
with those questions in mind — where the issue leaves one unanswered, that's a
gap to carry forward, not a blank to silently fill with guesses.

## Follow the Context Graph

Chase everything the issue points at, and the things it should have pointed at:

- **Related issues.** Read the bodies of the parent, blockers, and any
  referenced siblings — the parent carries the larger intent, blockers carry
  ordering rationale, and completed neighbours show what groundwork already
  landed.
- **Links.** Follow links in the issue body (discussions, docs, external
  references) and extract the load-bearing conclusion of each.
- **Project README and docs.** Read whatever explains the subsystem the issue
  touches — architecture notes, design docs, ADRs.
- **Relevant code.** Find the areas the work will touch and read enough to
  understand current behaviour: the modules, their tests, and how data flows
  through them. Describe what the code does *today*, not what the issue assumes
  it does.
- **History.** Skim recent commits and merged work in the affected area — the
  issue may predate changes that alter its premises.
- **Anything else** the issue's content makes relevant: config, schemas, logs,
  upstream dependency docs.

Use subagents for broad searches when the surface area is large; read the
load-bearing files yourself.

## Verify Against Reality

Issues go stale. Before acting on the context, check the issue's claims against
the current state of the repo:

- Does the described problem still exist? Reproduce it cheaply if a bug.
- Have the assumptions changed — code refactored, dependency replaced,
  neighbouring issue completed in a way that shrinks or reshapes this one?
- Is the stated motivation still the actual motivation?

Discrepancies are findings, not obstacles: carry them into whatever your skill
does next rather than working around them silently.
