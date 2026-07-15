import type { Reducer, ReducerResult } from "./types.ts";

const MARKER_PREFIX = "[harnesstrim:file-listing-slim]";

// How many leading lines to keep unconditionally
const HEADER_KEEP = 5;
// How many trailing lines to keep unconditionally
const FOOTER_KEEP = 3;
// Minimum total line count before collapsing
const MIN_LINES = 20;
// Fraction of lines that must be "file-like" (contain spaces, dots, path chars)
const FILE_LIKE_THRESHOLD = 0.5;
// How many entries at the start of a file run to keep
const LEADING_ENTRIES = 4;
// How many entries at the end of a file run to keep
const TRAILING_ENTRIES = 3;
// Minimum run of file entries before we bother collapsing
const MIN_FILE_RUN = 10;

function isFileEntry(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false; // blank lines are NOT file entries

  // ls-style: permissions + owner + size + date + filename
  if (/^[\-bcdlsp][\-r][\-w][\-xs\-][\-r][\-w][\-xs\-][\-r][\-w][\-xs\-]/.test(trimmed)) return true;

  // find-style: ./path/to/file
  if (/^\.\/(?:\.|[^.\s])/.test(trimmed)) return true;

  // tree-style: unicode box-drawing prefix
  if (/^[\s]*[│├└─+\\|]/.test(trimmed)) return true;

  // search_files style: "path/to/filename:line|content"
  if (/^[\w.\/\-]+\.[a-zA-Z]{1,4}:\d+\|/.test(trimmed)) return true;

  // "total N" line (ls header)
  if (/^total\s+\d+$/.test(trimmed)) return true;

  return false;
}

/**
 * Reduces file-listing output (ls -la, find, tree, search_files)
 * by keeping the first/last few entries in each run of file lines
 * and collapsing the middle with a count summary.
 *
 * Keeps:
 *   - First HEADER_KEEP lines (header metadata, column headers)
 *   - Last FOOTER_KEEP lines (summary, prompt return)
 *   - In each file entry run: first LEADING_ENTRIES + last TRAILING_ENTRIES
 *
 * Deterministic and idempotent: once collapsed, the summary markers
 * don't match isFileEntry on re-reduction.
 */
export const fileListingSlim: Reducer = {
  name: "file-listing-slim",
  reduce(input: string): ReducerResult {
    const lines = input.split(/\r?\n/);
    const n = lines.length;

    if (n < MIN_LINES) return { output: input, changed: false };

    // Check if this looks like a file listing
    let nonBlank = 0;
    let fileLike = 0;
    for (const line of lines) {
      if (line.trim()) {
        nonBlank++;
        if (isFileEntry(line)) fileLike++;
      }
    }

    if (nonBlank === 0 || fileLike / nonBlank < FILE_LIKE_THRESHOLD) {
      return { output: input, changed: false };
    }

    const keep = new Array<boolean>(n).fill(false);

    // Always keep first HEADER_KEEP lines
    for (let i = 0; i < Math.min(HEADER_KEEP, n); i++) keep[i] = true;

    // Always keep last FOOTER_KEEP lines
    for (let i = Math.max(0, n - FOOTER_KEEP); i < n; i++) keep[i] = true;

    // Process contiguous runs of file entries
    let i = 0;
    while (i < n) {
      if (!isFileEntry(lines[i])) {
        i++;
        continue;
      }

      // Start of a file entry run
      const runStart = i;
      while (i < n && isFileEntry(lines[i])) i++;
      const runEnd = i;
      const runLength = runEnd - runStart;

      if (runLength >= MIN_FILE_RUN) {
        // Keep first LEADING_ENTRIES entries
        for (let j = runStart; j < runStart + Math.min(LEADING_ENTRIES, runLength); j++) {
          keep[j] = true;
        }
        // Keep last TRAILING_ENTRIES entries
        for (let j = Math.max(runStart + LEADING_ENTRIES, runEnd - TRAILING_ENTRIES); j < runEnd; j++) {
          keep[j] = true;
        }
        // Middle will be collapsed
      } else {
        // Short run: keep all
        for (let j = runStart; j < runEnd; j++) keep[j] = true;
      }
    }

    // Build output, collapsing runs of non-kept lines
    const out: string[] = [];
    let pos = 0;
    let droppedTotal = 0;

    while (pos < n) {
      if (keep[pos]) {
        out.push(lines[pos]);
        pos++;
        continue;
      }

      // Start of a non-kept run
      const dropStart = pos;
      while (pos < n && !keep[pos]) pos++;
      const dropLength = pos - dropStart;

      if (dropLength >= 3) {
        out.push(`${MARKER_PREFIX} omitted ${dropLength} line(s)`);
        droppedTotal += dropLength;
      } else {
        // Short gap: pass through
        for (let j = dropStart; j < pos; j++) {
          out.push(lines[j]);
        }
      }
    }

    const changed = droppedTotal > 0;
    if (!changed) return { output: input, changed: false };

    return {
      output: out.join("\n"),
      changed: true,
      note: `collapsed ${droppedTotal} lines of file listing`,
    };
  },
};
