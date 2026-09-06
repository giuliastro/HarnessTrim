# HarnessTrim development plan

This is the current execution plan. Read [AGENTS.md](AGENTS.md) for repository commands.
The complete earlier design, milestones and live observations are preserved in
[development-history.md](docs/development-history.md); historical integration conclusions
are not a substitute for the current adapter contract.

**Roadmap saved 2026-09-06:** [Product direction, competitive context and 0.4-1.0 roadmap](docs/roadmap.md).
This file owns the active checklist; the roadmap owns scope, rationale and detailed acceptance
criteria. Future versions below are planned, not implemented. Saving the plan does not start
paid model runs, change runtime configuration or publish a release.

## Objective

Help Codex and Claude complete more correct work with less waste, keep omitted information
recoverable, and measure the actual effect of optimization. Improve coding outcomes by removing
proven tool-output noise, preserving all failure evidence and reducing local overhead.
Fewer tokens alone are not success. Do not lower model reasoning effort or rewrite stable
instruction prefixes automatically.

## Release sequence

| Version | Priority | Focus | Completion condition |
| --- | --- | --- | --- |
| 0.3.x | Maintenance | Compatibility and correctness fixes | Existing gates preserved; no arbitrary compression increase. |
| 0.4.0 | P0, next | Verified integration and real-task efficiency | Live acceptance, correct session accounting and repeated paired task evidence. |
| 0.5.0 | P1 | Selective, recoverable context | Scoped local recovery and measured coverage expansion with net task benefit. |
| 0.6.0 | P1 | Session-waste and quota-aware policies | Explainable recommendations; automate only validated safe rules. |
| 0.7.0 | P2 | Handoff, resume and supervisor integration | Less repeated exploration without stale-state errors; stable JSON contracts. |
| 1.0 | Evidence-gated | Operational maturity | Repeatable Codex/Claude task benefits, stable contracts and reliable rollback. |

Version order is a dependency/priority plan, not a promised calendar. Continue maintaining
OpenCode, Pi, OMP and Hermes while focusing new capability work on Codex and Claude.

## Active milestone: 0.4.0

Task IDs are planning identifiers, not existing GitHub issue numbers. Detailed scope and
acceptance criteria: [roadmap, version 0.4.0](docs/roadmap.md#5-version-040-verified-efficiency).
All tasks are initially pending; check them only after evidence is recorded.

- [ ] **HT-040-01 - Baseline and evidence contracts.** Inspect existing code before adding
  features; record source/package/harness/model/effort versions and environment. Define
  additive, versioned probe and measurement schemas with provenance and counter semantics.
  Test duplicates, cumulative snapshots, partial data and missing fields offline.
- [ ] **HT-040-02 - Truthful integration diagnostics.** Extend the existing doctor/JSON
  surface to distinguish installed, loaded, executed and replacement accepted. Unknown
  acceptance stays unverified. Controlled probes must not incur cost or alter configuration
  as a side effect of ordinary diagnosis. A local receipt is not model-visible acceptance.
- [ ] **HT-040-03 - Session measurement.** Correlate sessions/turns/calls/attempts; normalize
  native usage without duplicate or overlapping counts. Separate native usage, proxy token
  estimates, API cost and subscription quota. Keep missing data unknown and telemetry
  local, payload-free and opt-in. Observe quota provenance/freshness before adding policies.
- [ ] **HT-040-04 - Versioned compatibility.** Verify current official contracts and record
  documented/offline/live status separately. Cover Codex delayed completion, parallel calls,
  cancellation and code mode; Claude structured results and other hooks; preserve Windows
  and packaged behavior. Add regressions and safe fallback for unsupported combinations.
- [ ] **HT-040-05 - Paired end-to-end evaluation.** Reuse benchmark assets; cover failing-test
  repair, long diagnostics, lint/refactoring and multi-file review with independent grading.
  Match initial state/model/effort and retain native caching/truncation. Record failed runs,
  retries, recovery and uncertainty. Obtain explicit live access and a budget cap before
  paid runs. Publish sanitized evidence, not private prompts or transcripts.
- [ ] **HT-040-06 - Evidence-backed fixes and defaults.** Fix demonstrated defects and
  repeated waste, writing signal regressions first. Measure total task cost and correctness.
  Keep unproven rules opt-in; publish neutral and negative results as well as wins.
- [ ] **HT-040-07 - Release evidence.** Update README, compatibility matrix, methodology and
  release reports with distinct reducer/integration/task evidence. Run all existing gates.
  Missing live acceptance or task evidence must remain an explicit blocker, not a claim
  of completed verified efficiency.

### First implementation block

Start with **HT-040-01**, then **HT-040-02/03** on offline fixtures. Reuse existing core metrics,
adapter, CLI and benchmark modules; do not repeat 0.3.0 work. Inspect current repository state
and any ongoing work before selecting an implementation branch. A useful first deliverable is
a test-backed evidence/diagnostic contract, not a more aggressive reducer.

Proceed to **HT-040-04/05** with pinned versions and explicitly authorized live testing. If
credentials, visibility or budget are missing, finish the offline runner/fixtures and record
the blocker. Do not fabricate live measurements, silently weaken acceptance criteria or treat
this roadmap as permission to spend on benchmarks.

Update this checklist with completed IDs, commit/PR references, test results and blockers.
Proposed CLI/schema changes in the roadmap are designs, not currently available commands.

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
These completed implementation items do not certify every future or installed harness version.

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

For real-task claims, report independently verified success, total resources including
failures/retries/retrieval, wall time and uncertainty. Do not infer integration acceptance from
receipts or a transcript that may have captured pre-hook output. Keep native/proxy counts and
API/subscription measures separate. The roadmap's exploratory 10-20% target is an experimental
objective, not a measured result or a release promise.

## Boundaries

No unrestricted command-execution MCP tool, mandatory proxy or remote telemetry. No
automatic persistent model/effort changes. Existing installed skill/instruction blocks
remain untouched by an upgrade. The existing MCP `reduce(text)` tool cannot retroactively
remove tokens already supplied by the model; pre-context pipe/hook reduction is preferred.
Do not promote the project beyond 0.x without repeatable live multi-tool quality evidence.

Future raw-output storage in 0.5 requires a separate explicit opt-in, scoped access, TTL and
size limits; it must not change the payload-free telemetry contract. Do not assume MCP inherits
the harness sandbox. Keep unknown diagnostics and all failure evidence. Avoid a standalone
dashboard, mandatory proxy, semantic indexer or language rewrite without measured need.
