<EXTREMELY_IMPORTANT>
# GitHub Issues Usage Guide for Agents

This project uses GitHub Issues as its issue tracker. Use the `gh` CLI for all
issue operations.

- Use GitHub Issues instead of maintaining a separate durable todo list.
- An ephemeral execution plan may sequence the current session, but the issue
  remains the source of truth for scope, progress, and follow-up work.
- Use `gh <command> --help` when you need flags or behavior not shown here.

## Track Work With Issues

Before starting work:

1. Search for an existing issue that covers the work.
2. If none exists, create one that explains why the work matters, the
   observable outcome, and how completion will be judged.
3. Give every issue exactly one type and, while it is open, exactly one status.
4. To claim ready work, confirm that it is `status:todo` and not blocked,
   self-assign it, replace `status:todo` with `status:in-progress`, and create a
   linked branch named `<issue-number>-<short-kebab-description>`.

While working:

- Keep acceptance-criteria checkboxes in the issue body current.
- Record decisions or scope changes that a future reader would need.
- Keep unrelated work out of scope; create a linked follow-up issue instead.

After finishing:

- Reference the issue number in commits.
- For implementation work, use `Closes #<number>` in the pull request body and
  let the merge close the issue.
- For work completed without a pull request, add a concise summary comment and
  close the issue with reason `completed`.
- When abandoning work, explain why and close the issue with reason
  `not planned`.
- Mark duplicates with GitHub's duplicate relationship and canonical issue.
- Offer to create follow-up issues for non-urgent work that was deferred.

## Finding Ready Work

Inspect ready work in priority order: critical, high, normal, then low.
Deferred work is excluded from the ready queue.

```bash
# Critical
gh issue list --state open --limit 20 \
  --search 'is:issue label:"status:todo" -is:blocked label:"priority:critical"'

# High
gh issue list --state open --limit 20 \
  --search 'is:issue label:"status:todo" -is:blocked label:"priority:high"'

# Normal (no priority label)
gh issue list --state open --limit 20 \
  --search 'is:issue label:"status:todo" -is:blocked -label:"priority:critical" -label:"priority:high" -label:"priority:low" -label:"priority:deferred"'

# Low
gh issue list --state open --limit 20 \
  --search 'is:issue label:"status:todo" -is:blocked label:"priority:low"'
```

View the full issue, including its relationships and discussion, before
starting it.

## Types, Statuses, and Priorities

Every issue has exactly one of these type labels:

- `type:epic`: a container for related features or tasks; do not implement it
  directly when it still needs decomposition.
- `type:feature`: a user-facing capability or enhancement.
- `type:bug`: behavior that is broken or incorrect.
- `type:task`: a concrete unit of work.

Every open issue has exactly one of these status labels:

- `status:draft`: not sufficiently refined to start.
- `status:todo`: ready to be worked on.
- `status:in-progress`: currently being worked on.

Do not use status labels for terminal states:

- Completed work is closed with reason `completed`.
- Scrapped work is closed with reason `not planned`.
- Duplicate work is closed with reason `duplicate`.
- Remove any `status:*` label when closing an issue.

Priority is optional. The permitted priority labels are:

- `priority:critical`: urgent; address before ordinary work when possible.
- `priority:high`: important; address before normal work.
- `priority:low`: may wait until normal work is exhausted.
- `priority:deferred`: deliberately postponed; do not select as ready work.

An issue without a `priority:*` label has normal priority. Never apply more
than one priority label.

## Relationships

- **Parent/sub-issue** expresses hierarchy. Use sub-issues to decompose epics,
  features, or tasks. A child is not automatically blocked by its parent or
  siblings, and completing every child does not automatically close the parent.
- **Blocked by/blocking** expresses execution order. An issue is ready only
  when it has no open blockers. Do not duplicate this with a `status:blocked`
  label.
- **Related** issues are connected with ordinary issue references when neither
  hierarchy nor blocking applies.
- **Duplicate** points from redundant work to the canonical issue.
- **Milestones** group issues into releases or checkpoints; they are not issue
  types or hierarchy.

Use `gh issue create --help`, `gh issue edit --help`,
`gh issue develop --help`, and `gh issue close --help` for the native commands
that manage metadata, relationships, branches, and close reasons.
</EXTREMELY_IMPORTANT>
