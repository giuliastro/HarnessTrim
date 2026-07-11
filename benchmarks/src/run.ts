import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { testOutputSlim, gitDiffSlim, type Reducer } from "@harnesstrim/core";
import { countTokens } from "./tokenizer.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, "../fixtures");
const reportPath = path.resolve(__dirname, "../reports/latest.json");

interface Fixture {
  file: string;
  reducer: Reducer;
}

const FIXTURES: Fixture[] = [
  { file: "test-output/jest-mostly-pass.txt", reducer: testOutputSlim },
  { file: "test-output/pytest-mostly-pass.txt", reducer: testOutputSlim },
  { file: "git-diff/lockfile-heavy.diff", reducer: gitDiffSlim },
];

export interface BenchRow {
  fixture: string;
  reducer: string;
  beforeChars: number;
  afterChars: number;
  beforeTokens: number;
  afterTokens: number;
  tokenReductionPct: number;
}

export interface BenchReport {
  rows: BenchRow[];
  totalBefore: number;
  totalAfter: number;
  overallPct: number;
}

function pct(before: number, after: number): number {
  if (before === 0) return 0;
  return Math.round((1 - after / before) * 1000) / 10;
}

/**
 * Run the Tier A micro-benchmark: apply each reducer to its fixtures, measure
 * before/after tokens with a real tokenizer, print a table, and write a JSON
 * report. Returns the structured report so callers (e.g. the CLI) can reuse it.
 */
export function runBench(): BenchReport {
  const rows: BenchRow[] = FIXTURES.map(({ file, reducer }) => {
    const raw = fs.readFileSync(path.join(fixturesDir, file), "utf8");
    const result = reducer.reduce(raw);
    const beforeTokens = countTokens(raw);
    const afterTokens = countTokens(result.output);
    return {
      fixture: file,
      reducer: reducer.name,
      beforeChars: raw.length,
      afterChars: result.output.length,
      beforeTokens,
      afterTokens,
      tokenReductionPct: pct(beforeTokens, afterTokens),
    };
  });

  for (const row of rows) {
    console.log(
      `${row.fixture.padEnd(34)} ${row.reducer.padEnd(18)} tokens ${String(row.beforeTokens).padStart(5)} -> ${String(row.afterTokens).padStart(5)}  (-${row.tokenReductionPct}%)`
    );
  }

  const totalBefore = rows.reduce((s, r) => s + r.beforeTokens, 0);
  const totalAfter = rows.reduce((s, r) => s + r.afterTokens, 0);
  const overallPct = pct(totalBefore, totalAfter);
  console.log(`\nOverall: ${totalBefore} -> ${totalAfter} tokens (-${overallPct}%)`);

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const report: BenchReport = { rows, totalBefore, totalAfter, overallPct };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n");
  console.log(`\nReport written to ${path.relative(process.cwd(), reportPath)}`);
  return report;
}

// Auto-run when executed directly (node src/run.ts), but not when imported.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runBench();
}
