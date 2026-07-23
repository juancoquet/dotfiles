---
name: afk-fanout
description: Work several issues at once, unattended, by spawning one autonomous agent per issue and having each invoke `/pickup-afk` on it. Use when I hand over multiple issues at once to work while I'm away from the keyboard. Invoke as `/afk-fanout <issue-id> [issue-id...]`.
disable-model-invocation: true
argument-hint: "[issue-id...]"
---

# Fanning Out AFK Work Across Issues

Given one or more issue IDs, work them all unattended and in parallel: spawn
one subagent per issue, each invoking `/pickup-afk` on its issue. This skill
only dispatches — gaining context, judging autonomy-safety, and doing the work
are `/pickup-afk`'s job, done fresh by each subagent.

If no issue IDs were given, say so and stop. Don't choose issues yourself —
this skill only fans out the issues it's handed.

## 1. Resolve the Issue List

Normalize each argument to the tracker's canonical issue reference and drop
duplicates — the same issue must never go to two subagents.

## 2. Spawn One Subagent per Issue

Spawn one subagent per issue. Each subagent's task is to invoke `/pickup-afk`
on its assigned issue — instruct it explicitly to do so, and to carry out
everything that skill directs. Give it only the issue reference; it builds its
own context from there.

Run all the subagents concurrently, not one after another, and don't wait on
one before starting the next. Don't put the subagents in isolated worktrees:
`/pickup-afk` already creates its own fresh worktree per issue, so isolating
here would only double the setup cost.

## 3. Report the Fanout, Then Relay Outcomes

Once all subagents are launched, tell me which is covering which issue, without
waiting for results. Relay each outcome as it arrives — the PR opened, or why
it stopped. Never predict an outcome before a subagent reports it; if I ask for
status while agents are running, say what's still in flight.

## Boundaries

- Dispatch only the issues I gave you — don't add, drop, or substitute.
- Exactly one subagent per issue — don't split one across agents or merge
  several.
- Autonomy-safety is `/pickup-afk`'s call per issue; don't pre-filter the list.
