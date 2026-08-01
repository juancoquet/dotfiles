<EXTREMELY_IMPORTANT>
# GitHub Issues Usage Guide for Agents

This project uses GitHub Issues as its issue tracker. Use the `gh` CLI for all
issue operations.

- Use GitHub Issues instead of maintaining a separate durable todo list.
- An ephemeral execution plan may sequence the current session, but the issue
  remains the source of truth for scope, progress, and follow-up work.
- Use `gh <command> --help` when you need flags or behavior not shown here.

## Discover the Configured Labels

The label vocabulary is project-specific. This guide fixes the *meaning* of the
structural axes below, but the concrete set of labels — including any label
outside those axes — lives on the tracker, not in this guide. Enumerate it once
early in the session:

```bash
gh label list --limit 100
```

Sort what you find into three groups:

- **Structural axes** — the `type:`, `status:`, and `priority:` families
  documented below. Their names and meanings are part of the workflow contract;
  treat them as authoritative. If the tracker is missing one or carries an
  extra `type:`/`status:`/`priority:` label this guide does not describe, report
  the mismatch rather than inventing a meaning for it.
- **Workflow labels** — the `wayfinder:` family documented under Wayfinding
  operations. These labels assign an issue to that workflow and are not themes.
- **Theme labels** — every other label the project has configured (for example
  an area, component, or cross-cutting concern). A theme is orthogonal to the
  structural axes: it cuts across the `type:` partition and coexists with any
  one type, status, and priority. Learn a project's themes from `gh label list`,
  apply the ones that fit an issue, and never treat a theme label as
  unrecognised merely because it is not named in this guide.

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

These are the structural axes the workflow relies on. Their meanings are fixed
here; the tracker's concrete labels — and any theme labels alongside them — come
from `gh label list` (see *Discover the Configured Labels*).

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

For a closed issue, the issue state and close reason are canonical. Any
`status:*` label left by automatic closure is historical and must be ignored:

- Completed work is closed with reason `completed`.
- Scrapped work is closed with reason `not planned`.
- Duplicate work is closed with reason `duplicate`.

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

## Wayfinding Operations

The `/wayfinder` skill owns issues labelled `wayfinder:*`. Do not work one
through `/pickup` or `/pickup-afk`; redirect it to `/wayfinder` with its map and
ticket. These issues use the structural workflow above plus one required
Wayfinder label:

- A map uses `type:epic`, `status:in-progress`, and `wayfinder:map`.
- A decision ticket uses `type:task`, begins at `status:todo`, and has exactly
  one of `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or
  `wayfinder:task`.

The map is the parent issue and its decision tickets are native sub-issues. A
decision ticket's deliberately small `## Question` body is an exception to the
ordinary implementation-issue shape: its parent supplies the wider why, and its
resolution comment holds the answer.

GitHub CLI 2.94 and newer exposes sub-issues and dependencies directly. Check
`gh issue create --help` for `--parent` and `--blocked-by`. When present, prefer:

```bash
gh issue create --title "<ticket name>" --body-file - \
  --parent <map-number> --label type:task --label status:todo \
  --label wayfinder:<type>
gh issue edit <ticket> --add-blocked-by <blocker>
gh issue view <map> --json subIssues
gh issue view <ticket> --json blockedBy,blocking,parent
```

On older clients, use the REST endpoints through `gh api`. They work with the
installed authentication and preserve the same native relationships:

```bash
# Link an existing ticket as a child; the API needs its database id.
child_id=$(gh api repos/{owner}/{repo}/issues/<ticket> --jq .id)
gh api --method POST repos/{owner}/{repo}/issues/<map>/sub_issues \
  -F sub_issue_id="$child_id"

# Mark the ticket as blocked by another issue; this also needs a database id.
blocker_id=$(gh api repos/{owner}/{repo}/issues/<blocker> --jq .id)
gh api --method POST \
  repos/{owner}/{repo}/issues/<ticket>/dependencies/blocked_by \
  -F issue_id="$blocker_id"

# List children in map order and inspect their live dependency summaries.
gh api --paginate repos/{owner}/{repo}/issues/<map>/sub_issues
gh api repos/{owner}/{repo}/issues/<ticket> \
  --jq .issue_dependencies_summary.blocked_by
```

The frontier is the map's open children, in map order, with no assignee and
zero open blockers. Claim a frontier ticket with assignment as the first tracker
write, then move it into progress:

```bash
gh issue edit <ticket> --add-assignee @me
gh issue edit <ticket> --remove-label status:todo \
  --add-label status:in-progress
```

Resolve a decision by commenting with the answer, closing it with reason
`completed`, then appending one linked gist to the map's Decisions-so-far. Close
a ticket ruled beyond the destination with reason `not planned` and link its
reason under Out of scope instead. Reload the map body immediately before every
replacement so concurrent edits are preserved.

Research subagents may resolve tickets concurrently, but they never edit the map
body. At the start of every `/wayfinder` pass, reconcile all closed children:
completed decisions missing from Decisions so far, and not-planned tickets
missing from Out of scope. Do this before selecting the frontier.

Use `gh issue create --help`, `gh issue edit --help`,
`gh issue develop --help`, and `gh issue close --help` for the native commands
that manage metadata, relationships, branches, and close reasons.
</EXTREMELY_IMPORTANT>
