import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldSkip } from "../extension/index.ts";

test("shouldSkip passes through text below the min length", () => {
  assert.equal(shouldSkip("short", 400), true);
});

test("shouldSkip never reduces already-reduced output (marker guard)", () => {
  const reduced = "[harnesstrim:json-output-slim] array with 80 items\n{\"id\":0}";
  assert.equal(shouldSkip(reduced, 0), true);
});

test("shouldSkip reduces long, marker-free text", () => {
  assert.equal(shouldSkip("x".repeat(5000), 400), false);
});

test("shouldSkip at the exact min length boundary", () => {
  assert.equal(shouldSkip("x".repeat(400), 400), false);
});
