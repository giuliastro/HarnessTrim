import type { Reducer, ReducerResult } from "./reducers/types.ts";
import { testOutputSlim } from "./reducers/test-output-slim.ts";
import { gitDiffSlim } from "./reducers/git-diff-slim.ts";

/** Below this length, reducing isn't worth it and risks churning small, stable content. */
export const DEFAULT_MIN_LENGTH = 400;

const GIT_DIFF_RE = /^diff --git /m;
const TEST_OUTPUT_RE =
  /\b\d+\s+(passed|failed)\b|^(PASS|FAIL)\s|::\w.*\b(PASSED|FAILED)\b|=+\s*(FAILURES|short test summary)/im;

/**
 * Content-based reducer selection. Detects what a blob of tool output actually is
 * (a git diff, test-runner output, ...) and returns the matching reducer, or null
 * if nothing applies. Kept in core (not the adapter) so every harness adapter shares
 * the same detection logic and it can be unit-tested without a live harness.
 */
export function pickReducer(text: string): Reducer | null {
  if (GIT_DIFF_RE.test(text)) return gitDiffSlim;
  if (TEST_OUTPUT_RE.test(text)) return testOutputSlim;
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
