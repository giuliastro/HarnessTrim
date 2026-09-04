import type { Reducer, ReducerResult } from "./types.ts";

const MARKER_PREFIX = "[harnesstrim:ci-log-slim]";
const MIN_NOISE_RUN = 3;

const SIGNAL_RE = /\b(?:error|warning|warn|fail(?:ed|ure)?|fatal|exception|traceback)\b|exit code/i;

const CI_NOISE_PATTERNS: readonly RegExp[] = [
  /##\[debug\]/,
  /^Syncing repository:/,
  /^Getting Git version info$/,
  /^Temporarily overriding HOME=/,
  /^Adding repository directory to the temporary git global config as a safe directory$/,
  /^Disabling automatic garbage collection$/,
  /^Setting up auth$/,
  /^Persisting credentials$/,
  /^Fetching the repository$/,
  /^Determining the checkout info$/,
  /^Checking out the ref$/,
  /^Post job cleanup\.$/,
  /^Cleaning up orphan processes$/,
  /^git version \d/i,
  /^\/usr\/bin\/git config --global --add safe\.directory /,
  /^\/usr\/bin\/git config --local --name-only --get-regexp /,
];

function stripGhRunPrefix(line: string): string {
  // `gh run view --log` commonly prefixes lines with `<job>\t<step>\t<timestamp>`.
  const parts = line.split("\t");
  return parts.length >= 4 ? parts.slice(3).join("\t") : line;
}

function isNoiseLine(line: string): boolean {
  if (line.startsWith(MARKER_PREFIX)) return false;
  const payload = stripGhRunPrefix(line).trim();
  if (!payload || SIGNAL_RE.test(payload)) return false;
  return CI_NOISE_PATTERNS.some((pattern) => pattern.test(payload));
}

/**
 * Collapses only known-benign GitHub Actions / `gh run view --log` boilerplate runs.
 * Error, warning, failure and exit-code lines are never classified as noise. Short runs stay
 * untouched so a few setup lines do not get replaced by a marker larger than the input.
 *
 * The reducer is deterministic and idempotent: its own marker is never treated as noise.
 */
export const ciLogSlim: Reducer = {
  name: "ci-log-slim",
  reduce(input: string): ReducerResult {
    const lines = input.split(/\r?\n/);
    const out: string[] = [];
    let dropped = 0;

    let index = 0;
    while (index < lines.length) {
      if (!isNoiseLine(lines[index])) {
        out.push(lines[index]);
        index += 1;
        continue;
      }

      let end = index;
      while (end < lines.length && isNoiseLine(lines[end])) end += 1;
      const runLength = end - index;

      if (runLength >= MIN_NOISE_RUN) {
        out.push(`${MARKER_PREFIX} omitted ${runLength} CI setup/debug line(s)`);
        dropped += runLength;
      } else {
        for (let cursor = index; cursor < end; cursor += 1) out.push(lines[cursor]);
      }
      index = end;
    }

    return {
      output: out.join("\n"),
      changed: dropped > 0,
      note: dropped > 0 ? `dropped ${dropped} CI setup/debug line(s)` : undefined,
    };
  },
};
