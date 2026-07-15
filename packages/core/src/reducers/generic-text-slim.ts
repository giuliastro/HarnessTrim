import type { Reducer, ReducerResult } from "./types.ts";

const MARKER_PREFIX = "[harnesstrim:generic-text-slim]";

// Signal lines — headers, emoji bullets, bold markers, tables, stats, action items
const HEADER_RE = /^#{1,6}\s/m;
const EMOJI_BULLET_RE = /^[\s]*[✅❌⚠️🔍📡🔧🚀🎯💡📝🔄⚡🎨🔒📊📍🏗️🧹⬆️⬇️🔀⏪📋📂🔐📖👀🛠️🔥♻️🧪🏁]/;
const BULLET_RE = /^\s*[-*+]\s/;
const NUMBERED_RE = /^\s*\d+[\.\)]\s/;
const BOLD_RE = /\*\*.+\*\*/;
const TABLE_RE = /^\s*\|.+\|\s*$/;
const HR_RE = /^---+$/;
const CODE_FENCE_RE = /^```/;
const STAT_RE = /\b\d+[%\w\/]/; // "52K", "44.097c", "−65%", "3 files"
const KEY_VALUE_RE = /^\s*\*{0,2}\w[\w\s]+\*{0,2}:/; // "**Key:** value" or "Name: value"

// Lines that should always survive reduction
const SIGNAL_RE = /^(#{1,6}\s|```|---+$)|[\s]*[✅❌⚠️🔍📡🔧🚀🎯💡📝🔄⚡🎨🔒📊📍🏗️🧹⬆️⬇️🔀⏪📋📂🔐📖👀🛠️🔥♻️🧪🏁]/;

// How many context lines after a signal to keep
const CONTEXT_AFTER = 2;

// Minimum run of non-signal lines before collapsing
const MIN_COLLAPSE_RUN = 3;

function isSignalLine(line: string): boolean {
  return (
    line.startsWith(MARKER_PREFIX) ||
    HEADER_RE.test(line) ||
    EMOJI_BULLET_RE.test(line) ||
    BULLET_RE.test(line) ||
    NUMBERED_RE.test(line) ||
    BOLD_RE.test(line) ||
    KEY_VALUE_RE.test(line) ||
    TABLE_RE.test(line) ||
    HR_RE.test(line) ||
    CODE_FENCE_RE.test(line)
  );
}

function isProseLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false; // blank lines are separators
  // A line is "prose" if it doesn't match any signal pattern
  return !isSignalLine(line);
}

/**
 * Reduces long-form text output (briefings, reports, feature ideas, status
 * updates) by collapsing runs of prose/narrative between structural elements
 * (headers, lists, tables, emoji markers, stats).
 *
 * Keeps:
 *   - All structural elements (headers, lists, tables, fences, HRs)
 *   - First and last CONTEXT_AFTER lines of the document
 *   - First line after each signal element (CONTEXT_AFTER context)
 *
 * Collapses:
 *   - Runs of pure prose > MIN_COLLAPSE_RUN lines into a count marker
 *
 * Deterministic and idempotent: marker lines survive re-reduction as signal.
 */
export const genericTextSlim: Reducer = {
  name: "generic-text-slim",
  reduce(input: string): ReducerResult {
    const lines = input.split(/\r?\n/);
    const n = lines.length;
    const keep = new Array<boolean>(n).fill(false);

    // Always keep first CONTEXT_AFTER lines (intro / header metadata)
    for (let i = 0; i < Math.min(CONTEXT_AFTER, n); i++) {
      keep[i] = true;
    }
    // Always keep last CONTEXT_AFTER lines (conclusion / signature / action)
    for (let i = Math.max(0, n - CONTEXT_AFTER); i < n; i++) {
      keep[i] = true;
    }

    for (let i = 0; i < n; i++) {
      if (isSignalLine(lines[i])) {
        keep[i] = true;
        // Keep a few lines after signal as context
        for (let j = i + 1; j <= Math.min(i + CONTEXT_AFTER, n - 1); j++) {
          keep[j] = true;
        }
      }
    }

    const out: string[] = [];
    let i = 0;
    let droppedTotal = 0;
    while (i < n) {
      if (keep[i]) {
        out.push(lines[i]);
        i++;
        continue;
      }
      let runEnd = i;
      while (runEnd < n && !keep[runEnd]) runEnd++;
      const runLength = runEnd - i;
      if (runLength >= MIN_COLLAPSE_RUN) {
        out.push(`${MARKER_PREFIX} omitted ${runLength} line(s) of prose/narrative`);
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
      note: droppedTotal > 0 ? `dropped ${droppedTotal} prose/narrative line(s)` : undefined,
    };
  },
};
