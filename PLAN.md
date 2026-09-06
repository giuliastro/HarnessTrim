# HarnessTrim development plan

This is the current execution plan. Read [AGENTS.md](AGENTS.md) for repository commands.
The complete earlier design, milestones and live observations are preserved in
[development-history.md](docs/development-history.md); historical integration conclusions
are not a substitute for the current adapter contract.

## Objective

Improve Codex and Claude coding outcomes by removing proven tool-output noise, preserving
all failure evidence, and reducing local overhead. Fewer tokens alone are not success.
Do not lower model reasoning effort or rewrite stable instruction prefixes automatically.

## 0.3.0 implementation

- [x] Fix Claude Bash replacement shape: replace the selected text field inside the
  original object, retaining stderr, exit status, flags and unknown metadata.
- [x] Preserve the complete Codex response envelope in replacement feedback. Use the
  documented `continue: false` / `stopReason` contract instead of `decision: block`,
  which can reject a code-mode tool promise. Keep hook installation opt-in and Bash-only.
- [x] Reject unrelated events, unknown shapes and image/rich results without modification.
  Count the full serialized before/after result; do not report stdout-only savings.
- [x] Replace test-output context-window deletion with conservative confirmed-pass removal.
  Keep the complete diagnostic tail, including long assertion diffs and command exit status.
- [x] Add a conservative Node TAP reducer. Preserve failures, suites, skip/todo,
  warnings, bailouts and unfamiliar diagnostics. Add a fixed fidelity fixture.
- [x] Make the packaged CLI lazy-load MCP and token counting. Bundle only cl100k_base,
  retain zero runtime dependencies, and gate the initial static graph at 256 KiB.
- [x] Skip MCP telemetry work when disabled; count unchanged payloads once and isolate
  counter/sink failures from the tool result.
- [x] Add offline Claude/Codex protocol replay to the standard benchmark/release gate.
- [x] Add reproducible alternating cold-process timing and publish the raw measurements.
- [x] Correct historical documentation that attributed Claude's ignored string replacement
  to the harness. Built-in outputs require matching structured replacements.

Implementation evidence, exact measurements, caveats and upgrade instructions:
[0.3.0 release notes](docs/releases/0.3.0.md).
The package version identifies this checkout; npm and GitHub Releases identify publication.

## Quality and release gates

Run `pnpm run typecheck`, `pnpm test`, `pnpm run bench`, the CLI build and clean-package
smoke test. CI repeats typecheck/tests/Tier A/replay on Linux, Windows and macOS.
Also run the Hermes Python payload tests. Every published tarball must install in an
empty consumer directory, expose its executable, ship all lazy chunks/assets, and have
zero runtime dependencies. Release validates the tag/version and npm availability.

Savings are accepted only with 100% fixed-fixture signal recall, no dropped audited
signal, deterministic output, idempotence, non-growth and p95 <= 25 ms per fixture.
Protocol replay additionally checks all non-stdout metadata and the full serialized result.
Raw measurements must state the tokenizer, environment and whether a live model ran.

## Next: live quality validation, not more aggressive compression

1. Pin installed Codex/Claude versions and model settings; verify each hook's actual
   model-facing result, including Bash failures, cancellations, unified-exec completion
   and code-mode behavior. A local receipt proves hook execution, not harness acceptance.
   Claude telemetry/transcripts can retain pre-hook output; do not use that alone as proof.
2. Run repeated paired vanilla/trimmed tasks: failing-test repair, long assertion diffs,
   lint cleanup and multi-file review. Score patch correctness and independent tests.
3. Report fresh input, cache reads/writes, reasoning/output tokens, wall time, retries,
   task success and variance separately. Keep tokenizer proxy counts separate from billing.
4. Expand coverage only for recurring measured waste. Prefer pass-through over guessing
   that unfamiliar diagnostics are noise. Add regressions before adding a new rule.

## Boundaries

No unrestricted command-execution MCP tool, mandatory proxy or remote telemetry. No
automatic persistent model/effort changes. Existing installed skill/instruction blocks
remain untouched by an upgrade. The existing MCP `reduce(text)` tool cannot retroactively
remove tokens already supplied by the model; pre-context pipe/hook reduction is preferred.
Do not promote the project beyond 0.x without repeatable live multi-tool quality evidence.
