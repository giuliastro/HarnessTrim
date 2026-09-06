# AGENTS.md - HarnessTrim

Read PLAN.md before changes. Historical notes live in docs/development-history.md.

## Repository and toolchain

- pnpm workspace; Node 24 for native TypeScript. Relative TS imports use `.ts`.
- packages: core, cli, mcp, and opencode/claude/codex/hermes/pi/omp adapters.
- `packages/cli/package.json` is the source version; CLI package is `harnesstrim`.
  Check npm/GitHub Releases for the published version instead of trusting dated notes.
- Do not commit/push without user authorization. Machine-specific settings belong in
  git-ignored AGENTS.local.md, not tracked documentation.

## Validation

- `pnpm run typecheck`
- `pnpm test`
- `pnpm run bench` (Tier A plus offline Claude/Codex hook replay)
- `node packages/cli/build.mjs` (also checks the 256 KiB static-startup budget)
- `bash packages/cli/smoke-test-gate.sh` (npm pack -> fresh consumer install)
- `python packages/adapter-hermes/test/plugin-payload.test.py`
- Optional cold CLI comparison: `node scripts/bench-cli-startup.mjs <baseline-cli.mjs> <candidate-cli.mjs> [report.json]`

## Invariants

Reducers must be deterministic, idempotent, non-growing and fail open. Unknown diagnostic
text is not noise. Preserve full failure blocks, stderr, exit codes and structured metadata.
Claude Bash replacements must remain objects; never flatten them to strings. Codex's
opt-in hook uses `continue: false` / `stopReason`, not `decision: block` (code-mode rejection).
Both hooks are Bash-only and ignore unrelated events and non-text/rich results.

Do not rewrite stable prompt prefixes or silently lower reasoning effort. Existing
instruction/skill assets are unchanged in 0.3.0. Telemetry is local and payload-free;
raw diagnostics and exception messages must not enter receipts. Disabled MCP telemetry
must not tokenize. Expensive MCP/tokenizer code must stay off the normal hook/pipe path.

## Evidence and releases

Tier A counts cl100k_base tokens, a proxy for vendor billing. Hook replay is offline,
not live harness/LLM quality validation. Keep those claims separate. Tier B historical
OpenCode accounting counts each message once: do not add aggregate session totals again;
its input/cache semantics depend on the exporter version.

Release is gated by `.github/workflows/release.yml`. The existing release bridge creates
a validated tag from `release/v<version>`; the owner-only `/release v<version>` issue
comment dispatches publication. Never skip quality gates or republish a version.
