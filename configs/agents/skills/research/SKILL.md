---
name: research
description: Investigate a question against high-trust primary sources and capture the findings as a Markdown file in the repository. Use when I want a topic researched, documentation or API facts gathered, or reading legwork delegated to a background agent.
---

# Research

When you are coordinating my request, delegate the investigation to the
`primary-source-researcher` subagent in the background. Give it the question,
the repository context it needs, and any ticket or artifact contract that
applies. Keep working
while it reads, then relay its result when it arrives.

When you are the assigned researcher, do the investigation directly; do not
delegate it again.

## Research discipline

1. Investigate the question against **primary sources** — official
   documentation, source code, specifications, or first-party APIs — rather
   than secondary write-ups. Follow every claim back to the source that owns
   it.
2. Write the findings to one Markdown file and cite each claim's source.
3. Save it where the repository already keeps such notes. Match the existing
   convention; if there is none, choose a sensible location and report it.
4. Return the answer, artifact path, and any material uncertainty or blocker.

If the task belongs to a tracker workflow, follow the claim, branch, resolution,
and closure instructions in the assignment in addition to this discipline.
