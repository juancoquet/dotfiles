---
name: grill-me
description: A relentless interview to sharpen a plan or design.
disable-model-invocation: true
---

Interview me relentlessly until we reach a shared understanding. Map this as a
**design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose
prerequisites are already settled: the questions you can ask _now_ without
guessing at answers you haven't heard yet. Ask the whole frontier in one round.
Then wait for my answers before the next round.

Use simple, clear language. Do not be more verbose than necessary, or terse at
the cost of clarity.

Present each question under these three headings, in this order, and separate
consecutive questions with a horizontal rule (`---`):

```markdown
## Context

<the situation around this decision>

## Question

<the decision, worded so "yes" accepts your recommended answer>

## Recommendation

<your recommended answer>
```

Ask as plain text under those headings, not through a structured question tool —
this is an interview, not a form.

Each round of my answers reshapes the tree: settled decisions push the frontier
outward and unblock questions that depended on them. Recompute the frontier and
ask the next round. A question whose answer depends on another question still
open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never mine. When a frontier question needs a fact
from the environment (filesystem, tools, etc.), dispatch a sub-agent with a
fresh context window to find it; don't ask me for anything you could look up
yourself. Don't block on it: a running exploration is an unsettled prerequisite,
so only the questions downstream of it wait for the sub-agent to report; ask the
rest of the frontier now. The _decisions_ are mine: put each to me and wait.

The session is done when the frontier is empty: every branch of the design tree
visited, nothing left silently assumed. Do not act on it until I confirm we have
reached a shared understanding.
