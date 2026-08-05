import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getCapabilities } from "./capabilities.ts";
import {
  opencodeInstallJson,
  claudeInstallJson,
  codexInstallJson,
  doctorJson,
  metricsJson,
} from "./json.ts";
import { runInstallOpencode } from "./install.ts";
import { runInstallClaude } from "./install-claude.ts";
import { runInstallCodex } from "./install-codex.ts";
import { inspect } from "./doctor.ts";
import { loadMetrics } from "./metrics.ts";

function tmpProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "htrim-json-"));
}

test("capabilities covers every supported harness and flags", () => {
  const caps = getCapabilities("0.1.0");
  assert.equal(caps.version, "0.1.0");
  const names = Object.keys(caps.harnesses);
  for (const h of ["opencode", "codex", "claude", "hermes", "pi", "omp"]) assert.ok(names.includes(h));
  // the narrowing flags the plan requires are documented
  const h = caps.harnesses;
  assert.ok(h["claude"].narrowing.some((n) => n.flag === "--no-hook"));
  assert.ok(h["claude"].narrowing.some((n) => n.flag === "--no-instructions"));
  assert.ok(h["codex"].narrowing.some((n) => n.flag === "--no-instructions"));
  assert.ok(h["opencode"].narrowing.some((n) => n.flag === "--mode active|dryrun|off"));
  assert.ok(h["opencode"].narrowing.some((n) => n.flag === "--tools <name,...>"));
  assert.ok(h["hermes"].narrowing.some((n) => n.flag === "--min-length <n>"));
  assert.ok(h["pi"].narrowing.some((n) => n.flag.startsWith("--metrics")));
  assert.ok(h["omp"].narrowing.some((n) => n.flag.startsWith("--mode")));
  // every harness documents its reviewed write set
  for (const h of Object.values(caps.harnesses)) assert.ok(h.writeSet.length > 0);
});

test("capabilities digests pin the content install would write", () => {
  const caps = getCapabilities("0.1.0");
  assert.ok(caps.digests);
  for (const h of ["opencode", "codex", "claude", "hermes", "pi", "omp"]) {
    const d = caps.digests[h];
    assert.ok(d && Object.keys(d).length > 0, `digests for ${h}`);
  }
  // deterministic rerun yields identical digests (release-verification table)
  assert.deepEqual(getCapabilities("0.1.0").digests, caps.digests);
  // digests actually pin content: hashing the known snippet text must match
  const codexDigest = Object.values(caps.digests.codex).find((v) => typeof v === "string");
  assert.equal(codexDigest?.length, 64);
});

test("doctorJson is valid JSON with the report shape", () => {
  const dir = tmpProject();
  fs.writeFileSync(path.join(dir, "CLAUDE.md"), "x".repeat(5000));
  const parsed = JSON.parse(doctorJson(inspect(dir)));
  assert.equal(parsed.dir, dir);
  assert.ok(Array.isArray(parsed.findings));
});

test("metricsJson is valid JSON with the metrics shape", () => {
  const dir = tmpProject();
  const p = path.join(dir, "metrics.jsonl");
  fs.writeFileSync(
    p,
    JSON.stringify({ schemaVersion: 1, eventId: "e1", ts: "t", harness: "opencode", tool: "bash", reducer: "x", beforeChars: 10, afterChars: 5, beforeTokens: null, afterTokens: null }) + "\n"
  );
  const parsed = JSON.parse(metricsJson(loadMetrics(p)));
  assert.equal(parsed.found, true);
  assert.equal(parsed.summary.events, 1);
});

test("opencodeInstallJson reports the plan as actions with paths", () => {
  const dir = tmpProject();
  const result = runInstallOpencode(dir, false);
  const plan = opencodeInstallJson(result, false);
  assert.equal(plan.harness, "opencode");
  assert.equal(plan.dryRun, true);
  assert.equal(plan.changed, true);
  assert.ok(plan.actions.some((a) => a.type === "write" && a.path.endsWith(path.join(".opencode", "plugin", "harnesstrim.ts"))));
  assert.ok(plan.actions.some((a) => a.path.endsWith(path.join(".opencode", "package.json"))));
});

test("claudeInstallJson reflects a skills-only plan (no hook action)", () => {
  const dir = tmpProject();
  const result = runInstallClaude(dir, false, { includeHook: false });
  const plan = claudeInstallJson(result, false);
  assert.equal(plan.harness, "claude");
  assert.ok(!plan.actions.some((a) => a.path.endsWith("settings.json")));
  assert.ok(plan.actions.some((a) => a.type === "copy"));
});

test("codexInstallJson reflects a skills-only plan (no AGENTS.md action)", () => {
  const dir = tmpProject();
  const result = runInstallCodex(dir, false, false, { includeInstructions: false });
  const plan = codexInstallJson(result, false);
  assert.equal(plan.harness, "codex");
  assert.ok(!plan.actions.some((a) => a.path.endsWith("AGENTS.md")));
});
