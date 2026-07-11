---
name: debug-log-slim
description: This skill should be used before pasting, printing, or otherwise embedding test-runner output, build logs, or CI output into the conversation — whenever a test suite, linter, or build was just run and its raw output is large. Filters logs down to failure/error signal before they enter context. Part of the HarnessTrim token-economy stack (see packages/core/src/reducers/test-output-slim.ts for the reference implementation the OpenCode adapter automates this with).
version: 0.1.0
license: MIT
---

# debug-log-slim

Raw test/build output is mostly noise: hundreds of PASS/OK lines for every one line that
actually matters. Don't paste it all into context — filter first.

## Rule

Before showing test/build/lint output to the user or reasoning over it at length, reduce it to:

1. **Every FAIL / ERROR / Exception / Traceback / assertion line.**
2. **A few lines of context around each** (the stack frame or expected/received diff — usually
   3–5 lines is enough to act on).
3. **The final summary line** (e.g. `12 passed, 3 failed`), always kept verbatim.
4. **Everything else collapsed** into a single count, e.g. `… 40 passing lines omitted …` — never
   silently dropped without saying how much was cut.

## How to apply it

- If the HarnessTrim OpenCode adapter is installed, this happens automatically via
  `tool.execute.before` — no manual filtering needed, this skill is then just a fallback for
  contexts where the adapter isn't wired in.
- Without the adapter: when a command produces long output, pipe it through a targeted filter
  before reading it in full — e.g. `grep -E 'FAIL|ERROR|Exception' -A 5` (adjust the pattern to
  the test runner's failure markers) — rather than reading the entire raw log.
- Never summarize-then-discard: if you filtered, the user should still be able to ask "show me
  the full log" and get it — filtering is about what enters *reasoning context* by default, not
  deleting the underlying artifact.

## What NOT to filter out

- Warnings that indicate a real (if non-fatal) problem — e.g. deprecation notices tied to the
  change just made.
- Anything the user explicitly asked to see in full.
