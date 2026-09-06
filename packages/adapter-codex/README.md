# @harnesstrim/adapter-codex

Default installation copies skills and adds a marker-guarded `AGENTS.md` pipe instruction.
Automatic Bash handling is a separate opt-in:

```sh
harnesstrim install codex
harnesstrim install codex --apply
harnesstrim install codex --hook --apply
harnesstrim install codex --hook --global --apply
```

Project hooks live in `.codex/hooks.json`; `--global` with `--hook` installs only the user
hook in `~/.codex/hooks.json`, without editing project instructions. Review and trust hooks
in Codex before use. The existing hook command records local, payload-free receipts in
`.harnesstrim/metrics.jsonl` relative to the active project.

## Result feedback in 0.3.0

The [current Codex contract](https://learn.chatgpt.com/docs/hooks#posttooluse) supports:

```json
{ "continue": false, "stopReason": "the complete reduced Bash result" }
```

`stopReason` contains the serialized response object when the original was structured,
not just stdout. stderr, exit codes and unknown metadata survive. This stops normal
processing of that result, not the agent turn. It avoids `decision: block`, whose code-mode
semantics can reject a tool promise. Codex has no equivalent supported general-purpose
`updatedToolOutput` transform here; do not copy Claude's response contract.

Only Bash is handled. Unsupported events, image/rich outputs and unknown shapes pass
through untouched. Shell tool effects have already happened and cannot be undone by
this hook. Hook feedback limits and behavior are version-dependent, which is why the
integration remains opt-in. Pure regression tests and offline replay are not live
harness/LLM task-quality certification.

Use a [status-preserving pipe](../../docs/codex-claude-optimization.md) on older/unsupported
versions. The pipe runs within the harness-approved shell, not an unrestricted MCP executor.
Setup does not change model choice, reasoning effort or existing stable instruction blocks.
