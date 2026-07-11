/**
 * Guidance injected into the compaction prompt via `experimental.session.compacting`.
 * Mirrors the intent of the `compact-handoff` skill: tell the summarizer what must
 * survive compaction so the continuation doesn't re-read files and re-derive state.
 */
export const COMPACTION_HANDOFF_CONTEXT: string[] = [
  "Preserve in the summary, concisely: (1) the concrete task/goal and any acceptance criteria; " +
    "(2) decisions already made and rejected alternatives, so they are not re-litigated; " +
    "(3) exact file paths, symbols, commands, and config values discovered — these are expensive to re-derive; " +
    "(4) current state: what is done, what is verified, what is still failing. " +
    "Drop: narrated step-by-step history, tool output already acted on, and anything reconstructable from the diff.",
];
