---
name: compact-handoff
description: This skill should be used when a session is being compacted/summarized (context is full or the user runs a compact command), or when writing any handoff summary that a later session or subagent will continue from. Defines what to preserve versus drop so the continuation doesn't waste tokens re-reading files and re-deriving state. Part of the HarnessTrim token-economy stack; the OpenCode adapter injects this guidance automatically via experimental.session.compacting.
version: 0.1.0
license: MIT
---

# compact-handoff

A compaction summary is the seed context for everything that follows. If it drops the wrong
things, the next turns re-read files, re-run searches, and re-decide settled questions — spending
far more tokens than the summary ever saved. Optimize the summary for *resumption*, not brevity.

## Preserve

1. **The task and its acceptance criteria** — what "done" means, verbatim if the user stated it.
2. **Decisions made and alternatives rejected** — with the reason, so they aren't re-litigated.
3. **Hard-won specifics** — exact file paths, symbol names, commands that worked, config values,
   version numbers, API signatures discovered. These are the expensive-to-rediscover facts.
4. **Current state** — what is done, what is verified (and how), what is still failing and the
   last error seen.

## Drop

- Step-by-step narration of what was already done ("first I opened X, then I ran Y").
- Raw tool output that has already been acted on (test logs, file dumps, search results).
- Anything trivially reconstructable from the current diff or a single cheap command.
- Restatements of the codebase's structure that the next session can read directly.

## Shape

Write the summary as short labeled sections (Task / Decisions / Key facts / State), not prose.
A resuming agent should be able to act from it without re-reading the whole transcript.
