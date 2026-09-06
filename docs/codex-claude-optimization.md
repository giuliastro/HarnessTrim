# Codex and Claude: optimization without losing evidence

## Contracts checked on 2026-09-06

The official [Claude hooks reference](https://code.claude.com/docs/en/hooks#posttooluse-decision-control)
requires `hookSpecificOutput.updatedToolOutput` to match the built-in tool's output shape.
For Bash, preserve the object and change only its selected text field. A plain string is
not a valid replacement for a structured Bash result. Error details must survive.

The official [Codex hooks reference](https://learn.chatgpt.com/docs/hooks#posttooluse)
documents replacement feedback via `continue: false`. HarnessTrim puts the full reduced
Bash result in `stopReason`, retaining stderr/status/metadata. It avoids `decision: block`,
which can reject a nested code-mode promise. This is event-local result handling, not a
request to cancel the agent turn. Non-shell tools are deliberately out of scope.

These contracts and replay tests are not live compatibility certification. Pin and
validate your installed harness version. Older implementations may not accept the new
fields; use the explicit shell pipe on unsupported versions. Native hook feedback limits
may also spill or truncate large results; a local receipt does not verify delivery.

## Preserved evidence

For structured Bash results, the selected stdout/output/content string is reduced and
all other fields are copied unchanged. stderr is not compressed. Exit codes, interruption
flags, truncation metadata and unknown future fields remain visible. Image/rich outputs,
unknown shapes and unrelated hook events are not rewritten. Unknown test lines and full
failure tails are retained, even when that means less compression.

The TAP reducer changes only known flat success records with duration/type metadata.
It does not infer that nested suites, skip/todo, warnings, bailouts or unfamiliar YAML
are disposable. Reduced output is for an LLM/human, not a TAP parser or other machine API.

## Keep failure status in shell pipes

Bash (subshell keeps pipefail local):

```bash
( set -o pipefail; npm test 2>&1 | harnesstrim reduce )
```

PowerShell, when native command exit status is needed:

```powershell
$raw = & npm test 2>&1
$commandExit = $LASTEXITCODE
$raw | harnesstrim reduce
$reduceExit = $LASTEXITCODE
if ($reduceExit -ne 0) { $raw; exit $reduceExit }
exit $commandExit
```

Use that PowerShell form inside a script or harness command, not in an interactive shell
that you wish to keep open (`exit` exits it). It buffers the command output; the raw value
remains available if reduction fails. Platform CI tests the package; these command recipes
are not a claim of a live coding-agent evaluation. Installed stable instruction snippets
are not rewritten during upgrade, so older snippets may need this status-safe form.

## What the numbers mean

Tier A measures fixed reducer fixtures with cl100k_base and an explicit signal audit.
Hook replay measures the complete serialized result, not stdout alone. A receipt contains
only sizes and identity; it cannot prove acceptance by the harness or task correctness.
Claude may record the original result in telemetry before a hook runs, so transcript
presence alone is also insufficient to conclude that replacement failed.

Passing already-seen text to MCP `reduce` does not erase the input cost of that text.
Use pipes/native hooks before context ingestion to obtain that benefit. No effort/model
setting is changed by setup or this release. Match reasoning effort to task risk manually;
a cheaper failed attempt is not an optimization.

## Next live checks

Pin harness/model versions and compare matched tasks with/without trimming. Verify the
actual model-facing output and independently test the resulting patches. Include failed
commands, long assertion diffs, retries, resumed sessions and Codex code mode. Record fresh
input/cache/reasoning/output counts separately and repeat runs to report variability.
Do not equate fixture reduction with a session saving or success-rate improvement.
