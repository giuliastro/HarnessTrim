# @harnesstrim/adapter-claude

Installs skills, a Bash `PostToolUse` hook in `.claude/settings.json`, and a marker-guarded
`CLAUDE.md` pipe instruction. The executable must be on the harness PATH.

```sh
harnesstrim install claude
harnesstrim install claude --apply
harnesstrim install claude --no-hook --no-instructions --apply
```

## Correct structured replacement in 0.3.0

The hook reduces a recognized text channel inside `tool_response` and preserves the rest:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "updatedToolOutput": {
      "stdout": "[harnesstrim:test-output-slim] ...",
      "stderr": "original diagnostic",
      "interrupted": false,
      "isImage": false
    }
  }
}
```

It never flattens the Bash result to a string. Exit status and any other existing fields
are preserved, not invented. Legacy string payloads remain strings. Unknown shapes,
image/rich outputs and non-PostToolUse/non-Bash events return `{}`. Optional receipts
measure the full result; they are not proof of acceptance by the running harness.

**Correction to earlier notes:** previous versions sent a string replacement for structured
Bash outputs and attributed ignored output to Claude Code. The current
[official contract](https://code.claude.com/docs/en/hooks#posttooluse-decision-control)
requires the replacement shape to match. It also notes that original output can remain in
telemetry before the hook runs. Historical transcript observations do not establish that
all current Claude versions ignore correctly shaped replacements.

The corrected adapter is covered by pure regression tests and offline protocol replay.
A live model-session validation was not performed for this release. Use the
[status-safe pipe fallback](../../docs/codex-claude-optimization.md) on unsupported versions.
No built-in Read/Grep/Glob interception or automatic MCP registration is implied.

Install is dry-run by default and preserves unrelated valid settings and marker blocks.
Malformed settings are not overwritten when installing the hook. Existing instructions
and skills remain stable on upgrade; setup does not change model or reasoning effort.
