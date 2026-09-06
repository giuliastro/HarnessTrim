import { test } from "node:test";
import assert from "node:assert/strict";
import { reduceCodexPayload } from "./hook.ts";

const noisy = "PASS suite test case number NN ok\n".repeat(40) +
  "FAIL suite broken case\nExpected: 1\nReceived: 2\nTests: 1 failed, 40 passed, 41 total\n";
const payload = (tool_response: unknown, extra = {}) => JSON.stringify({
  hook_event_name: "PostToolUse", tool_name: "Bash", tool_response, ...extra,
});

for (const key of ["stdout", "output", "content"]) {
  test(`codex: preserves ${key} envelope, stderr, status and unknown metadata`, () => {
    const original = { [key]: noisy, stderr: "fatal: validation failed\n", exit_code: 17,
      interrupted: false, isImage: false, truncated: true, future: { pid: 42 } };
    const { response, event } = reduceCodexPayload(payload(original));
    const parsed = JSON.parse(response);
    const updated = JSON.parse(parsed.stopReason);
    assert.deepEqual({ ...updated, [key]: noisy }, original);
    assert.match(updated[key], /Received: 2/);
    assert.ok(updated[key].length < noisy.length);
    assert.ok(event);
    assert.equal(event.beforeChars, JSON.stringify(original).length);
    assert.equal(event.afterChars, JSON.stringify(updated).length);
    assert.equal(event.reducer, "test-output-slim");
    assert.equal(reduceCodexPayload(payload(updated)).response, "{}");
  });
}

test("codex: plain text response remains text and its complete diagnostics survive", () => {
  const raw = noisy + "unexpected diagnostic\n".repeat(30) + "Process exited with code 17\n";
  const result = reduceCodexPayload(payload(raw));
  const parsed = JSON.parse(result.response);
  const text = parsed.stopReason;
  assert.equal(typeof text, "string");
  assert.ok(text.endsWith("unexpected diagnostic\n".repeat(30) + "Process exited with code 17\n"));
  assert.ok(result.event && result.event.afterChars === text.length);
  assert.equal(parsed.continue, false); assert.equal(parsed.decision, undefined);
});

for (const response of [null, 1, [], { lines: [] }, { stdout: noisy, isImage: true },
  { stdout: noisy, content: [{ type: "image", data: "opaque" }] }]) {
  test(`codex: unknown or rich response fails open: ${JSON.stringify(response).slice(0, 50)}`, () => {
    assert.deepEqual(reduceCodexPayload(payload(response)), { response: "{}", event: null, attempt: null });
  });
}
for (const event of ["PreToolUse", "PostToolUseFailure"]) {
  test(`codex: never rewrites ${event}`, () => {
    assert.equal(reduceCodexPayload(payload(noisy, { hook_event_name: event })).response, "{}");
  });
}
for (const tool of ["Read", "mcp__fs__read", "apply_patch", "exec_command"]) {
  test(`codex: does not transform unsupported ${tool} channels`, () => {
    assert.equal(reduceCodexPayload(payload(noisy, { tool_name: tool })).response, "{}");
  });
}

test("codex: malformed, short and pass-through responses do not create false savings", () => {
  for (const raw of ["not json", "[]", "null", payload("all good")]) {
    assert.equal(reduceCodexPayload(raw).response, "{}");
  }
  const pass = reduceCodexPayload(payload({ stdout: "untouched\n".repeat(100), stderr: "important" }));
  assert.equal(pass.event, null);
  assert.ok(pass.attempt && !pass.attempt.reductionFailed);
});
