# GitHub Issues prime

This directory is the canonical, reusable source for priming agent sessions in
repositories that use GitHub Issues. Installing the dotfiles does not activate
it globally: each repository opts in with its own harness wiring.

`gh-issues-context.md` is the only instructional payload. `gh-issues-prime`
emits it as plain text for Claude Code, Codex, and OpenCode, or as Cursor's
`additional_context` JSON shape with `--cursor`.

## Repository setup

Copy this directory into the target repository as `.agents/gh-issues/`, then
create the labels below. Adjust colors if desired, but keep the names and
meanings unchanged because the primed workflow treats them as an enum.

```bash
gh label create 'type:epic' --color 3E4B9E --description 'A container for related features or tasks'
gh label create 'type:feature' --color 1D76DB --description 'A user-facing capability or enhancement'
gh label create 'type:bug' --color D73A4A --description 'Something is broken'
gh label create 'type:task' --color 5319E7 --description 'A concrete unit of work'

gh label create 'status:draft' --color BFDADC --description 'Needs refinement before work can begin'
gh label create 'status:todo' --color 0E8A16 --description 'Ready to be worked on'
gh label create 'status:in-progress' --color FBCA04 --description 'Currently being worked on'

gh label create 'priority:critical' --color B60205 --description 'Urgent and should interrupt ordinary work'
gh label create 'priority:high' --color D93F0B --description 'Important and should precede normal work'
gh label create 'priority:low' --color C5DEF5 --description 'Can be delayed behind normal work'
gh label create 'priority:deferred' --color EDEDED --description 'Explicitly deferred and excluded from ready work'
```

Use `--force` when deliberately reconciling existing labels. Confirm that
`gh auth status` succeeds before relying on issue mutations.

The examples below assume the copied command is:

```text
sh .agents/gh-issues/gh-issues-prime
```

### Claude Code

Merge this project hook into `.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume|clear|compact",
        "hooks": [
          {
            "type": "command",
            "command": "sh .agents/gh-issues/gh-issues-prime"
          }
        ]
      }
    ]
  }
}
```

`SessionStart` runs again with the `compact` source after compaction, so the
same hook restores the payload.

### Codex

Create `.codex/hooks.json`:

```json
{
  "description": "Prime GitHub Issues guidance",
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume|clear|compact",
        "hooks": [
          {
            "type": "command",
            "command": "sh .agents/gh-issues/gh-issues-prime",
            "statusMessage": "Priming GitHub Issues"
          }
        ]
      }
    ]
  }
}
```

Review and trust the project hook with `/hooks` after adding or changing it.

### OpenCode

Create `.opencode/plugins/gh-issues-prime.ts`:

```typescript
import type { Plugin } from '@opencode-ai/plugin';

export const GhIssuesPrimePlugin: Plugin = async ({ $, directory }) => {
  const result = await $`sh .agents/gh-issues/gh-issues-prime`
    .cwd(directory)
    .quiet()
    .nothrow();
  const prime = result.exitCode === 0 ? result.stdout.toString() : '';

  return {
    'experimental.chat.system.transform': async (_, output) => {
      if (prime) output.system.push(prime);
    },
    'experimental.session.compacting': async (_, output) => {
      if (prime) output.context.push(prime);
    },
  };
};

export default GhIssuesPrimePlugin;
```

The system transform provides the payload to the session, and the compaction
hook includes it in the continuation context.

### Cursor

Create `.cursor/hooks.json`:

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      {
        "command": "sh .agents/gh-issues/gh-issues-prime --cursor"
      }
    ]
  }
}
```

Cursor accepts `additional_context` from `sessionStart`; the `--cursor` mode
only adapts the shared payload to that JSON envelope.

## Validation

Run the package check after changing the payload or wiring:

```bash
.agents/gh-issues/check
```

When editing the canonical dotfiles copy, use:

```bash
configs/agents/trackers/gh-issues/check
configs/agents/scripts/check
```
