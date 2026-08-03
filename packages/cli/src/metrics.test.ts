import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadMetrics } from "./metrics.ts";

function tmpFile(contents: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "htrim-metrics-"));
  const p = path.join(dir, "metrics.jsonl");
  fs.writeFileSync(p, contents);
  return p;
}

const line = (o: object) => JSON.stringify(o);

test("loadMetrics reports not-found for a missing file", () => {
  const result = loadMetrics(path.join(os.tmpdir(), "does-not-exist-htrim", "metrics.jsonl"));
  assert.equal(result.found, false);
  assert.equal(result.summary.events, 0);
});

test("loadMetrics aggregates a JSONL file", () => {
  const p = tmpFile(
    line({ ts: "t1", harness: "opencode", tool: "bash", reducer: "git-diff-slim", beforeChars: 900, afterChars: 200 }) +
      "\n" +
      line({ ts: "t2", harness: "opencode", tool: "bash", reducer: "test-output-slim", beforeChars: 1000, afterChars: 400 }) +
      "\n"
  );
  const result = loadMetrics(p);
  assert.equal(result.found, true);
  assert.equal(result.summary.events, 2);
  assert.equal(result.summary.savedChars, 1300);
  assert.equal(result.summary.byReducer.length, 2);
  assert.equal(result.summary.byHarness.length, 1);
  assert.equal(result.summary.byHarness[0].savedChars, 1300);
});

test("loadMetrics reports pass-through and per-harness splits", () => {
  const p = tmpFile(
    line({ ts: "t1", harness: "opencode", tool: "bash", reducer: "git-diff-slim", beforeChars: 900, afterChars: 200, changed: true }) +
      "\n" +
      line({ ts: "t2", harness: "claude", tool: "Bash", reducer: null, beforeChars: 800, afterChars: 800, changed: false }) +
      "\n" +
      line({ ts: "t3", harness: "claude", tool: "Bash", reducer: "test-output-slim", beforeChars: 600, afterChars: 300, changed: true }) +
      "\n"
  );
  const result = loadMetrics(p);
  assert.equal(result.summary.reduced, 2);
  assert.equal(result.summary.passThrough, 1);
  assert.equal(result.summary.passThroughRate, 33.3);
  assert.equal(result.summary.reductionErrors, 0);
assert.deepEqual(
    result.summary.byHarness.map((h) => h.harness),
    ["opencode", "claude"] // sorted by saved chars desc (opencode saved 700, claude 300)
  );
  assert.equal(result.summary.byHarness[0].savedChars, 700);
});

test("loadMetrics reports reduction errors when output grew", () => {
  const p = tmpFile(
    line({ harness: "pipe", tool: "reduce", reducer: "test-output-slim", beforeChars: 600, afterChars: 900, changed: true }) + "\n"
  );
  const result = loadMetrics(p);
  assert.equal(result.summary.reductionErrors, 1);
  assert.equal(result.summary.grewChars, 300);
  assert.equal(result.summary.reduced, 0);
});

test("loadMetrics tolerates an empty file", () => {
  const p = tmpFile("");
  const result = loadMetrics(p);
  assert.equal(result.found, true);
  assert.equal(result.summary.events, 0);
});
