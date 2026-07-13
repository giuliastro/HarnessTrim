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

**Pending a reachable model:** the live vanilla-vs-trimmed token/quality numbers. At build time the
reference model host (a LAN box behind the `GMKtec` provider) was offline/unresolvable, so the
end-to-end run has not been executed yet. Point `MODEL` at any reachable tool-calling model and run
the command above to produce it.
