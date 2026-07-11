import type { Reducer, ReducerResult } from "./types.ts";

const MARKER_PREFIX = "[harnesstrim:git-diff-slim]";

// File paths whose diffs are near-never useful review signal: lockfiles,
// minified/generated bundles, source maps, build output.
const GENERATED_PATH_RE =
  /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|Cargo\.lock|go\.sum)$|\.min\.(js|css)$|\.map$|(^|\/)(dist|build)\//i;

const DIFF_HEADER_RE = /^diff --git a\/(.+) b\/(.+)$/;
const HUNK_HEADER_RE = /^@@ .*@@/;

function isBlockHeaderLine(line: string): boolean {
  return (
    DIFF_HEADER_RE.test(line) ||
    line.startsWith("index ") ||
    line.startsWith("--- ") ||
    line.startsWith("+++ ") ||
    line.startsWith("new file mode") ||
    line.startsWith("deleted file mode") ||
    line.startsWith("similarity index") ||
    line.startsWith("rename from") ||
    line.startsWith("rename to")
  );
}

/**
 * Reduces `git diff` output by collapsing the hunk bodies of generated/lockfile
 * paths (package-lock.json, dist/, *.min.js, ...) into a single added/removed
 * summary line, while leaving diffs of real source files untouched. Deterministic
 * and idempotent: once a block's hunks are collapsed to a summary line, there are
 * no hunk lines left to collapse on a second pass.
 */
export const gitDiffSlim: Reducer = {
  name: "git-diff-slim",
  reduce(input: string): ReducerResult {
    const lines = input.split(/\r?\n/);
    const out: string[] = [];
    let droppedTotal = 0;
    let i = 0;

    while (i < lines.length) {
      const headerMatch = DIFF_HEADER_RE.exec(lines[i]);
      if (!headerMatch) {
        out.push(lines[i]);
        i++;
        continue;
      }

      const filePath = headerMatch[2];
      const blockStart = i;
      let j = i + 1;
      while (j < lines.length && !DIFF_HEADER_RE.test(lines[j])) j++;
      const blockEnd = j; // exclusive

      if (!GENERATED_PATH_RE.test(filePath)) {
        for (let k = blockStart; k < blockEnd; k++) out.push(lines[k]);
        i = blockEnd;
        continue;
      }

      out.push(lines[blockStart]); // diff --git header, must come first

      let added = 0;
      let removed = 0;
      let hunkLineCount = 0;
      let inHunk = false;
      for (let k = blockStart + 1; k < blockEnd; k++) {
        const line = lines[k];
        if (isBlockHeaderLine(line)) {
          out.push(line);
          continue;
        }
        if (HUNK_HEADER_RE.test(line)) {
          inHunk = true;
          hunkLineCount++;
          continue;
        }
        if (inHunk) {
          hunkLineCount++;
          if (line.startsWith("+") && !line.startsWith("+++")) added++;
          else if (line.startsWith("-") && !line.startsWith("---")) removed++;
          continue;
        }
        // Not a header, not a hunk header, not inside a hunk yet: this is content
        // from an already-collapsed pass (e.g. our own marker line). Preserve it
        // verbatim so re-running the reducer on its own output is a true no-op.
        out.push(line);
      }

      if (hunkLineCount > 0) {
        out.push(`${MARKER_PREFIX} ${filePath}: +${added} -${removed} (generated/lockfile, hunk omitted)`);
        droppedTotal += hunkLineCount;
      }
      i = blockEnd;
    }

    const output = out.join("\n");
    return {
      output,
      changed: droppedTotal > 0,
      note: droppedTotal > 0 ? `collapsed ${droppedTotal} generated-file diff line(s)` : undefined,
    };
  },
};
