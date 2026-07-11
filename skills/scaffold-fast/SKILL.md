---
name: scaffold-fast
description: This skill should be used for mechanical, low-novelty coding work — generating boilerplate, wiring up a component from an existing pattern, adding a CRUD endpoint like the others, writing repetitive tests, or applying a rote transformation across files. It keeps reasoning effort low and output terse for work whose shape is already decided. Part of the HarnessTrim token-economy stack; the lean-scaffold preset pairs it with low reasoning effort.
version: 0.1.0
license: MIT
---

# scaffold-fast

When the *shape* of the work is already decided and the task is to produce more of it, spend tokens
on the code, not on deliberation. Deep reasoning on rote work is wasted budget.

## When this applies

- Boilerplate: config files, DTOs, barrel exports, index files.
- "Same as the others" work: a new endpoint/component/model that mirrors existing ones.
- Repetitive tests following an established pattern.
- Mechanical transforms: rename a symbol across files, migrate a call signature, reformat.

## Rules

1. **Copy the existing pattern, don't reinvent it.** Find the nearest sibling (the last component,
   the adjacent endpoint) and match its structure, naming, imports, and error handling exactly.
2. **Minimal reasoning.** Don't weigh architectural alternatives for work whose design is settled —
   if you find yourself deliberating, that's a signal the task is *not* scaffolding and this skill
   doesn't apply.
3. **Terse output.** State what was generated in one line; the diff shows the rest. No walkthrough.
4. **Don't gold-plate.** No speculative abstraction, options, or config for needs nobody stated.
5. **Batch mechanical edits** rather than narrating each one.

## When to STOP and escalate

If the "boilerplate" turns out to require a real decision — an unclear data model, a security
boundary, an ambiguous requirement — stop scaffolding and surface the decision. Fast is for settled
work, not for guessing past ambiguity. See [[delegate-bulk]] when the volume itself is the problem.
