import type { Reducer, ReducerResult } from "./types.ts";

const MARKER_PREFIX = "[harnesstrim:test-output-slim]";

// Lines that carry signal: failures, errors, exceptions, assertions, summaries,
// and the expected/received diff lines assertion libraries print alongside them.
const SIGNAL_RE =
  /\b(fail(ed|ure)?|error|exception|traceback \(most recent call last\)|assert(ion)?|expected|received)\b/i;
const SUMMARY_RE = /\b\d+\s+(passed|failed|errors?|skipped|pending)\b/i;
// Stack frame lines (JS "at ...", Python "File "...") carry signal regardless of context window.
const STACK_FRAME_RE = /^\s*at\s|^\s*File "/;

// How many lines after a signal line to keep unconditionally (stack trace continuation).
const CONTEXT_AFTER = 5;

// Minimum run length of droppable lines before we bother collapsing them.
const MIN_COLLAPSE_RUN = 2;

function isKeepLine(line: string): boolean {
  return (
    line.startsWith(MARKER_PREFIX) ||
    SIGNAL_RE.test(line) ||
    SUMMARY_RE.test(line) ||
    STACK_FRAME_RE.test(line)
  );
}

/**
 * Reduces test-runner output (jest, pytest, mocha, etc.) to failure/error signal
 * plus a small stack-trace context window, collapsing runs of pure pass-noise
 * into a single count marker. Deterministic and idempotent (see types.ts contract):
 * marker lines are always re-kept verbatim, so re-running on already-reduced
 * output is a no-op.
 */
export const testOutputSlim: Reducer = {
  name: "test-output-slim",
  reduce(input: string): ReducerResult {
    const lines = input.split(/\r?\n/);
    const keep = new Array<boolean>(lines.length).fill(false);

    for (let i = 0; i < lines.length; i++) {
      if (isKeepLine(lines[i])) {
        keep[i] = true;
        for (let j = i + 1; j <= Math.min(i + CONTEXT_AFTER, lines.length - 1); j++) {
          keep[j] = true;
        }
      }
    }

    const out: string[] = [];
    let i = 0;
    let droppedTotal = 0;
    while (i < lines.length) {
      if (keep[i]) {
        out.push(lines[i]);
        i++;
        continue;
      }
      let runEnd = i;
      while (runEnd < lines.length && !keep[runEnd]) runEnd++;
      const runLength = runEnd - i;
      if (runLength >= MIN_COLLAPSE_RUN) {
        out.push(`${MARKER_PREFIX} omitted ${runLength} passing/noise line(s)`);
        droppedTotal += runLength;
      } else {
        for (let j = i; j < runEnd; j++) out.push(lines[j]);
      }
      i = runEnd;
    }

    const output = out.join("\n");
    return {
      output,
      changed: droppedTotal > 0,
      note: droppedTotal > 0 ? `dropped ${droppedTotal} noise line(s)` : undefined,
    };
  },
};
