import { test } from "node:test";
import assert from "node:assert/strict";
import { jsonOutputSlim } from "./json-output-slim.ts";

// Short array — unchanged
const shortArray = JSON.stringify([1, 2, 3, 4, 5]);

// Long array — should be collapsed
const longArray = JSON.stringify(
  Array.from({ length: 50 }, (_, i) => ({ id: i, name: `item-${i}`, value: Math.random() })),
  null,
  2,
);

// Long object — should be collapsed
const largeObject = JSON.stringify(
  Object.fromEntries(
    Array.from({ length: 30 }, (_, i) => [`key_${i}`, `value_${i}`]),
  ),
  null,
  2,
);

// JSON embedded in text
const embeddedJson = `Some output before
${JSON.stringify(Array.from({ length: 25 }, (_, i) => i))}
Some output after`;

// Nested JSON
const nestedJson = JSON.stringify({
  status: "ok",
  items: Array.from({ length: 30 }, (_, i) => ({ id: i, data: `item-${i}` })),
  metadata: {
    count: 30,
    page: 1,
    tags: ["a", "b", "c"],
  },
});

test("json-output-slim: short array unchanged", () => {
  const result = jsonOutputSlim.reduce(shortArray);
  assert.equal(result.changed, false);
  assert.equal(result.output, shortArray);
});

test("json-output-slim: collapses long array", () => {
  const result = jsonOutputSlim.reduce(longArray);
  assert.equal(result.changed, true);
  assert.match(result.output, /\[harnesstrim:json-output-slim\] array with 50 total items/);
  assert.match(result.output, /"id": ?0/);
  assert.match(result.output, /"id": ?49/);
  assert.doesNotMatch(result.output, /"id": ?10/);
});

test("json-output-slim: collapses large object", () => {
  const result = jsonOutputSlim.reduce(largeObject);
  assert.equal(result.changed, true);
  assert.match(result.output, /object with 30 keys/);
  assert.match(result.output, /"key_0"/);
  assert.doesNotMatch(result.output, /"key_25"/);
});

test("json-output-slim: handles embedded JSON blocks", () => {
  const result = jsonOutputSlim.reduce(embeddedJson);
  assert.equal(result.changed, true);
  // Preamble preserved
  assert.match(result.output, /Some output before/);
  // JSON block reduced
  assert.match(result.output, /array with 25 total items/);
  // Postamble preserved
  assert.match(result.output, /Some output after/);
});

test("json-output-slim: reduces every embedded JSON block", () => {
  const array = JSON.stringify(Array.from({ length: 25 }, (_, i) => ({ id: i })));
  const input = `First block:\n${array}\nSecond block:\n${array}`;
  const result = jsonOutputSlim.reduce(input);
  assert.equal(result.changed, true);
  assert.equal((result.output.match(/array with 25 total items/g) ?? []).length, 2);
});

test("json-output-slim: nested JSON with payload array", () => {
  const result = jsonOutputSlim.reduce(nestedJson);
  assert.equal(result.changed, true);
  // Top-level status preserved
  assert.match(result.output, /"status"/);
  // Inner items array reduced (shown inline)
  assert.match(result.output, /\[reduced: 30 items\]/);
});

test("json-output-slim: is idempotent", () => {
  const once = jsonOutputSlim.reduce(longArray).output;
  const twice = jsonOutputSlim.reduce(once).output;
  assert.equal(once, twice);
});

test("json-output-slim: empty array unchanged", () => {
  const result = jsonOutputSlim.reduce("[]");
  assert.equal(result.changed, false);
});

test("json-output-slim: non-JSON text unchanged", () => {
  const result = jsonOutputSlim.reduce("just some random text without JSON");
  assert.equal(result.changed, false);
});
