---
name: wayfinder
description: Plan a huge chunk of work — more than one agent session can hold — as a shared map of decision tickets on the configured issue tracker, and resolve them one at a time until the way to the destination is clear.
disable-model-invocation: true
argument-hint: "[idea | map [ticket]]"
---

A loose idea has arrived — too big for one agent session and wrapped in fog. The
way from here to the **destination** is not visible yet. Wayfinding finds that
way rather than charging at the destination. It charts a **shared map** on the
configured issue tracker, then works its **decision tickets** — questions whose
resolution is a decision, not slices of a build to execute — one at a time until
the route is clear.

The destination varies by effort, and naming it is the first act of charting. It
might be a specification to hand off and iterate on, a decision to lock before
planning starts, or a change made in place such as a data-structure migration.
The map is domain-agnostic.

## Plan, don't do

Wayfinder is **planning** by default. Each ticket resolves a decision, and the
map is done when nothing remains to decide before someone does the work. The
pull to start implementation usually means you have reached the edge of the map
and should hand off. An effort may override this in its **Notes**, but otherwise
produce decisions rather than deliverables.

## Refer by name

Every map and ticket is an issue with a name: its title. In everything I read —
narration and the map's Decisions-so-far section — refer to it by name, never by
a bare identifier, number, or slug. Keep the identifier and URL inside the
linked name.

## The map

The map is one issue labelled `wayfinder:map`, the canonical artifact. It uses
`type:epic` and remains `status:in-progress` while open. Its decision tickets are
child issues.

The map is an **index**, not a store. A decision lives in exactly one place —
its ticket. The map only gists it and links to it.

The configured issue tracker must provide the physical operations for maps,
children, blocking, and frontier queries. Read its **Wayfinding operations**
section before writing. If no canonical tracker or Wayfinding operations are
available, stop and tell me what setup is missing; do not invent a tracker or
fall back to local files.

### Map body

Load this low-resolution view once per session. Open tickets are not listed;
find them through the tracker's child query.

```markdown
## Destination

<what reaching the end of this map looks like — the specification, decision, or change this effort is finding its way to; one or two lines>

## Notes

<domain; skills every session should consult; standing preferences for this effort>

## Decisions so far

<!-- one line per closed decision ticket: enough to judge relevance, then follow the link for detail -->

- [<closed ticket title>](link) — <one-line gist of the answer>

## Not yet specified

<!-- in-scope fog that cannot yet be stated as a precise question -->

## Out of scope

<!-- work ruled beyond the destination; closed and never graduated -->
```

### Decision tickets

Each decision ticket is a child issue of the map. Its tracker identifier is its
identity. It uses `type:task`, begins at `status:todo`, and contains one question
sized to one agent session:

```markdown
## Question

<the decision or investigation this ticket resolves>
```

Each ticket carries exactly one `wayfinder:<type>` label: `research`,
`prototype`, `grilling`, or `task`.

Claim a ticket by assigning it to me **first**, before any work, so another
session skips it. Then move it from `status:todo` to `status:in-progress`. The
assignee is the claim: an open, unassigned ticket is unclaimed.

Use the tracker's native dependency relationship for blocking so the frontier is
visible in its UI. A ticket is **unblocked** when every ticket blocking it is
closed. The **frontier** is the open, unblocked, unclaimed children — the edge
of the known.

Record the answer as a resolution comment, not in the ticket body. Link assets
created while resolving a ticket rather than pasting them into the body.

## Ticket types

Every ticket is either **HITL** — worked with me in a live exchange — or **AFK**
— driven by you alone. A HITL ticket resolves only through that exchange; never
supply my side of it yourself.

- **Research** (AFK): Read documentation, third-party APIs, or resources outside
  the current working directory to surface a fact a decision needs. Resolve it
  with the `primary-source-researcher` subagent following `/research`.
- **Prototype** (HITL): Raise the fidelity of the discussion with a cheap,
  concrete artifact to react to — an outline, rough take, stub, or UI or logic
  prototype via `/prototype`. Link the prototype as an asset. Use this when the
  key question is how something should look or behave.
- **Grilling** (HITL): Use `/grill-me` and `/domain-modeling`, one question at a
  time. This is the default.
- **Task** (HITL or AFK): Do manual work that must happen before a decision can
  be made. Nothing remains to decide, prototype, or research, but the discussion
  is blocked until the work is done. Drive it alone where possible; otherwise
  give me a precise checklist. Resolve it when the work is complete, recording
  what changed and any facts later tickets need.

## Fog of war

The map is deliberately incomplete. Beyond live tickets lies the **fog of war**:
decisions and investigations you can tell are coming but cannot yet state
precisely because they depend on open questions. Resolving a ticket clears the
fog ahead, graduating whatever is now specifiable into fresh tickets until the
way to the destination is clear.

Write that dim view in **Not yet specified**. It contains only in-scope questions
that are not sharp enough to ticket yet.

**Fog or ticket?** Ask whether you can state the question precisely now, not
whether you can answer it now.

- **Ticket when** the question is already sharp, even if blocked.
- **Not yet specified when** you cannot yet phrase it sharply. Do not pre-slice
  fog into speculative tickets; one patch may later become several tickets or
  none.

Exclude what is already decided, already a live ticket, or out of scope.

## Out of scope

Fog gathers only toward the destination. Work beyond it is **out of scope**, not
fog. Record it in the map's Out-of-scope section.

Out-of-scope work never graduates. If an existing ticket turns out to sit beyond
the destination, close it as `not planned` and leave one linked line in Out of
scope with the gist and reason. Do not add it to Decisions so far; a scope
boundary is not a step on the route.

## Invocation

There are two modes. Never hand-resolve more than one ticket per session;
research tickets delegated in parallel are the exception.

### Chart the map

I invoke the skill with a loose idea.

1. **Name the destination.** Run `/grill-me` with `/domain-modeling` to pin down
   what this map is finding its way to. The destination fixes the scope, so
   settle it first.
2. **Map the frontier.** Grill again, breadth-first: fan out across the space
   rather than following one thread deeply. Surface the open decisions and the
   first steps available now. If this reveals no fog and the whole journey fits
   one session, stop and ask me how I want to proceed; no map is needed.
3. **Create the map** with `wayfinder:map`, `type:epic`, and
   `status:in-progress`. Fill Destination and Notes, leave Decisions so far
   empty, and sketch the fog into Not yet specified.
4. **Create every ticket you can specify now** as a child with `type:task`,
   `status:todo`, and one `wayfinder:<type>` label. Wire blocking edges in a
   second pass after every issue has an identifier. Leave everything still
   imprecise in Not yet specified.
5. **Fire the research subagents.** For every newly created research ticket on
   the frontier — never one that is blocked or already claimed — launch one
   `primary-source-researcher` in parallel. Its assignment must tell it to:
   - confirm the ticket is still open, unblocked, and unclaimed, then assign it
     to me before researching and move it to `status:in-progress`;
   - use an isolated worktree on a throwaway `research/<name>` branch;
   - follow `/research`, save and commit one cited Markdown artifact;
   - post the answer and branch or commit link as the resolution comment;
   - close the ticket as `completed`;
   - leave the map body unchanged and report the result for later
     reconciliation.
6. Stop. Charting hand-resolves nothing.

### Work through the map

I invoke the skill with a map URL or number. A ticket is optional; without one,
you choose the next decision rather than asking me to choose it.

1. Load the map at low resolution, not every ticket body.
2. **Reconcile closed children.** Find every child closed as `completed` but
   missing from Decisions so far and append one linked gist for each. Find every
   child closed as `not planned` but missing from Out of scope and append its
   linked reason there. Do this before choosing a ticket so a failed or
   concurrent map edit cannot leave the index incomplete.
3. Build the frontier. If I named a ticket, verify that it is an open child of
   this map, unblocked, and unclaimed; stop without writing if any check fails.
   Otherwise choose the first frontier ticket in tracker order.
4. If the frontier is empty, do not invent a ticket:
   - If open children remain, report each blocked or claimed ticket by name and
     stop.
   - If Not yet specified still contains fog, run a breadth-first `/grill-me`
     pass to sharpen whatever can now be stated. Create and wire the resulting
     tickets, launch only frontier research as described under Chart the map,
     and stop. If the fog still cannot be stated precisely, report what must
     change before the map can advance.
   - If no open children or fog remain, post a completion comment on the map,
     close it as `completed`, and stop; the route to the destination is clear.
5. Claim the chosen ticket by assigning it to me before any other write, then
   move it to `status:in-progress`.
6. Resolve it. Fetch related or closed ticket bodies only as needed and invoke
   skills named in Notes. If in doubt, use `/grill-me` and `/domain-modeling`.
7. Record the resolution: post the answer as a comment, close the ticket as
   `completed`, and append one linked gist to Decisions so far.
8. Add newly surfaced tickets using create-then-wire. Graduate fog made precise
   by the answer, removing each graduated patch from Not yet specified so it
   lives only in its ticket. Rule anything beyond the destination out of scope.
   Update or close tickets invalidated by the decision.

I may run unblocked tickets in parallel, so expect concurrent tracker edits.
Before replacing the map body, reload it and preserve changes made since your
last read.
