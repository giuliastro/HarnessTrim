import type { Reducer, ReducerResult } from "./types.ts";

const MARKER_PREFIX = "[harnesstrim:lint-output-slim]";

// A lint-warning wall line, e.g. eslint: `src/auth.js:20:15  warning  no-console - line should match...`
// or tsc/pylint-style `path:line:col severity rule ...`. The file:line:col position and the
// per-line message are noise; what the model needs is which rules fired and how often.
const LINT_LINE_RE = /^[\w.\/\\-]+:\d+:\d+\s+(warning|error)\s+([\w@.\/-]+)/;

// Summary/footer lines keep the totals ("✖ 90 warnings", "N files checked", "Run eslint --fix ...").
const SUMMARY_RE = /(?:✖|✗|N errors?)\s*\d+\s+(?:warnings?|errors?)|files? checked|Run\s+\S+\s+--fix|\d+\s+(?:warning|error)s?$/i;

// How many rules to enumerate in the collapse marker before truncating to "+N more".
const MAX_RULES_IN_MARKER = 8;

interface RuleCount {
  severity: "warning" | "error";
  rule: string;
  count: number;
}

function isLintLine(line: string): boolean {
  return LINT_LINE_RE.test(line);
}

function isKeepLine(line: string): boolean {
  return line.startsWith(MARKER_PREFIX) || SUMMARY_RE.test(line);
}

/**
 * Reduces lint-warning walls (eslint/tsc/pylint style `path:line:col severity rule ...`
 * repeated hundreds of times) to a single per-run marker enumerating which rules fired
 * and how often, preserving the summary/footer totals. Deterministic and idempotent:
 * marker lines always start with MARKER_PREFIX and never match LINT_LINE_RE, so
 * re-running on already-reduced output is a no-op.
 */
export const lintOutputSlim: Reducer = {
  name: "lint-output-slim",
  reduce(input: string): ReducerResult {
    const lines = input.split(/\r?\n/);
    const out: string[] = [];
    let droppedTotal = 0;

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!isLintLine(line)) {
        out.push(line);
        i++;
        continue;
      }

      // Gather a contiguous run of lint lines and aggregate it per rule.
      const counts: RuleCount[] = [];
      const byKey = new Map<string, RuleCount>();
      let runEnd = i;
      while (runEnd < lines.length && isLintLine(lines[runEnd])) {
        const m = LINT_LINE_RE.exec(lines[runEnd]);
        const severity = (m![1] === "error" ? "error" : "warning") as "warning" | "error";
        const rule = m![2];
        const key = `${severity}:${rule}`;
        const existing = byKey.get(key);
        if (existing) {
          existing.count++;
        } else {
          const entry = { severity, rule, count: 1 };
          byKey.set(key, entry);
          counts.push(entry);
        }
        runEnd++;
      }

      const runLength = runEnd - i;
      if (runLength >= 2) {
        const parts = counts.slice(0, MAX_RULES_IN_MARKER).map(
          (c) => `${c.rule} ×${c.count}`,
        );
        const truncated = counts.length > MAX_RULES_IN_MARKER;
        const suffix = truncated ? `, +${counts.length - MAX_RULES_IN_MARKER} more rule(s)` : "";
        const severities =
          counts.some((c) => c.severity === "error") && counts.some((c) => c.severity === "warning")
            ? "error(s) and warning(s)"
            : counts.some((c) => c.severity === "error")
              ? "error(s)"
              : "warning(s)";
        out.push(`${MARKER_PREFIX} omitted ${runLength} lint line(s) (${severities}: ${parts.join(", ")}${suffix})`);
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
      note: droppedTotal > 0 ? `dropped ${droppedTotal} lint noise line(s)` : undefined,
    };
  },
};
