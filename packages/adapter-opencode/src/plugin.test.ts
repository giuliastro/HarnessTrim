import { test } from "node:test";
import assert from "node:assert/strict";
import { HarnessTrim } from "./plugin.ts";

// Minimal stand-ins for the OpenCode hook argument shapes (see @opencode-ai/plugin Hooks).
const noopInput = {} as never;

function afterArgs(output: string) {
  return {
    input: { tool: "bash", sessionID: "s", callID: "c", args: {} },
    output: { title: "t", output, metadata: {} as unknown },
  };
}

const noisyTestOutput =
  "PASS src/a.test.ts\n".repeat(30) +
  "FAIL src/b.test.ts\n  Expected: 1\n  Received: 2\n" +
  "Tests:       1 failed, 30 passed, 31 total\n";

test("active mode: mutates tool output in place", async () => {
  const hooks = await HarnessTrim(noopInput, { mode: "active" });
  const { input, output } = afterArgs(noisyTestOutput);
  await hooks["tool.execute.after"]!(input, output);
  assert.ok(output.output.length < noisyTestOutput.length);
  assert.match(output.output, /omitted \d+ passing\/noise line\(s\)/);
  assert.match(output.output, /1 failed, 30 passed/); // signal preserved
});

test("dryrun mode: leaves output unchanged", async () => {
  const hooks = await HarnessTrim(noopInput, { mode: "dryrun" });
  const { input, output } = afterArgs(noisyTestOutput);
  await hooks["tool.execute.after"]!(input, output);
  assert.equal(output.output, noisyTestOutput);
});

test("off mode: registers no hooks", async () => {
  const hooks = await HarnessTrim(noopInput, { mode: "off" });
  assert.equal(hooks["tool.execute.after"], undefined);
  assert.equal(hooks["experimental.session.compacting"], undefined);
});

test("short output is passed through untouched", async () => {
  const hooks = await HarnessTrim(noopInput, { mode: "active" });
  const short = "FAIL one thing\nExpected: 1\nReceived: 2";
  const { input, output } = afterArgs(short);
  await hooks["tool.execute.after"]!(input, output);
  assert.equal(output.output, short);
});

test("compaction hook injects handoff context", async () => {
  const hooks = await HarnessTrim(noopInput, { mode: "active" });
  const out = { context: [] as string[], prompt: undefined as string | undefined };
  await hooks["experimental.session.compacting"]!({ sessionID: "s" }, out);
  assert.equal(out.context.length, 1);
  assert.match(out.context[0], /Preserve in the summary/);
});

test("compactionHandoff:false disables the compaction injection", async () => {
  const hooks = await HarnessTrim(noopInput, { mode: "active", compactionHandoff: false });
  const out = { context: [] as string[], prompt: undefined as string | undefined };
  await hooks["experimental.session.compacting"]!({ sessionID: "s" }, out);
  assert.equal(out.context.length, 0);
});
