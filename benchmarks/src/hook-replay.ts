import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { reduceClaudePayload } from "../../packages/adapter-claude/src/hook.ts";
import { reduceCodexPayload } from "../../packages/adapter-codex/src/hook.ts";
import { countTokens } from "./tokenizer.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rows = [];
for (const fixture of ["test-output/node-tap.txt", "test-output/jest-mostly-pass.txt",
  "test-output/pytest-mostly-pass.txt", "ci/github-actions-log.txt"]) {
  const stdout = fs.readFileSync(path.join(root, "fixtures", fixture), "utf8");
  const original = { stdout, stderr: "fatal: validation failed\n", exit_code: 17,
    interrupted: false, isImage: false, truncated: false, future: { trace: "opaque" } };
  for (const harness of ["claude", "codex"] as const) {
    const reduce = harness === "claude" ? reduceClaudePayload : reduceCodexPayload;
    const payload = (tool_response: unknown) => JSON.stringify({
      hook_event_name: "PostToolUse", tool_name: "Bash", tool_response,
    });
    const result = reduce(payload(original));
    const response = JSON.parse(result.response);
    const updated = harness === "claude"
      ? response.hookSpecificOutput.updatedToolOutput : JSON.parse(response.stopReason);
    assert.deepEqual({ ...updated, stdout }, original, "all non-stdout fields must survive");
    if (harness === "codex") {
      assert.equal(response.continue, false);
      assert.equal(response.decision, undefined, "must not reject code-mode promises");
    }
    assert.ok(result.event);
    assert.equal(result.event.beforeChars, JSON.stringify(original).length);
    assert.equal(result.event.afterChars, JSON.stringify(updated).length);
    assert.equal(reduce(payload(updated)).response, "{}", "second hook pass is a no-op");
    assert.equal(reduce(payload(original)).response, result.response, "deterministic response");
    const beforeTokens = countTokens(JSON.stringify(original));
    const afterTokens = countTokens(JSON.stringify(updated));
    assert.ok(afterTokens < beforeTokens, "the complete result must actually shrink");
    rows.push({ harness, fixture, beforeTokens, afterTokens,
      reductionPct: Math.round((1 - afterTokens / beforeTokens) * 1000) / 10,
      metadataPreserved: true, deterministic: true, idempotent: true });
  }
}
const report = { kind: "offline-hook-protocol-replay", tokenizer: "cl100k_base",
  liveHarness: false, llmTaskQualityMeasured: false, rows, integrityOk: true };
fs.mkdirSync(path.join(root, "reports"), { recursive: true });
fs.writeFileSync(path.join(root, "reports", "hook-replay.json"), JSON.stringify(report, null, 2) + "\n");
console.log("\nClaude/Codex protocol replay (NOT live harness or LLM quality evidence):");
for (const row of rows) console.log(`${row.harness}: ${row.fixture}: ${row.beforeTokens} -> ${row.afterTokens} tokens (-${row.reductionPct}%), metadata/stability OK`);
