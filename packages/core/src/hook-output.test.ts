import { test } from "node:test";
import assert from "node:assert/strict";
import { extractBashOutput } from "./hook-output.ts";

test("hook extraction: documented response wins over legacy alias", () => {
  const raw = JSON.stringify({ tool_name: "Bash", tool_response: { stdout: "official" }, tool_output: "stale" });
  assert.equal(extractBashOutput(raw, true)?.text, "official");
  assert.equal(extractBashOutput(JSON.stringify({ tool_name: "Bash", tool_response: null, tool_output: "stale" }), true), null);
});
test("hook extraction: legacy Claude payload is supported without inventing fields", () => {
  const raw = JSON.stringify({ tool_name: "Bash", tool_output: "legacy" });
  assert.equal(extractBashOutput(raw, true)?.replace("reduced"), "reduced");
  assert.equal(extractBashOutput(raw), null);
});
test("hook extraction: preserves empty stderr and response objects without mutation", () => {
  const result = extractBashOutput(JSON.stringify({ tool_name: "Bash", tool_response: { stdout: "abc", stderr: "", exitCode: 0 } }));
  assert.deepEqual(result?.replace("x"), { stdout: "x", stderr: "", exitCode: 0 });
  assert.equal(result?.text, "abc");
});
