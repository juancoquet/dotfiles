# My Agent Instructions

These instructions apply across all projects. Repository-local instructions
take precedence where they are more specific.

## Documentation lookup

- Fetch current documentation when working with libraries, tools, or APIs whose
  behaviour may have changed.
- Prefer first-party documentation and other authoritative sources.
- If the configured documentation provider is unavailable or insufficient, use
  web search rather than relying on stale model knowledge.

## Bug fixes

- Fix bugs with red-green-refactor: write a failing test that reproduces the
  bug, confirm it fails for the expected reason, write the minimal change that
  makes it pass, then refactor if necessary.
- Do not consider a bug fixed until a test demonstrates the original failure
  and its resolution.

## Commits

- Commit completed, verified work without waiting for me to request a
  commit. Use focused commits that each represent a coherent work grouping.
- Do not include unrelated changes of mine in a commit. Respect an explicit
  instruction not to commit.
- Before committing, verify the effective Git `user.email` is my GitHub
  noreply address — `<id>+<login>@users.noreply.github.com`, where `id` and
  `login` come from `gh api user`. If it differs, set the noreply address at
  repository scope before committing. Never expose a private email in commit
  metadata.
- Never add `Co-Authored-By` or other AI-attribution trailers to commit messages.

## Verification

- After changing code, run the repository's configured formatting, linting,
  static-analysis, and test commands. Fix every diagnostic related to the work.
- When source changes affect generated files or artifacts consumed outside the
  edited module, update those artifacts and call out deployment or backward-
  compatibility consequences.
