---
name: write-review-guide
description: Write a PR review guide — the changed files as an ordered list, in the order a reviewer should read them, with brief context. Use when I ask for a review guide or reading order for a branch or PR.
argument-hint: "[base-branch | pr-number]"
---

# Writing a Review Guide

List the changed files against the given base (default branch otherwise) in
the order that builds understanding: what others depend on first, tests and
generated files last.

- One numbered entry per file, with a few words of context: its role in the
  change and anything worth scrutinising.
- Group under `###` headings only when the change has distinct parts; keep
  numbering continuous.

```markdown
## Review guide

### Schema
1. `api/schema/invoice.py` — adds nullable `due_date`
2. `api/schema/invoice.gen.ts` — generated; skim

### Overdue rule
3. `billing/overdue.py` — the rule; grace period is hardcoded
4. `billing/jobs.py` — nightly job applying it
5. `tests/billing/test_overdue.py` — grace-period boundaries
```
