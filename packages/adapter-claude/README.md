# @harnesstrim/adapter-claude

HarnessTrim adapter for [Claude Code](https://code.claude.com).

Claude Code fires `PostToolUse` hooks for every tool, and the hooks reference documents that such a
hook can rewrite what the model sees by returning `hookSpecificOutput.updatedToolOutput`. This adapter
targets that contract to slim tool output, and installs the portable skill pack:

1. **Skill bundle** — copies the skills into `<project>/.claude/skills`.
2. **PostToolUse reducer hook** — registers a hook (matched to `Bash`) in `.claude/settings.json`
   that runs `harnesstrim hook claude`, computing a slimmed version of noisy shell output.

> **Known limitation:** as of Claude Code **2.1.37–2.1.212** the `updatedToolOutput` field is **not
> honored** — the hook fires and returns a spec-correct response, but the model still receives the raw
> output (confirmed at the transcript level; see Status). This is a Claude-Code-side issue, not an
> adapter defect. Until it's fixed, reduce on Claude Code via the MCP `reduce` tool (`harnesstrim mcp`)
> or the `harnesstrim reduce` pipe.

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
end-to-end (settings merge preserving existing keys + skills copy + idempotent re-run).

**Live finding (2026-07-17):** exercised end-to-end in a real Claude Code session on **2.1.37 and
2.1.212**. The hook fires (metrics recorded) and its stdout is spec-correct — pure JSON, exit 0, empty
stderr, the exact `updatedToolOutput` shape the hooks docs describe. But the session transcript
(`~/.claude/projects/.../<session>.jsonl`) stores the **raw** tool output: `updatedToolOutput` is not
applied, whether nested under `hookSpecificOutput` or placed top-level (both tested with a minimal
standalone hook). So the reduction does **not** reach the model. Conclusion: the adapter is correct;
current Claude Code does not honor `updatedToolOutput`. Also observed: Claude Code reloads
`settings.json` hook config mid-session (no restart needed).

The `updatedToolOutput` field name follows the documented PostToolUse contract; if a future Claude
Code version fixes/changes it, only `hook.ts` needs updating. Retest with the transcript check above.
