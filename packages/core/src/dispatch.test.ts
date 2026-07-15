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

test("pickReducer: detects long-form text", () => {
  const longProse =
    "# Big Report\n\nThis has very long prose that goes on for many lines\n".repeat(15) +
    "With some more content\n".repeat(10);
  assert.equal(pickReducer(longProse)?.name, "generic-text-slim");
});

test("pickReducer: detects JSON arrays", () => {
  const items = Array.from({ length: 50 }, (_, i) => `    { "id": ${i}, "name": "item-${i}" }`);
  const jsonArr = "[\n" + items.join(",\n") + "\n]";
  assert.ok(jsonArr.length >= 400, `expected length >= 400, got ${jsonArr.length}`);
  assert.equal(pickReducer(jsonArr)?.name, "json-output-slim");
});

test("pickReducer: detects JSON objects", () => {
  const items = Array.from({ length: 40 }, (_, i) => `    "key${i}": { "value": ${i}, "label": "entry-${i}" }`);
  const jsonObj = "{\n" + items.join(",\n") + "\n}";
  assert.ok(jsonObj.length >= 400, `expected length >= 400, got ${jsonObj.length}`);
  assert.equal(pickReducer(jsonObj)?.name, "json-output-slim");
});

test("pickReducer: detects file listings", () => {
  const listing =
    "total 128\n" +
    Array.from({ length: 20 }, (_, i) => `-rw-r--r--  1 user group  123 Jul 15 10:00 file-${i}.ts`).join("\n");
  assert.equal(pickReducer(listing)?.name, "file-listing-slim");
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

test("reduceAuto: never returns output larger than input (safety net)", () => {
  // A short run of tiny pass lines: collapsing to a marker would grow the text.
  const tiny = "PASS a\nPASS b\n" + "y".repeat(DEFAULT_MIN_LENGTH);
  const res = reduceAuto(tiny);
  assert.ok(res.output.length <= tiny.length);
  if (res.output.length === tiny.length) {
    assert.equal(res.changed, false);
    assert.equal(res.reducer, null);
  }
});

test("reduceAuto: idempotent", () => {
  const once = reduceAuto(bigGitDiff).output;
  const twice = reduceAuto(once).output;
  assert.equal(once, twice);
});
