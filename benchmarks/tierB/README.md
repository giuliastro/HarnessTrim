# Tier B — end-to-end benchmark

Tier A measures the reducer in isolation (deterministic, no LLM). Tier B measures the *whole loop*:
it runs the **same real task** through OpenCode twice and compares

1. **total tokens** consumed in the session, and
2. **whether the task still succeeds** (quality retention).

The point is to show HarnessTrim cuts tokens without breaking the task. A token drop that also breaks
the task is worthless.

## Method

- **Task** (`task-failing-test/`): a project whose `npm test` prints noisy, mostly-passing output
  with one failure. The agent is asked to run the suite and reply with only the failing test name.
  Success = the answer contains `handles concurrent writes without deadlock`.
- **Controlled toggle**: the two runs are identical except for HarnessTrim.
  - *vanilla* — `opencode run --pure` (disables external plugins, so no reduction).
  - *trimmed* — `opencode run` with the adapter active (auto-loaded from
    `task-failing-test/.opencode/plugin/`).
- **Token measurement**: each run uses `--format json`; `parse-usage.mjs` extracts the token usage
  and the assistant's answer from the event stream.

## Run it

Requires a reachable, tool-calling model (a coder model such as Qwen Coder is ideal; size matters
less than reliable tool-calling). Pass its OpenCode model id via `MODEL`:

```sh
MODEL=GMKtec/qwen/qwen3-coder-next ./run-e2e.sh
```

Outputs a vanilla-vs-trimmed comparison and writes raw logs to `reports/`. Token counts are
model-dependent and this runs each condition once, so treat one run as anecdotal, not statistical.

## What's verified vs pending

**Verified (deterministic, no model):**
- The fixture emits 1237 chars / 41 lines and exits non-zero, with the failing test named.
- Running that output through `harnesstrim reduce` shrinks it **1235 → 519 chars (~58%)** while
  preserving every signal line (the failing test name, the `Received: "deadlock detected"` assertion,
  and the `1 failed, 23 passed` summary). This is the per-task tool-output win, measured without any
  model — a concrete preview of what the trimmed run feeds the model instead of the raw dump.
- `parse-usage.mjs` correctly extracts tokens + answer from a representative event stream.

## Live result (2026-07-13)

First real end-to-end run, model `opencode/deepseek-v4-flash-free` (OpenCode Zen), one run per
condition. **Both runs succeeded** — each correctly named the failing test, so quality was retained.

| Metric | Vanilla (`--pure`) | Trimmed | Δ |
| --- | --- | --- | --- |
| Fresh input tokens (non-cache) | 1254 | 507 | **−59.6%** |
| Total input (incl. cache) | 29,286 | 28,539 | −2.6% |
| Cache read | 28,032 | 28,032 | 0 (prefix untouched) |
| Output / reasoning | 210 / 210 | 210 / 192 | ~same |
| Total billed tokens | 29,706 | 28,941 | **−2.6%** |

Reading it honestly:
- On the **freshly-billed input** (where the tool output lands) the reduction is **~60%**, matching the
  deterministic tool-output shrink (1297 → 519 chars). That is the real per-tool-call win.
- On the **session total** it is only −2.6%, because OpenCode's fixed system prompt (~28k tokens,
  served from cache) dwarfs a single small tool output. The saving scales with how much noisy tool
  output a session produces relative to that fixed overhead — a trivial one-tool-call task is the
  worst case for the ratio, not the best.
- **Cache read is identical** in both runs: the reducer left the cacheable prefix untouched, so it
  did not bust the prompt cache (validating the cache-preservation KPI live).

This is a single anecdotal run on a tiny task, not a statistical claim. A fuller picture needs
larger, multi-tool-call tasks and several runs; `run-e2e.sh` is the harness to produce them.
