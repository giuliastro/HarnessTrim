import { test } from "node:test";
import assert from "node:assert/strict";
import { readStdin, reducePipe } from "./reduce.ts";

test("readStdin returns an empty string when stdin is a TTY (never EOFs)", async () => {
  const original = process.stdin.isTTY;
  (process.stdin as { isTTY?: boolean }).isTTY = true;
  try {
    const input = await readStdin();
    assert.equal(input, "");
  } finally {
    (process.stdin as { isTTY?: boolean }).isTTY = original;
  }
});

test("reducePipe reports before/after sizes", () => {
  const result = reducePipe("a.js:1:2  warning  no-console - msg\n");
  assert.ok(result.beforeChars > 0);
  assert.ok(result.afterChars > 0);
  assert.ok(result.beforeChars >= result.afterChars);
});
