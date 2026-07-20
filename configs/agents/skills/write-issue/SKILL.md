---
name: write-issue
description: Write or refine a well-structured issue (bug, feature, task) for any issue tracker. Use when drafting new issues, filing follow-up work, or improving an existing ticket so it can be picked up cold by someone with no context.
---

# Writing Good Issues

How to write issues that are easy to pick up later, by someone else, with no
access to the conversation that produced them.

## The Core Idea: An Issue Is a Message to a Stranger

Write every issue for a competent stranger arriving cold — in practice
you in three months, a teammate, or an agent in a fresh session. Whatever
context lives only in your head at write time is gone at pickup time, and
context is cheap to write down while you hold it but expensive to re-derive
once it has evaporated. A vague issue defers a larger cost — clarifying
questions, re-investigation, or confident work on the wrong problem — onto
whoever picks it up.

Corollaries:

- **Self-contained.** Link related discussions and prior issues, but also
  summarise the load-bearing conclusion of anything linked — the reader
  shouldn't reconstruct a decision from a 40-message thread to start work.
  The one sanctioned shortcut: a child issue may answer part of its *why*
  with a line and a link up to its parent, rather than restating it.
- **Problem before solution.** State what is wrong or missing before saying
  what to build. A solution without its problem can't be evaluated, adjusted,
  or recognised as obsolete.
- **Concise.** No more verbose than necessary to meet the bar above. Length
  should track ambiguity: a two-line issue is correct when two lines carry
  everything the stranger needs. An issue that is a chore to read gets
  skimmed, and skimmed context might as well be missing.
- **One closable unit.** An issue is a task with a concrete outcome that can
  be finished and closed, typically by a single PR. Split anything bigger and
  record the relationships in the tracker, not in prose.

## The Three Questions Every Issue Answers

These are questions the body must answer, not headings it must contain — a
small issue can answer all three in one paragraph.

1. **Why** — what led here, and why the work matters. Implementers make
   dozens of micro-decisions; the why is the tiebreaker for every one of
   them. It is also how a future reader detects staleness: a motivation can
   be re-checked against reality, a bare instruction can only be obeyed.
2. **What** — the observable change in behaviour, capability, or artifact
   once the work is done. Outcomes, not implementation: outcomes stay valid
   as the codebase shifts; prescriptions go stale. Include real constraints,
   and non-goals — what's explicitly *out* stops scope creep at write time.
3. **Done** — the conditions for closing, as observable pass/fail outcomes:
   "importing a 200 MB file completes without error", not "improve importer
   memory handling". Un-testable done-ness makes an issue unfinishable. If
   you can't state done-ness, the work isn't understood well enough to be an
   issue yet — file a spike whose deliverable is that understanding.

## Titles

The title is the only part most people ever read — in lists, search results,
and commit references. It must carry the issue on its own:

- **State the outcome or the symptom, not the topic.** "Fix download URLs on
  the ontology page" is actionable; "Ontology download page" is a label. For
  bugs, the observed symptom is the best title: "Crash on login when SSO
  token is expired".
- **Front-load the distinguishing words.** Titles get truncated and scanned
  in columns: "Importer: OOM on files >100 MB" survives truncation.
- **Write for search.** Include what someone would grep for — the error
  fragment, the component name, the config key.

## Template

Issues written with this skill share this shape. Every section other than
the opening paragraph is optional: **if a section isn't needed, omit it
entirely** — never write a heading with "N/A" or filler under it.

```markdown
<Opening paragraph(s), no heading: the why, and as much of the what as fits
naturally. For many small issues this is the whole body.>

## Requirements
<What must be observably true when this is done, as bullets. Include real
constraints ("must not change the public API") and non-goals ("out of
scope: bulk import"). Omit when the opening paragraph already carries it.>

## Reproduction
<Bugs only: exact steps, expected vs actual, verbatim errors, environment.>

## Acceptance criteria
- [ ] <Observable pass/fail outcome — doubles as the test plan.>

## Proposed approach
<Optional. A labelled proposal, never woven into the requirements: the
implementer owns the how. Preferences and hunches live here; real
constraints belong under Requirements.>

## References
<Links to related issues, discussions, docs — each with a one-line summary
of its load-bearing conclusion.>
```

## Shape by Type

The three questions are universal, but the natural body shape differs.

### Bugs: reproduction-shaped

The aim is to let the reader **see the failure happen in front of them** —
a bug the implementer can reproduce is mostly fixed.

- **Steps to reproduce**, exact and complete: commands, inputs, order.
- **Expected vs actual**, both stated. "It doesn't work" carries no
  information; "expected the import to complete, got `MemoryError` after
  ~30 s" defines both wrong and right.
- **Verbatim evidence.** Error messages and stack traces pasted exactly,
  never paraphrased — the difference between two similar error strings is
  often the diagnosis. Trim noise, never "clean up" content.
- **Symptoms, not diagnoses.** Report what you observed. Theories are
  welcome but must be labelled as theories, separate from the facts — an
  unmarked guess sends the fixer down the wrong path with the author's
  credibility as fuel.
- **Environment**, when it plausibly matters: versions, platform, config.

### Features: outcome-shaped

- Lead with the need and why now — the context for the product-level
  judgement calls the ticket inevitably leaves open.
- Describe the observable behaviour change: what works after that didn't
  before.
- State the edges you already know about (empty states, failure modes,
  existing-data migration). Known edge cases omitted are bugs pre-ordered.
- State non-goals explicitly — one line now, or a scope negotiation later.

### Tasks and chores: deliverable-shaped

The trap is circularity: "Upgrade to Python 3.14", done when it's upgraded.
Name the motivation (what it unlocks or what risk it retires) and the
verification ("test suite green, deploy pipeline runs end-to-end") so the
task can be prioritised honestly and actually declared finished.

### Epics: container-shaped

Epics, projects, parent issues — a container is not a workable issue, and
it must earn its existence: work gets a parent when it's too big for one
closable issue, not because process expects a hierarchy. Its body carries
the workstream-level why and outcome **once**, so children link up instead
of restating it; its own done-ness — a stated outcome, not "when the
children are done", or it becomes a junk drawer; and the rationale for the
split, which is prose only the parent can hold.

Split along the structure of the problem, not architecture or team: each
child independently closable with an observable end-to-end result —
layer-shaped children ("backend part") finish with nothing working and park
integration risk in the last ticket. Order children by uncertainty, encoded
as blocking links, and expect to redraw the split as the work reveals the
real seams: keep near-term children crisp, distant work coarse.

## Anti-Patterns

Each feels efficient at write time:

- **Template worship.** Headings with "N/A" or boilerplate under them train
  readers to skim, which costs their attention exactly where content is real.
- **User stories and other ceremony.** "As a user, I want… so that…" is a
  roundabout way to describe a task — ritual phrasing that obscures the work
  and pads the reading without adding information the why/what/done questions
  don't already capture. Describe the task in plain language; discussion of
  user experience belongs at the product and feature level, not re-enacted
  in every ticket.
- **The title-only issue.** "Fix the flaky importer test" filed in two
  seconds is a note-to-self wearing an issue's clothes — it expires with the
  author's memory.
- **A solution masquerading as the problem.** "Add a retry to the S3 client"
  with no symptom recorded: when the retry doesn't fix it, nobody can tell
  what the ticket was for.
- **The transcript dump.** Pasting a debugging session in place of a
  description makes the reader re-live the investigation. Paste conclusions
  and key evidence; link the rest.
- **Speculative bundling.** "…and while we're at it" makes the issue harder
  to finish, review, and close. File the tangent as its own linked issue.
- **Acceptance criteria that restate the implementation.** "Retry loop
  added" verifies that code was typed, not that the problem went away.
- **Assumed context.** "As discussed", "like last time", unexplained
  shorthand — pointers into memory that will be deallocated.

## Self-Check Before Filing

Read the draft as the stranger:

1. Could someone with no access to today's context start this in three
   months without asking a question?
2. Is the why on the page — could a reader tell whether the issue is still
   worth doing if circumstances changed?
3. For a bug: can the reader make the failure happen from what's written?
   Expected and actual both stated? Facts and speculation separated?
4. Would two reasonable people agree on when this can be closed?
5. Is it one closable unit, with any split recorded as tracker
   relationships rather than prose?
6. Does every sentence earn its place? Cut anything that fills a template
   rather than informs the stranger.
