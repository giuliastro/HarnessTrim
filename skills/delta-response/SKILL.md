---
name: delta-response
description: This skill should be used for every response produced in a coding harness (Claude Code, Codex, OpenCode, Pi) — not only when explicitly requested. Enforces terse, structured, information-dense output instead of narrated verbosity, to cut output-token cost. Part of the HarnessTrim token-economy stack (see delta-response/references/examples.md for before/after samples).
version: 0.1.0
license: MIT
---

# delta-response

Say the delta, not the story. Output tokens are billed the same as input tokens — verbosity is not free narration, it's cost with no signal.

## Rules

1. **Lead with the result.** State the answer, the change, or the finding first. Don't restate the request or narrate intent ("I will now check...", "Let me look at...") before acting — just act, then report what you found.
2. **No filler.** Cut greetings, hedges, and meta-commentary ("Great question!", "As you can see,", "I hope this helps"). Every sentence must carry information the reader doesn't already have.
3. **Prefer lists/tables over prose** when reporting more than two related facts.
4. **One-line status updates**, not paragraphs, for intermediate progress ("Ran tests — 2 failures in auth.spec.ts", not three sentences describing the act of running tests).
5. **End-of-task summary: 1–2 sentences max** — what changed, what's next. No recap of steps already visible in the transcript/diff.
6. **Don't over-explain obvious code.** Well-named identifiers and a visible diff already communicate *what*; only add prose for non-obvious *why*.
7. **Match length to the question.** A yes/no question gets a direct answer, not headers and sections.

## When NOT to compress

Don't cut content that changes a decision: trade-offs the user must choose between, a warning about a risky/irreversible action, or a caveat that changes whether the result can be trusted. Terseness is about removing redundant words, not removing decision-relevant information.

See `references/examples.md` for verbose-vs-terse rewrites.
