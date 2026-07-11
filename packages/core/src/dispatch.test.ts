import { test } from "node:test";
import assert from "node:assert/strict";
import { pickReducer, reduceAuto, DEFAULT_MIN_LENGTH } from "./dispatch.ts";

const bigGitDiff =
  "diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml\n--- a/pnpm-lock.yaml\n+++ b/pnpm-lock.yaml\n@@ -1,2 +1,3 @@\n foo\n+bar\n" +
  "x".repeat(DEFAULT_MIN_LENGTH);

const bigTestOutput =
  "PASS a\n".repeat(20) + "Tests:       1 failed, 19 passed, 20 total\n" + "y".repeat(DEFAULT_MIN_LENGTH);

test("pickReducer: detects git diff", () => {
  assert.equal(pickReducer(bigGitDiff)?.name, "git-diff-slim");
});

test("pickReducer: detects test output", () => {
  assert.equal(pickReducer(bigTestOutput)?.name, "test-output-slim");
});

test("pickReducer: returns null for unrelated prose", () => {
  assert.equal(pickReducer("just some regular explanatory text with no markers"), null);
});

test("reduceAuto: passes through content below min length", () => {
  const short = "diff --git a/x b/x\n+a";
  const res = reduceAuto(short);
  assert.equal(res.changed, false);
  assert.equal(res.reducer, null);
  assert.equal(res.output, short);
});

test("reduceAuto: reduces and reports the reducer name", () => {
  const res = reduceAuto(bigTestOutput);
  assert.equal(res.reducer, "test-output-slim");
  assert.equal(res.changed, true);
  assert.ok(res.output.length < bigTestOutput.length);
});

test("reduceAuto: idempotent", () => {
  const once = reduceAuto(bigGitDiff).output;
  const twice = reduceAuto(once).output;
  assert.equal(once, twice);
});
