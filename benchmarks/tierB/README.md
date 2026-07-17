# Tier B — end-to-end benchmark

Tier A measures the reducer in isolation (deterministic, no LLM). Tier B measures the *whole loop*:
it runs the **same real task** through OpenCode twice and compares

1. **total tokens** consumed in the session, and
2. **whether the task still succeeds** (quality retention).

The point is to show HarnessTrim cuts tokens without breaking the task. A token drop that also breaks
the task is worthless.

## Method

- **Tasks**: each is a project whose `npm test` prints noisy, mostly-passing output with one failure.
  The agent runs the suite and replies with only the failing test name; success = the answer contains
  `handles concurrent writes without deadlock`. Two sizes, to show how the blended win scales with the
  amount of noisy output:
  - `task-failing-test/` — **small** output (~1.3 KB, 41 lines).
  - `task-large-suite/` — **large** output (~9.1 KB, 274 lines): 20 suites × 12 cases.
- **Controlled toggle**: the two runs are identical except for HarnessTrim.
  - *vanilla* — `opencode run --pure` (disables external plugins, so no reduction).
  - *trimmed* — `opencode run` with the adapter active (auto-loaded from the task's
    `.opencode/plugin/`).
- **Token measurement**: streaming run, then `opencode export <sessionID>` summed by
  `sum-session-tokens.mjs`. That script counts each assistant message's `messages[i].info.tokens`
  exactly once — the export duplicates every token record under `parts[]` and adds a session-level
  `info.tokens`, so a naive deep walk double-counts (a bug fixed 2026-07-17). `billedTokens` =
  input + output + reasoning (new, non-cache tokens); `cacheRead` is reported separately.

## Run it

Requires a reachable, tool-calling model (a coder model such as Qwen Coder is ideal; size matters
less than reliable tool-calling). Pass its OpenCode model id via `MODEL`, and pick the task with
`TASK` (default `task-failing-test`):

```sh
MODEL=opencode/deepseek-v4-flash-free ./run-e2e.sh                     # small task
TASK=task-large-suite MODEL=opencode/deepseek-v4-flash-free ./run-e2e.sh  # large task
```

Outputs a vanilla-vs-trimmed comparison and writes raw logs to `reports/<task>/`. Token counts are
model-dependent and each condition runs once per invocation, so treat few runs as anecdotal.

## What's verified

**Deterministic (no model):**
- The small fixture emits ~1.3 KB / 41 lines; `harnesstrim reduce` shrinks it **1235 → 519 chars
  (~58%)** preserving every signal line (failing test name, `Received: "deadlock detected"`, the
  `1 failed, 23 passed` summary). The large fixture emits ~9.1 KB / 274 lines and reduces
  **9147 → 504 chars (~94%)**, signal preserved.
- `parse-usage.mjs` / `sum-session-tokens.mjs` extract tokens + answer correctly.

**End-to-end (with a model):** see the 2026-07-17 measured results above — 2 tasks × 2 runs, quality
retained in all 8, blended savings ~2% (tiny task) to ~22–25% (large-output task), cache preserved.

## Measured multi-task results (2026-07-17)

Two tasks (small + large noisy output), **two runs each condition**, model
`opencode/deepseek-v4-flash-free` (OpenCode Zen), corrected token accounting (dedup fix above).
**All 8 runs succeeded** — every run named the failing test, so quality was retained throughout.

| Task | Run | Vanilla billed | Trimmed billed | Δ tokens | Δ % | cacheRead (both) |
| --- | --- | --- | --- | --- | --- | --- |
| small (~1.3 KB out) | 1 | 9,953 | 9,682 | −271 | −2.7% | 9,344 |
| small | 2 | 9,864 | 9,690 | −174 | −1.8% | 9,344 |
| large (~9.1 KB out) | 1 | 10,669 | 7,961 | −2,708 | **−25.4%** | 11,179 |
| large | 2 | 12,372 | 9,627 | −2,745 | **−22.2%** | 9,344 |

Reading it honestly:
- **The absolute saving is stable and attributable.** Trimming saves ~200 tokens on the small task
  and ~2,700 on the large one — each Δ matches that task's deterministic tool-output reduction
  (1297→519 and 9208→504 chars). The reducer is doing exactly, and only, what the Tier A number says.
- **The blended % scales with noisy-output volume vs fixed overhead.** A tiny one-tool-call task saves
  ~2%; a task with a large noisy suite saves **~22–25%**. This is the honest shape of the win: the
  more (and noisier) the tool output a session produces relative to the fixed cached prompt, the
  bigger the blended cut. Real debugging sessions with many noisy calls sit toward the high end.
- **Cache read is identical** across each vanilla/trimmed pair: the reducer never touched the
  cacheable prefix, so it did not bust the prompt cache (cache-preservation KPI, validated live).
- Still model-dependent and few-run, not a statistical study — but now measured across output sizes,
  not a single anecdote. Larger fleets / multi-tool-call tasks remain future work.

## Live result (2026-07-13)

> Note: the totals below used the pre-fix token sum (a deep walk that double-counted the duplicated
> `parts[]` records), so the *absolute* session numbers are inflated; the −60% fresh-input and the
> cache-preservation conclusions still hold. See the 2026-07-17 section for corrected accounting.

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
