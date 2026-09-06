import { test } from "node:test";
import assert from "node:assert/strict";
import { testOutputSlim } from "./test-output-slim.ts";

const jestStylePass = `PASS src/foo.test.ts
  ✓ does a thing (2 ms)
  ✓ does another thing (1 ms)
  ✓ does a third thing (1 ms)
  ✓ does a fourth thing (1 ms)

Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total
Snapshots:   0 total
Time:        0.512 s`;

const jestStyleFail = `PASS src/foo.test.ts
  ✓ does a thing (2 ms)
  ✓ does another thing (1 ms)
FAIL src/bar.test.ts
  ✕ breaks on edge case (3 ms)

  ● breaks on edge case

    expect(received).toBe(expected)

    Expected: 42
    Received: 41

      at Object.<anonymous> (src/bar.test.ts:10:20)

Test Suites: 1 failed, 1 passed, 2 total
Tests:       1 failed, 2 passed, 3 total`;

test("test-output-slim: collapses long pass-only runs", () => {
  const result = testOutputSlim.reduce(jestStylePass);
  assert.equal(result.changed, true);
  assert.match(result.output, /omitted \d+ passing\/noise line\(s\)/);
  assert.match(result.output, /4 passed, 4 total/);
});

test("test-output-slim: preserves failure signal and stack context", () => {
  const result = testOutputSlim.reduce(jestStyleFail);
  assert.match(result.output, /FAIL src\/bar\.test\.ts/);
  assert.match(result.output, /breaks on edge case/);
  assert.match(result.output, /Expected: 42/);
  assert.match(result.output, /1 failed, 2 passed, 3 total/);
});

test("test-output-slim: is idempotent", () => {
  const once = testOutputSlim.reduce(jestStyleFail).output;
  const twice = testOutputSlim.reduce(once).output;
  assert.equal(once, twice);
});

test("test-output-slim: leaves short output with no noise runs unchanged", () => {
  const short = "FAIL src/bar.test.ts\nExpected: 1\nReceived: 2";
  const result = testOutputSlim.reduce(short);
  assert.equal(result.changed, false);
  assert.equal(result.output, short);
});


test("test-output-slim: retains long assertion diffs, unknown text and exit status", () => {
  const prefix = "PASS harmless suite\n".repeat(30);
  const tail = "FAIL case\nExpected:\n" + "  arbitrary diff continuation\n".repeat(80) +
    "Process exited with code 23\n";
  const result = testOutputSlim.reduce(prefix + tail);
  assert.equal(result.changed, true);
  assert.ok(result.output.endsWith(tail));
});
test("test-output-slim: never assumes unknown lines are noise", () => {
  const input = "unrecognized diagnostic\n".repeat(30) + "Tests: 1 passed\n";
  assert.deepEqual(testOutputSlim.reduce(input), { output: input, changed: false });
});
test("test-output-slim: keeps warnings, and recognizes ANSI passes without changing retained bytes", () => {
  const warning = "\x1b[33mWarning: check credentials\x1b[0m\r\n";
  const input = "\x1b[32mPASS harmless suite\x1b[0m\r\n".repeat(30) + warning;
  const result = testOutputSlim.reduce(input);
  assert.equal(result.changed, true);
  assert.ok(result.output.endsWith(warning));
  assert.equal(testOutputSlim.reduce(result.output).output, result.output);
});

for (const header of ["AssertionError: mismatch", "TypeError: invalid value"]) {
  test(`test-output-slim: preserves diagnostic tail after ${header}`, () => {
    const tail = header + "\n" + "  \u2713 success-looking assertion data\n".repeat(20) + "Tests: 1 failed\n";
    const result = testOutputSlim.reduce("PASS normal suite\n".repeat(20) + tail);
    assert.ok(result.output.endsWith(tail));
  });
}
