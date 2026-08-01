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
  `handles concurrent writes without deadlock`. Three sizes, to show how the blended win scales with
  the amount of noisy output:
  - `task-failing-test/` — **small** output (~1.3 KB, 41 lines), one tool call.
  - `task-large-suite/` — **large** output (~9.1 KB, 274 lines): 20 suites × 12 cases.
  - `task-multi-step/` — **three noisy tool calls** (`npm test`, `npm run lint`, `npm run deps`):
    the multi-tool-call case where the model works through several tools in one session.
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
MODEL=opencode/deepseek-v4-flash-free ./run-e2e.sh                          # small task
TASK=task-large-suite MODEL=opencode/deepseek-v4-flash-free ./run-e2e.sh    # large task
TASK=task-multi-step MODEL=opencode/deepseek-v4-flash-free ./run-e2e.sh     # multi-tool-call
```

`PROMPT` and `EXPECTED` can be overridden per task, e.g. to ask the agent to run several tools:

```sh
TASK=task-multi-step PROMPT='Run the test suite, the linter, and the dependency audit, then reply with ONLY the failing test name.' EXPECTED='handles concurrent writes without deadlock' MODEL=... ./run-e2e.sh
```

Outputs a vanilla-vs-trimmed comparison and writes raw logs to `reports/<task>/`. Token counts are
model-dependent and each condition runs once per invocation, so treat few runs as anecdotal; run it
several times if you want a spread.

## What's verified

**Deterministic (no model):**
- The small fixture emits ~1.3 KB / 41 lines; `harnesstrim reduce` shrinks it **1235 → 519 chars
  (~58%)** preserving every signal line (failing test name, `Received: "deadlock detected"`, the
  `1 failed, 23 passed` summary). The large fixture emits ~9.1 KB / 274 lines and reduces
  **9147 → 504 chars (~94%)**, signal preserved.
- The multi-step fixture's per-call reduction, measured via `harnesstrim reduce`: `npm test`
  1649 → 814 chars (~51%, test-output-slim), `npm run deps` 6030 → 575 chars (~90%, json-output-slim).
  `npm run lint` (8.3 KB of lint-warning walls) matches **no** current reducer, so it is never
  reduced in either condition.
- `parse-usage.mjs` / `sum-session-tokens.mjs` extract tokens + answer correctly.

**End-to-end (with a model):** see the measured results below — quality retained in every run, blended
savings ~2% (tiny task) to ~22–25% (large-output task), and a noisy-but-mostly-positive signal on the
multi-tool-call task.

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
  not a single anecdote.

## Measured multi-tool-call results (2026-08-01)

`task-multi-step`, **five runs each condition**, model `opencode/deepseek-v4-flash-free`, corrected
token accounting. **All 10 runs succeeded** — the failing test was named every time. The fixture
emits three noisy tool calls: `npm test` (1649 chars), `npm run lint` (8327 chars, no reducer
matches), and `npm run deps` (6030 chars of JSON).

| Run | Vanilla billed | Trimmed billed | Δ % | cacheRead vanilla | cacheRead trimmed |
| --- | --- | --- | --- | --- | --- |
| 1 | 17,188 | 20,206 | **+17.6%** | 46,208 | 46,976 |
| 2 | 22,198 | 19,974 | −10.0% | 45,952 | 46,208 |
| 3 | 28,491 | 19,771 | **−30.6%** | 52,608 | 45,824 |
| 4 | 17,718 | 17,200 | −2.9% | 46,720 | 45,696 |
| 5 | 22,108 | 20,179 | −8.7% | 45,952 | 46,976 |

Reading it honestly:
- **Billed tokens (non-cache: fresh input + output + reasoning) are dominated by the number of
  steps the model happens to choose.** Each step's message carries its own fresh-input record, so a
  5-step run costs far more than a 3-step run regardless of reduction. Across these five pairs the
  trimmed run won 4/5 (−2.9% to −30.6%) and lost one (+17.6%) — the losing run is where the model
  took more steps in the trimmed condition, not a sign the reducer hurt quality (success was 5/5).
- **Quality never dropped** in any of the ten runs, including the runs where the trimmed side spent
  more tokens: the failing test was named correctly every time.
- **Cache read tracks step count**, not the reducer. Where step counts differ the numbers differ;
  where they match (runs 2 and 4) they're within one step's worth of noise. Cache preservation was
  already validated deterministically in the single-tool task.
- The lint wall (8.3 KB) matches no reducer, so a `lint-output-slim` reducer is a clear open win
  (see PLAN); its 8.3 KB is 41% of the fixture's total noisy output.
- Net: on a task with *three* noisy calls the signal is mostly positive but noisier than the
  single-tool tasks — step-count variance (not the reducer) dominates the session total. The
  deterministic per-call win remains the ground truth (Tier A); session-level % is a blend.

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
