import { test } from "node:test";
import assert from "node:assert/strict";
import { tapOutputSlim } from "./tap-output-slim.ts";
import { reduceAuto } from "../dispatch.ts";
const pass = (n: number) => `# Subtest: case ${n}\nok ${n} - case ${n}\n  ---\n  duration_ms: 0.123\n  type: 'test'\n  ...\n`;
const prefix = "TAP version 13\n" + Array.from({ length: 30 }, (_, i) => pass(i + 1)).join("");
const tail = "# Subtest: broken\nnot ok 31 - broken\n  ---\n  error: 'mismatch'\n  expected: 1\n  actual: 2\n  ...\n1..31\n# tests 31\n# pass 30\n# fail 1\n";

test("TAP: compresses successes while preserving complete failure and totals", () => {
  const result = reduceAuto(prefix + tail);
  assert.equal(result.reducer, "tap-output-slim");
  assert.ok(result.output.endsWith(tail));
  assert.ok(result.output.length < (prefix + tail).length / 3);
  assert.equal(tapOutputSlim.reduce(result.output).changed, false);
});
test("TAP: all-pass counts and exact CRLF survive", () => {
  const input = (prefix + "1..30\n# tests 30\n# fail 0\n").replaceAll("\n", "\r\n");
  const result = tapOutputSlim.reduce(input);
  assert.equal(result.changed, true);
  assert.ok(result.output.endsWith("1..30\r\n# tests 30\r\n# fail 0\r\n"));
  assert.equal(result.output.replaceAll("\r\n", "").includes("\n"), false);
});
for (const extra of ["  custom_metadata: retain me", "# warning: do not hide", "Bail out! stopped", "# application diagnostic"]) {
  test(`TAP: never discards unfamiliar diagnostic: ${extra}`, () => {
    const input = "TAP version 13\n" + pass(1).replace("  ...", extra + "\n  ...") + pass(2) + "1..2\n";
    assert.ok(tapOutputSlim.reduce(input).output.includes(extra));
  });
}
test("TAP: preserves nested suites and skip/todo directives", () => {
  const nested = "# Subtest: suite\n    # Subtest: nested\n    not ok 1 - nested\nnot ok 1 - suite\n";
  const skip = "# Subtest: skipped\nok 32 - skipped # SKIP missing platform\n";
  const todo = "# Subtest: planned\nok 33 - planned # TODO later\n";
  const input = prefix + nested + skip + todo + "1..33\n";
  const result = tapOutputSlim.reduce(input);
  for (const kept of [nested, skip, todo]) assert.ok(result.output.includes(kept));
});
test("TAP: retains success-looking text inside failure diagnostics", () => {
  const input = "TAP version 13\nnot ok 1 - broken\n" + pass(2) + pass(3) + "1..3\n";
  assert.equal(tapOutputSlim.reduce(input).output, input);
});
test("TAP: truncated/unversioned streams fail open", () => {
  for (const input of [prefix.slice(0, -10), pass(1) + pass(2), "TAP version 14\n" + pass(1)]) {
    const result = tapOutputSlim.reduce(input);
    assert.ok(result.output.includes(input.slice(-20)));
  }
});
