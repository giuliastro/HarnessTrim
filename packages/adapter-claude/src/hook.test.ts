import { test } from "node:test";
import assert from "node:assert/strict";
import { buildClaudeHookResponse } from "./hook.ts";

// Kept comfortably above the reducer's default min-length (400 chars).
const noisy =
  "PASS suite test case number NN ok\n".repeat(40) +
  "FAIL suite broken case\nExpected: 1\nReceived: 2\nTests: 1 failed, 40 passed, 41 total\n";

test("reduces tool_output and returns updatedToolOutput", () => {
  const res = JSON.parse(buildClaudeHookResponse(JSON.stringify({ tool_name: "Bash", tool_output: noisy })));
  assert.equal(res.hookSpecificOutput.hookEventName, "PostToolUse");
  assert.ok(res.hookSpecificOutput.updatedToolOutput.length < noisy.length);
  assert.match(res.hookSpecificOutput.updatedToolOutput, /1 failed, 40 passed/);
});

test("reads output from tool_response.stdout when tool_output is absent", () => {
  const res = JSON.parse(
    buildClaudeHookResponse(JSON.stringify({ tool_name: "Bash", tool_response: { stdout: noisy } }))
  );
  assert.ok(res.hookSpecificOutput?.updatedToolOutput.length < noisy.length);
});

test("returns {} when nothing is reducible", () => {
  const res = buildClaudeHookResponse(JSON.stringify({ tool_name: "Bash", tool_output: "all good, nothing noisy" }));
  assert.equal(res, "{}");
});

test("returns {} on malformed JSON (never corrupts a result)", () => {
  assert.equal(buildClaudeHookResponse("{ not json"), "{}");
});

test("returns {} when there is no extractable output", () => {
  assert.equal(buildClaudeHookResponse(JSON.stringify({ tool_name: "Bash" })), "{}");
});
