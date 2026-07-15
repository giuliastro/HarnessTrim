import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
import {
  fileListingSlim,
  genericTextSlim,
  gitDiffSlim,
  jsonOutputSlim,
  testOutputSlim,
  type Reducer,
} from "@harnesstrim/core";
import { countTokens } from "./tokenizer.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, "../fixtures");
const reportPath = path.resolve(__dirname, "../reports/latest.json");

interface Fixture {
  file: string;
  reducer: Reducer;
  /**
   * Signal that MUST survive reduction — the errors, the changed files, the summary,
   * the next actionable line. Fidelity is measured as: how many of these are still
   * present in the reduced output. This is the "what survives" metric, not just tokens.
   */
  mustKeep: string[];
}

const FIXTURES: Fixture[] = [
  {
    file: "test-output/jest-mostly-pass.txt",
    reducer: testOutputSlim,
    mustKeep: [
      "FAIL src/utils/currency.test.ts", // failing suite
      "rounds half-even for JPY", // failing test name
      "Expected: 1200", // the assertion diff
      "Received: 1201",
      "at Object.<anonymous> (src/utils/currency.test.ts:20:18)", // stack frame
      "Tests:       1 failed, 21 passed, 22 total", // summary
    ],
  },
  {
    file: "test-output/pytest-mostly-pass.txt",
    reducer: testOutputSlim,
    mustKeep: [
      "test_tax_calculation_us FAILED", // failing test
      "AssertionError: assert Decimal('7.25') == Decimal('8.25')", // the assertion
      'File "tests/test_billing.py", line 142', // stack frame
      "FAILED tests/test_billing.py::test_tax_calculation_us", // summary line
      "1 failed, 18 passed in 0.87s", // summary
    ],
  },
  {
    file: "git-diff/lockfile-heavy.diff",
    reducer: gitDiffSlim,
    mustKeep: [
      "diff --git a/src/index.ts b/src/index.ts", // real changed file identity
      "structuredLogger({ level: config.logLevel })", // the actual change
      "app.use(requestId());",
      "diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml", // lockfile identity survives even though its body is collapsed
    ],
  },
  {
    file: "json/array-25.json",
    reducer: jsonOutputSlim,
    mustKeep: ["array with 25 total items", "record-01", "record-25"],
  },
  {
    file: "file-listing/ls-long.txt",
    reducer: fileListingSlim,
    mustKeep: ["total 128", "file-00.ts", "file-20.ts"],
  },
  {
    file: "generic-text/daily-briefing.md",
    reducer: genericTextSlim,
    mustKeep: ["# Daily engineering briefing", "## Actions", "Verify the plugin schema handling."],
  },
];

// Dropped lines matching this look like lost signal. Deliberately tight (no bare
// "error"/"warn") so dependency names like `http-errors` / `process-warning` in a
// collapsed lockfile don't register as false positives.
const AUDIT_SIGNAL_RE = /\b(fail(ed|ure)?|exception|traceback)\b|assertionerror/i;

export interface BenchRow {
  fixture: string;
  reducer: string;
  beforeChars: number;
  afterChars: number;
  beforeTokens: number;
  afterTokens: number;
  tokenReductionPct: number;
  mustKeepTotal: number;
  mustKeepKept: number;
  droppedSignalLines: string[];
}

export interface BenchReport {
  rows: BenchRow[];
  totalBefore: number;
  totalAfter: number;
  overallPct: number;
  signalTotal: number;
  signalKept: number;
  signalRecallPct: number;
  droppedSignalLines: number;
  /** True when every must-keep line survived and no signal-looking line was dropped. */
  fidelityOk: boolean;
}

function pct(before: number, after: number): number {
  if (before === 0) return 0;
  return Math.round((1 - after / before) * 1000) / 10;
}

function auditDroppedSignal(raw: string, reduced: string): string[] {
  const keptLines = new Set(reduced.split(/\r?\n/).map((l) => l.trim()));
  const dropped: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || keptLines.has(trimmed)) continue;
    if (AUDIT_SIGNAL_RE.test(trimmed)) dropped.push(trimmed);
  }
  return dropped;
}

/**
 * Run the Tier A micro-benchmark: apply each reducer to its fixtures, measure both
 * token reduction AND signal fidelity (how much must-keep signal survives, plus an
 * audit of dropped lines that look like signal). Prints a table, writes a JSON report,
 * and returns it. Fidelity is the headline: token savings only count if the signal lives.
 */
export function runBench(): BenchReport {
  const rows: BenchRow[] = FIXTURES.map(({ file, reducer, mustKeep }) => {
    const raw = fs.readFileSync(path.join(fixturesDir, file), "utf8");
    const result = reducer.reduce(raw);
    const beforeTokens = countTokens(raw);
    const afterTokens = countTokens(result.output);
    const mustKeepKept = mustKeep.filter((s) => result.output.includes(s)).length;
    return {
      fixture: file,
      reducer: reducer.name,
      beforeChars: raw.length,
      afterChars: result.output.length,
      beforeTokens,
      afterTokens,
      tokenReductionPct: pct(beforeTokens, afterTokens),
      mustKeepTotal: mustKeep.length,
      mustKeepKept,
      droppedSignalLines: auditDroppedSignal(raw, result.output),
    };
  });

  for (const row of rows) {
    const recall = row.mustKeepTotal === 0 ? 100 : Math.round((row.mustKeepKept / row.mustKeepTotal) * 100);
    console.log(
      `${row.fixture.padEnd(34)} ${row.reducer.padEnd(18)} tokens ${String(row.beforeTokens).padStart(5)} -> ${String(row.afterTokens).padStart(5)}  (-${row.tokenReductionPct}%)  signal ${row.mustKeepKept}/${row.mustKeepTotal} (${recall}%)`
    );
    for (const dropped of row.droppedSignalLines) {
      console.log(`    ! dropped signal-looking line: ${dropped}`);
    }
  }

  const totalBefore = rows.reduce((s, r) => s + r.beforeTokens, 0);
  const totalAfter = rows.reduce((s, r) => s + r.afterTokens, 0);
  const overallPct = pct(totalBefore, totalAfter);
  const signalTotal = rows.reduce((s, r) => s + r.mustKeepTotal, 0);
  const signalKept = rows.reduce((s, r) => s + r.mustKeepKept, 0);
  const droppedSignalLines = rows.reduce((s, r) => s + r.droppedSignalLines.length, 0);
  const signalRecallPct = signalTotal === 0 ? 100 : Math.round((signalKept / signalTotal) * 1000) / 10;
  const fidelityOk = signalKept === signalTotal && droppedSignalLines === 0;

  console.log(`\nTokens:  ${totalBefore} -> ${totalAfter} (-${overallPct}%)`);
  console.log(`Signal:  ${signalKept}/${signalTotal} must-keep lines preserved (${signalRecallPct}% recall)`);
  console.log(`Audit:   ${droppedSignalLines} dropped line(s) that look like signal`);
  console.log(`Verdict: ${fidelityOk ? "fidelity OK — token savings preserve the signal" : "FIDELITY FAILURE — signal lost, see above"}`);

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const report: BenchReport = {
    rows,
    totalBefore,
    totalAfter,
    overallPct,
    signalTotal,
    signalKept,
    signalRecallPct,
    droppedSignalLines,
    fidelityOk,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  console.log(`\nReport written to ${path.relative(process.cwd(), reportPath)}`);
  return report;
}

// Auto-run when executed directly (node src/run.ts), but not when imported.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = runBench();
  // A benchmark that silently loses signal is worse than useless — fail loudly.
  if (!report.fidelityOk) process.exitCode = 1;
}
