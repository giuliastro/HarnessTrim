/**
 * A reducer takes raw tool/log output and returns a slimmed version.
 * Contract: deterministic and idempotent — reduce(reduce(x)) === reduce(x),
 * and the same input always produces the same output. This is required both
 * for prompt-cache stability (see PLAN.md §2.2) and for reproducible benchmarks.
 */
export interface Reducer {
  readonly name: string;
  reduce(input: string): ReducerResult;
}

export interface ReducerResult {
  readonly output: string;
  /** True if the reducer changed the input at all. */
  readonly changed: boolean;
  /** Human-readable note on what was dropped, for transparency/debugging. */
  readonly note?: string;
}
