# @harnesstrim/adapter-claude

HarnessTrim adapter for [Claude Code](https://code.claude.com).

Claude Code fires `PostToolUse` hooks for every tool, and such a hook can rewrite what the model sees
by returning `hookSpecificOutput.updatedToolOutput` (per the Claude Code hooks reference). This
adapter uses that to slim tool output, and installs the portable skill pack:

1. **Skill bundle** — copies the skills into `<project>/.claude/skills`.
2. **PostToolUse reducer hook** — registers a hook (matched to `Bash`) in `.claude/settings.json`
   that runs `harnesstrim hook claude`, reducing noisy shell output before it reaches the model.

## Install

```sh
harnesstrim install claude           # dry-run: shows skills + the settings.json hook it would add
harnesstrim install claude --apply   # writes it
```

Existing `settings.json` keys and other hooks are preserved; the reducer hook is added only once
(idempotent). The hook command is `harnesstrim hook claude` — ensure `harnesstrim` is on PATH.

## The hook runtime

`harnesstrim hook claude` reads Claude's PostToolUse JSON on stdin and writes a hook response on
stdout. When the tool output is reducible it returns:

```json
{ "hookSpecificOutput": { "hookEventName": "PostToolUse", "updatedToolOutput": "<slimmed>" } }
```

Otherwise it returns `{}` (no change). It never throws on malformed input — a hook must not corrupt a
tool result. Add `--log <path>` to record one line per invocation for debugging.

## Status

The hook runtime and install planner are pure and unit-tested; `install claude` is verified
end-to-end (settings merge preserving existing keys + skills copy + idempotent re-run), and the hook
runtime was checked against a realistic PostToolUse payload. A full live Claude Code session was
**not** exercised end-to-end here (the dev shell's `claude -p` subprocess is not authenticated). To
verify live: `harnesstrim install claude --apply` in a real project, then run a command with noisy
output and confirm the model receives the slimmed version (use `--log` on the hook to observe it).

The `updatedToolOutput` field name follows the documented PostToolUse contract; if a future Claude
Code version changes it, only `hook.ts` needs updating.
