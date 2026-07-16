import type { Reducer, ReducerResult } from "./reducers/types.ts";
import { testOutputSlim } from "./reducers/test-output-slim.ts";
import { gitDiffSlim } from "./reducers/git-diff-slim.ts";
import { genericTextSlim } from "./reducers/generic-text-slim.ts";
import { jsonOutputSlim } from "./reducers/json-output-slim.ts";
import { fileListingSlim } from "./reducers/file-listing-slim.ts";
import { cronOutputSlim } from "./reducers/cron-output-slim.ts";

/** Below this length, reducing isn't worth it and risks churning small, stable content. */
export const DEFAULT_MIN_LENGTH = 400;

const GIT_DIFF_RE = /^diff --git /m;
const TEST_OUTPUT_RE =
  /\b\d+\s+(passed|failed)\b|^(PASS|FAIL)\s|::\w.*\b(PASSED|FAILED)\b|=+\s*(FAILURES|short test summary)/im;
// JSON: starts with [ or { (possibly preceded by whitespace)
const JSON_RE = /^\s*[\[{]/m;
// File listing: ls permissions, find ./path, real tree branches, or search_files output
const FILE_LISTING_RE = /(?:^total\s+\d+|^[\-bcdlsp][\-r][\-w][\-xs\-][\-r][\-w][\-xs\-][\-r][\-w][\-xs\-]|^\.\/(?:\.|[^.\s])|^\s*(?:├──|└──|│\s+)|^[\w.\/\-]+\.[a-zA-Z]{1,4}:\d+\|)/m;
const CRON_OUTPUT_RE = /^# Cron Job:.*\n[\s\S]*^## Prompt\s*$[\s\S]*^## Response\s*$/m;
// Long-form text: has long prose paragraphs (lines of text without structural markers).
// Used as lowest-priority catch-all for briefings, reports, feature ideas, etc.
const LONG_TEXT_RE = /^#{1,4}\s.*\n(?:(?!^#{1,4}\s|^diff --git |^```).*\n){5,}/m;

/**
 * Content-based reducer selection. Detects what a blob of tool output actually is
 * (a git diff, test-runner output, ...) and returns the matching reducer, or null
 * if nothing applies. Kept in core (not the adapter) so every harness adapter shares
 * the same detection logic and it can be unit-tested without a live harness.
 */
export function pickReducer(text: string): Reducer | null {
  if (GIT_DIFF_RE.test(text)) return gitDiffSlim;
  if (TEST_OUTPUT_RE.test(text)) return testOutputSlim;
  // A Hermes cron archive embeds arbitrary prompts/skills, so identify it before
  // inspecting JSON or listing-looking lines inside that archival prompt.
  if (CRON_OUTPUT_RE.test(text) && text.length >= 400) return cronOutputSlim;
  if (JSON_RE.test(text) && text.length >= 400) return jsonOutputSlim;
  if (FILE_LISTING_RE.test(text) && text.length >= 400) return fileListingSlim;
  if (LONG_TEXT_RE.test(text) && text.length >= 1000) return genericTextSlim;
  return null;
}

export interface AutoReduceResult extends ReducerResult {
  /** Name of the reducer that ran, or null if none matched / input too short. */
  readonly reducer: string | null;
}

/**
 * Pick the right reducer for `text` and apply it. Returns the input unchanged
 * (changed: false, reducer: null) when nothing matches or the input is below
 * `minLength`. Deterministic and idempotent, inheriting those guarantees from the
 * underlying reducers.
 */
export function reduceAuto(text: string, minLength: number = DEFAULT_MIN_LENGTH): AutoReduceResult {
  if (text.length < minLength) {
    return { output: text, changed: false, reducer: null };
  }
  const reducer = pickReducer(text);
  if (!reducer) {
    return { output: text, changed: false, reducer: null };
  }
  const result = reducer.reduce(text);
  // Safety net: never emit output larger than the input. On tiny inputs a collapse
  // marker can exceed the few lines it replaces; reduction must never backfire on
  // cost or cache, so fall back to the original in that case.
  if (!result.changed || result.output.length >= text.length) {
    return { output: text, changed: false, reducer: null };
  }
  return { ...result, reducer: reducer.name };
}
