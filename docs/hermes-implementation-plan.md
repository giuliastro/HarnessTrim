# HarnessTrim — Hermes Optimization Implementation Plan

**Branch:** `feat/generic-reducers-hermes`  
**Base:** `origin/main`  
**Date:** 2026-07-15  
**Status:** validated and pushed to PR #3

## Goal

Make HarnessTrim effective for real Hermes Agent output while keeping installation cross-platform and safe by default. The implementation must reduce noisy tool results before they enter context without silently dropping code, tables, or final cron reports.

## Delivered work

### 1. Content reducers and dispatch ✅

- Added `generic-text-slim`, `json-output-slim`, `file-listing-slim`, and `cron-output-slim`.
- Dispatch order is now: test output → git diff → Hermes cron archive → JSON → file listing → generic text.
- `cron-output-slim` removes only the archived `## Prompt`/loaded-skill section from a Hermes cron record. It preserves the cron header and the entire `## Response` section.
- JSON handling reduces every independent embedded JSON block in a single pass.

### 2. Reducer data-safety fixes ✅

- Markdown tables are no longer recognized as filesystem trees.
- `search_files` output is recognized by the dispatcher.
- Every line inside a fenced code block is retained.
- Regression coverage verifies table preservation, long code fences, multiple embedded JSON blocks, cron idempotency, and cron response retention.

### 3. Hermes plugin correctness ✅

- The plugin supports text-bearing Hermes result schemas: `output`, `content`, `snapshot`, `analysis`, and `results[].content|output|text`.
- It rewrites the same field it extracted, preserving result JSON shape.
- Telemetry follows `HERMES_HOME` when Hermes supplies it, falling back to the default profile path.
- Public defaults remain privacy-safe: `dryrun`, minimum 400 chars, telemetry off. Local deployments can opt into `active`, lower thresholds, and telemetry with environment variables.

### 4. Cross-platform CLI and install flow ✅

- Replaced the Linux-only checkout launcher with a Node `.mjs` bin that resolves its `tsx` runtime independently of the working directory.
- The portable documented flow is `pnpm exec harnesstrim …`; global exposure uses `pnpm --filter @harnesstrim/cli link --global`.
- `harnesstrim install hermes --apply` now refreshes an existing plugin and invokes `hermes plugins enable harnesstrim` when the Hermes CLI is available.

### 5. Benchmarks and real cron validation ✅

- Added JSON, file-listing, and generic-text benchmark fixtures.
- Validated three archived real Hermes cron outputs through the CLI:

| Input | Result | Reducer |
| --- | ---: | --- |
| 52,638 chars | 4,827 chars | `cron-output-slim` |
| 44,097 chars | 3,038 chars | `cron-output-slim` |
| 15,749 chars | 6,147 chars | `cron-output-slim` |

- End-to-end plugin test on a real `read_file` payload: 50,675 → 4,749 chars, final `## Response` preserved, metric written successfully.

### 6. Presets — intentionally not added ✅

A static `hermes-default` preset is unnecessary: selection is content-based in `pickReducer`, and runtime safety/telemetry are explicit environment choices. This phase is closed by design rather than silently omitted.

## Verification completed

- Complete workspace typecheck and test suite passed.
- Benchmark passed: 2,973 → 1,090 tokens (−63.3%) with 24/24 must-keep lines preserved.
- Python plugin schema tests passed.
- The published CLI bin ran successfully from outside the checkout.
- Hermes plugin was refreshed, enabled, and verified against a real `read_file` cron payload; telemetry recorded `cron-output-slim` savings.
- Branch was pushed to the existing PR #3 from `gervaso-assistant/HarnessTrim`.