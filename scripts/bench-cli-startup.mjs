import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";

const [baselineArg, candidateArg, reportArg] = process.argv.slice(2);
if (!baselineArg || !candidateArg) {
  console.error("Usage: node scripts/bench-cli-startup.mjs <baseline-cli.mjs> <candidate-cli.mjs> [report.json]");
  process.exit(1);
}
const builds = { baseline: path.resolve(baselineArg), candidate: path.resolve(candidateArg) };
const runs = { baseline: [], candidate: [] };
const input = JSON.stringify({ hook_event_name: "PostToolUse", tool_name: "Bash", tool_response: {
  stdout: "PASS successful test case number NN\n".repeat(40) + "Tests: 40 passed\n",
  stderr: "", interrupted: false, isImage: false,
} });
function sample(label) {
  const start = performance.now();
  const result = spawnSync(process.execPath, [builds[label], "hook", "claude"], {
    input, encoding: "utf8", timeout: 10000, env: { ...process.env, NODE_OPTIONS: "" },
  });
  if (result.error || result.status !== 0) throw result.error ?? new Error(result.stderr);
  JSON.parse(result.stdout);
  return performance.now() - start;
}
for (let i = 0; i < 3; i++) { sample("baseline"); sample("candidate"); }
for (let i = 0; i < 30; i++) {
  for (const label of i % 2 ? ["candidate", "baseline"] : ["baseline", "candidate"]) {
    runs[label].push(sample(label));
  }
}
const summarize = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  return { medianMs: +sorted[Math.floor(sorted.length / 2)].toFixed(3),
    p95Ms: +sorted[Math.ceil(sorted.length * .95) - 1].toFixed(3), samplesMs: values.map(v => +v.toFixed(3)) };
};
const baseline = summarize(runs.baseline), candidate = summarize(runs.candidate);
const report = { kind: "cold-cli-hook-process", node: process.version, platform: process.platform,
  samplesPerBuild: 30, warmupPerBuild: 3, alternating: true, telemetry: false,
  baseline, candidate, medianReductionPct: +((1 - candidate.medianMs / baseline.medianMs) * 100).toFixed(1),
  note: "Local process startup measurement, not LLM latency, session cost or task quality." };
if (reportArg) fs.writeFileSync(reportArg, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
