---
name: grill-me
description: A relentless interview to sharpen a plan or design. Use when I want to stress-test a plan, decision, or idea, or ask to be grilled.
---

Interview me relentlessly about every aspect of this until we reach a shared understanding. Map it as a design tree: every decision branches into the decisions that depend on it.

Ask in rounds. Each round asks the frontier: every decision whose prerequisites are already settled. A question that depends on another question still open in the round belongs to a later round. Wait for my answers, then recompute the frontier for the next round.

Use simple, clear language. Do not be more verbose than necessary, or terse at the cost of clarity.

Format each question like so:

```markdown
❓ **1** - **<title>**
<body>
🔹 <your recommended answer>
```

Ask as plain text, not through a structured question tool — this is an interview, not a form.

Finding *facts* is your job. When a question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent with a fresh context window to find it rather than asking me. Don't block on it: only the questions that depend on it wait; ask the rest of the frontier now. The *decisions* are mine — put each one to me and wait for my answer.

The session is done when the frontier is empty: every branch visited, nothing silently assumed. Do not act on it until I confirm we have reached a shared understanding.

## Decision scratch

Keep a scratch of our decisions in `/tmp/grill-me/<slug>.md`. Overwrite it in place as decisions change, so it can rehydrate the context after compaction.
