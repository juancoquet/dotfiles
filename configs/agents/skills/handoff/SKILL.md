---
name: handoff
description: Compact the current conversation into a handoff document for another agent to pick up.
disable-model-invocation: true
argument-hint: "What will the next session be used for?"
---

# Handoff

Write a handoff document summarising the current conversation so a fresh agent
can continue the work. Save it to the OS temporary directory, not the project
workspace.

Include a "Suggested skills" section naming skills the next agent should invoke.

Do not duplicate content already captured in other artifacts (specs, plans,
ADRs, issues, commits, diffs) — reference them by path or URL instead.

Redact sensitive information such as API keys, passwords, or personally
identifiable information.

If arguments were passed, treat them as what the next session will focus on
and tailor the document accordingly.
