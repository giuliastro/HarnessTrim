---
name: delegate-bulk
description: This skill should be used when deciding whether to hand volumetric or noisy work to an isolated subagent (or another harness) instead of doing it in the main context — e.g. reading many files, digesting long logs/docs, wide searches, or bulk mechanical generation. It gives the rule for when isolation saves tokens versus when it just multiplies them. Part of the HarnessTrim token-economy stack.
version: 0.1.0
license: MIT
---

# delegate-bulk

Subagents are not free parallelism — each carries its own context and bills its own tokens. The
right move is surgical isolation of *noise*, not "multi-agent everything."

## Delegate to an isolated subagent when

- A task will **read a large volume the main thread doesn't need to retain** — many files, long
  logs, big docs, wide search results — and you only need the *conclusion* back, not the raw bytes.
- The work is **noisy but self-contained**: exploring a subsystem, triaging a failing test suite,
  digesting API docs. Isolate it so its raw output never pollutes the main context.
- You need **several independent investigations at once** and each one's detail is irrelevant to the
  others.

The token win comes from the subagent returning a short structured answer while its expensive
reading stays in a context you throw away.

## Do NOT delegate when

- The task is small enough that spawning a context costs more than it saves.
- The main thread needs the **full detail** anyway (delegating then re-reading is pure overhead).
- You'd spawn many agents that each re-load the same large context — that multiplies tokens, the
  opposite of the goal.

## Cross-harness delegation

The same logic extends across harnesses: route bulk scaffolding/boilerplate to a cheaper or
execution-oriented channel and keep architecture, review, and validation on the main one. Suppress
the delegated channel's verbose thinking/output from re-entering the main context. Pair with
[[scaffold-fast]] for the delegated bulk work and [[compact-handoff]] for what the subagent returns.

## Rule of thumb

Delegate to **shrink** what the main context must hold, never to **duplicate** it.
