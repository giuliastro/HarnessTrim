import type { Reducer, ReducerResult } from "./types.ts";

const MARKER_PREFIX = "[harnesstrim:package-manager-output-slim]";
const PNPM_PROGRESS_RE = /^Progress:\s+resolved\s+\d+,\s+reused\s+\d+,\s+downloaded\s+\d+,\s+added\s+\d+(?:,\s+done)?\s*$/;
const DECORATION_RE = /^[+\-]{20,}\s*$/;

function isProgress(line: string): boolean {
  return PNPM_PROGRESS_RE.test(line);
}

function isDecoration(line: string): boolean {
  return DECORATION_RE.test(line);
}

/**
 * Collapse pnpm's repeated install progress snapshots while preserving the final snapshot and every
 * semantic line around it (package counts, warnings, deprecations, lifecycle errors, timings, etc.).
 *
 * The reducer intentionally recognizes only pnpm's stable `Progress: resolved ..., reused ...,
 * downloaded ..., added ...` shape. npm/yarn output is left untouched until separately fixture-proven.
 */
export const packageManagerOutputSlim: Reducer = {
  name: "package-manager-output-slim",
  reduce(input: string): ReducerResult {
    if (input.includes(MARKER_PREFIX)) {
      return { output: input, changed: false };
    }

    const lines = input.split(/\r?\n/);
    const progressIndexes = lines
      .map((line, index) => (isProgress(line) ? index : -1))
      .filter((index) => index >= 0);

    // A single progress snapshot is useful state, and two lines rarely repay a collapse marker.
    if (progressIndexes.length < 3) {
      return { output: input, changed: false };
    }

    const finalProgressIndex = progressIndexes[progressIndexes.length - 1];
    const out: string[] = [];
    let omittedProgress = 0;
    let omittedDecoration = 0;
    let markerWritten = false;

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];

      if (isProgress(line) && index !== finalProgressIndex) {
        omittedProgress += 1;
        if (!markerWritten) {
          out.push(MARKER_PREFIX);
          markerWritten = true;
        }
        continue;
      }

      // pnpm prints long +/- bars beside package-count output. Only remove them after this blob has
      // already qualified as a pnpm progress wall; standalone punctuation is never matched here.
      if (isDecoration(line)) {
        omittedDecoration += 1;
        if (!markerWritten) {
          out.push(MARKER_PREFIX);
          markerWritten = true;
        }
        continue;
      }

      out.push(line);
    }

    if (!markerWritten) return { output: input, changed: false };

    const markerIndex = out.indexOf(MARKER_PREFIX);
    out[markerIndex] =
      `${MARKER_PREFIX} omitted ${omittedProgress} intermediate progress snapshot(s)` +
      (omittedDecoration > 0 ? ` and ${omittedDecoration} decorative line(s)` : "");

    return {
      output: out.join("\n"),
      changed: true,
      note: `dropped ${omittedProgress} pnpm progress snapshot(s)` +
        (omittedDecoration > 0 ? ` and ${omittedDecoration} decorative line(s)` : ""),
    };
  },
};
