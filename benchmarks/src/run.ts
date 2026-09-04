import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { performance } from "node:perf_hooks";
import {
  ciLogSlim,
  fileListingSlim,
  genericTextSlim,
  gitDiffSlim,
  jsonOutputSlim,
  lintOutputSlim,
  testOutputSlim,
  type Reducer,
} from "@harnesstrim/core";
import { countTokens } from "./tokenizer.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, "../fixtures");
const reportPath = path.resolve(__dirname, "../reports/latest.json");

const BENCH_WARMUP_ITERATIONS = 10;
const BENCH_MEASURED_ITERATIONS = 100;
/**
 * Local reducers should be effectively invisible beside a harness/model round trip. p95 rather
 * than max avoids making CI scheduling jitter a product regression while still catching runaway
 * regex/algorithm changes.
 */
const LATENCY_P95_BUDGET_MS = 25;

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
  {
    file: "lint/eslint-wall.txt",
    reducer: lintOutputSlim,
    mustKeep: [
      "✖ 90 warnings", // the totals
      "0 errors",
      "20 files checked, 10 had style suggestions",
      "no-console ×10", // which rules fired, aggregated
      "Run eslint --fix to apply automatic fixes.", // the actionable next step
    ],
  },
  {
    file: "ci/github-actions-log.txt",
    reducer: ciLogSlim,
    mustKeep: [
      "##[group]Run pnpm test", // step identity
      "FAIL packages/core/src/example.test.ts", // failing suite
      "AssertionError: expected signal to survive", // failure reason
      "Tests:       1 failed, 47 passed, 48 total", // test summary
      "Error: Process completed with exit code 1.", // runner-level failure
      "warning: cache restore was skipped because the test step failed", // warning signal
    ],
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
  deterministic: boolean;
  idempotent: boolean;
  latencyMedianMs: number;
  latencyP95Ms: number;
  latencyBudgetMs: number;
  latencyOk: boolean;
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
  determinismOk: boolean;
  idempotencyOk: boolean;
  latencyOk: boolean;
  maxLatencyP95Ms: number;
  /** Release gate: savings count only when fidelity, stability and local overhead all hold. */
  integrityOk: boolean;
}

function pct(before: number, after: number): number {
  if (before === 0) return 0;
  return Math.round((1 - after / before) * 1000) / 10;
}

function roundMs(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index] ?? 0;
}

function measureReducer(reducer: Reducer, raw: string): {
  deterministic: boolean;
  idempotent: boolean;
  latencyMedianMs: number;
  latencyP95Ms: number;
  latencyOk: boolean;
} {
  for (let iteration = 0; iteration < BENCH_WARMUP_ITERATIONS; iteration += 1) {
    reducer.reduce(raw);
  }

  const baseline = reducer.reduce(raw);
  const signature = JSON.stringify(baseline);
  let deterministic = true;
  const durations: number[] = [];

  for (let iteration = 0; iteration < BENCH_MEASURED_ITERATIONS; iteration += 1) {
    const started = performance.now();
    const result = reducer.reduce(raw);
    durations.push(performance.now() - started);
    if (JSON.stringify(result) !== signature) deterministic = false;
  }

  const secondPass = reducer.reduce(baseline.output);
  const idempotent = secondPass.output === baseline.output && secondPass.changed === false;
  durations.sort((left, right) => left - right);
  const latencyMedianMs = roundMs(percentile(durations, 0.5));
  const latencyP95Ms = roundMs(percentile(durations, 0.95));

  return {
    deterministic,
    idempotent,
    latencyMedianMs,
    latencyP95Ms,
    latencyOk: latencyP95Ms <= LATENCY_P95_BUDGET_MS,
  };
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
    const stability = measureReducer(reducer, raw);
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
      ...stability,
      latencyBudgetMs: LATENCY_P95_BUDGET_MS,
    };
  });

  for (const row of rows) {
    const recall = row.mustKeepTotal === 0 ? 100 : Math.round((row.mustKeepKept / row.mustKeepTotal) * 100);
    console.log(
      `${row.fixture.padEnd(34)} ${row.reducer.padEnd(18)} tokens ${String(row.beforeTokens).padStart(5)} -> ${String(row.afterTokens).padStart(5)}  (-${row.tokenReductionPct}%)  signal ${row.mustKeepKept}/${row.mustKeepTotal} (${recall}%)  stable ${row.deterministic ? "yes" : "NO"}  idem ${row.idempotent ? "yes" : "NO"}  p95 ${row.latencyP95Ms.toFixed(3)}ms`
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
  const determinismOk = rows.every((row) => row.deterministic);
  const idempotencyOk = rows.every((row) => row.idempotent);
  const latencyOk = rows.every((row) => row.latencyOk);
  const maxLatencyP95Ms = roundMs(Math.max(0, ...rows.map((row) => row.latencyP95Ms)));
  const integrityOk = fidelityOk && determinismOk && idempotencyOk && latencyOk;

  console.log(`\nTokens:       ${totalBefore} -> ${totalAfter} (-${overallPct}%)`);
  console.log(`Signal:       ${signalKept}/${signalTotal} must-keep lines preserved (${signalRecallPct}% recall)`);
  console.log(`Audit:        ${droppedSignalLines} dropped line(s) that look like signal`);
  console.log(`Determinism:  ${determinismOk ? "OK" : "FAILURE"}`);
  console.log(`Idempotency:  ${idempotencyOk ? "OK" : "FAILURE"}`);
  console.log(
    `Latency:      ${latencyOk ? "OK" : "FAILURE"} — max fixture p95 ${maxLatencyP95Ms.toFixed(3)}ms (budget ${LATENCY_P95_BUDGET_MS}ms)`
  );
  console.log(
    `Verdict:      ${integrityOk ? "integrity OK — savings preserve signal, stability and latency budget" : "INTEGRITY FAILURE — see failed gate above"}`
  );

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
    determinismOk,
    idempotencyOk,
    latencyOk,
    maxLatencyP95Ms,
    integrityOk,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  console.log(`\nReport written to ${path.relative(process.cwd(), reportPath)}`);
  return report;
}

// Auto-run when executed directly (node src/run.ts), but not when imported.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const report = runBench();
  // A saving that loses signal, changes unpredictably, fails idempotency or consumes excessive
  // local latency is not an optimization. Release CI uses this as a product-integrity gate.
  if (!report.integrityOk) process.exitCode = 1;
}
