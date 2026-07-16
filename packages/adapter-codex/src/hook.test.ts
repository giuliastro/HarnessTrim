import { test } from "node:test";
import assert from "node:assert/strict";
import { reduceCodexPayload } from "./hook.ts";

const noisy =
  "PASS suite test case number NN ok\n".repeat(40) +
  "FAIL suite broken case\nExpected: 1\nReceived: 2\nTests: 1 failed, 40 passed, 41 total\n";

test("reduces a Codex PostToolUse Bash response with the documented block-and-replace shape", () => {
  const { response, event } = reduceCodexPayload(JSON.stringify({ tool_name: "Bash", tool_response: noisy }));
  const parsed = JSON.parse(response);
  assert.equal(parsed.decision, "block");
  assert.match(parsed.reason, /HarnessTrim reduced Bash output \(test-output-slim\)/);
  assert.match(parsed.reason, /1 failed, 40 passed/);
  assert.ok(event);
  assert.equal(event.tool, "Bash");
  assert.equal(event.reducer, "test-output-slim");
  assert.ok(event.afterChars < event.beforeChars);
});

test("reads stdout from object-shaped tool responses", () => {
  const { response } = reduceCodexPayload(JSON.stringify({ tool_name: "Bash", tool_response: { stdout: noisy } }));
  assert.notEqual(response, "{}");
});

test("leaves short, malformed, and unfamiliar payloads untouched", () => {
  assert.equal(reduceCodexPayload(JSON.stringify({ tool_name: "Bash", tool_response: "all good" })).response, "{}");
  assert.equal(reduceCodexPayload("{ not json").response, "{}");
  assert.equal(reduceCodexPayload(JSON.stringify({ tool_name: "Bash", tool_response: { lines: [] } })).response, "{}");
});
