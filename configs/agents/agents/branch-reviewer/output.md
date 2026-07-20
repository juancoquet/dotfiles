## Output Contract

Return only a JSON array. Each finding is an object with these fields:

```json
[
  {
    "file": "path/to/file.py",
    "line": 42,
    "rule": "optional-rule-id",
    "severity": "high",
    "description": "What is wrong and how to address it"
  }
]
```

- `file` is a repository-relative path.
- `line` is the most relevant changed line.
- `rule` is the repository rule identifier, or `null` when no named rule
  applies.
- `severity` is `high` or `medium`.
- `description` explains the concrete failure and remediation direction.

Order findings by severity and then file path. Return `[]` when no findings
exist. Do not wrap the JSON in a code fence or add a summary outside it.

## Constraints

- Do not modify files or repository state.
- Do not add speculative recommendations beyond verified findings.
- Do not assume any particular mechanism for spawning or coordinating agents.
