---
name: prototype
description: Build a throwaway prototype to answer a design question. Use when I want to sanity-check whether a state model or logic feels right, or explore what a UI should look like.
---

# Prototype

A prototype is **throwaway code that answers a question**. The question decides
the shape.

## Pick a branch

Identify which question you are answering from my prompt, the surrounding code,
or by asking me if I am available:

- **"Does this logic or state model feel right?"** → [LOGIC.md](LOGIC.md).
  Build a tiny interactive terminal app that pushes the state machine through
  cases that are hard to reason about on paper.
- **"What should this look like?"** → [UI.md](UI.md). Generate several
  radically different UI variations on one route, switchable through a URL
  search parameter and a floating bottom bar.

The two branches produce very different artifacts. If the question is genuinely
ambiguous and I am unavailable, default to whichever branch better matches the
surrounding code — backend module means logic; page or component means UI — and
state the assumption at the top of the prototype.

## Rules that apply to both

1. **Throwaway from day one, and clearly marked as such.** Locate the prototype
   close to where it would be used so its context is obvious, but name it so a
   reader can see it is a prototype rather than production code. For throwaway
   UI routes, follow the project's existing routing convention.
2. **One command to run.** Use the project's existing task runner. I should be
   able to start it without remembering a path or setup sequence.
3. **No persistence by default.** Keep state in memory. If the question
   explicitly involves persistence, use a scratch database or local file whose
   name clearly says it can be wiped.
4. **Skip the polish.** Add no tests, broad error handling, or abstractions
   beyond what makes the prototype runnable. The point is to learn quickly.
5. **Surface the state.** After every action in a logic prototype, or every
   variant switch in a UI prototype, show the complete relevant state.
6. **Capture it when done.** For ordinary implementation work, fold any
   validated decision into the real code, then preserve the prototype as a
   primary source on a throwaway branch outside main. For a planning-only
   Wayfinder map, do not implement the decision: preserve the whole prototype
   on the throwaway branch and record only the verdict. In either case, leave a
   context pointer on the decision ticket and record the question it settled.
