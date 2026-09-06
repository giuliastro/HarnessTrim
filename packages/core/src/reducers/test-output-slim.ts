import type { Reducer, ReducerResult } from "./types.ts";

const MARKER = "[harnesstrim:test-output-slim]";
const SIGNAL = /\b(fail(ed|ure)?|error|warn(ing)?|exception|traceback|assert(ion)?(error)?|expected|received)\b/i;
const PASS = /^(?:PASS\s+|\s*[\u2713\u2714]\s+|\S+::\S+\s+PASSED(?:\s|$))/;
const ANSI = /\x1b\[[0-?]*[ -/]*[@-~]/g;

/**
 * Remove only positively identified passing-test lines. Once a failure starts,
 * retain the entire diagnostic tail, including arbitrarily long assertion diffs,
 * source excerpts, warnings, command exit status and unknown future runner output.
 */
export const testOutputSlim: Reducer = {
  name: "test-output-slim",
  reduce(input: string): ReducerResult {
    if (input.includes(MARKER)) return { output: input, changed: false };
    const eol = input.includes("\r\n") ? "\r\n" : "\n";
    const lines = input.split(eol);
    const out: string[] = [];
    let run: string[] = [];
    let dropped = 0;
    let diagnosticTail = false;
    const flush = () => {
      if (run.length >= 2) {
        out.push(`${MARKER} omitted ${run.length} passing/noise line(s)`);
        dropped += run.length;
      } else out.push(...run);
      run = [];
    };
    for (const line of lines) {
      const clean = line.replace(ANSI, "");
      if (SIGNAL.test(clean) || /^\s*[A-Za-z]*Error:|^\s*[\u2715\u2717\u00d7\u25cf]\s/.test(clean)) diagnosticTail = true;
      if (!diagnosticTail && PASS.test(clean)) run.push(line);
      else { flush(); out.push(line); }
    }
    flush();
    const output = out.join(eol);
    return dropped > 0 && output.length < input.length
      ? { output, changed: true, note: `dropped ${dropped} confirmed passing-test lines` }
      : { output: input, changed: false };
  },
};
