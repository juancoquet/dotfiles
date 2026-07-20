# Juan's Agent Instructions

These instructions apply across all projects. Repository-local instructions
take precedence where they are more specific.

## Documentation lookup

- Fetch current documentation when working with libraries, tools, or APIs whose
  behaviour may have changed.
- Prefer first-party documentation and other authoritative sources.
- If the configured documentation provider is unavailable or insufficient, use
  web search rather than relying on stale model knowledge.

## Commit attribution

Never add `Co-Authored-By` or other AI-attribution trailers to commit messages.

## Verification

- After changing code, run the repository's configured formatting, linting,
  static-analysis, and test commands. Fix every diagnostic related to the work.
- When source changes affect generated files or artifacts consumed outside the
  edited module, update those artifacts and call out deployment or backward-
  compatibility consequences.
