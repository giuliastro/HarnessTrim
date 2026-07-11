import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { inspect, extractPluginNames, estimateTokens } from "./doctor.ts";

function tmpProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "htrim-doctor-"));
}

test("extractPluginNames handles string and tuple entries", () => {
  const config = { plugin: ["a", ["b", { x: 1 }], [123], "c"] };
  assert.deepEqual(extractPluginNames(config), ["a", "b", "c"]);
});

test("extractPluginNames tolerates missing/invalid config", () => {
  assert.deepEqual(extractPluginNames({}), []);
  assert.deepEqual(extractPluginNames(null), []);
  assert.deepEqual(extractPluginNames({ plugin: "nope" }), []);
});

test("estimateTokens is chars/4 rounded up", () => {
  assert.equal(estimateTokens(400), 100);
  assert.equal(estimateTokens(401), 101);
});

test("inspect flags a large instruction file", () => {
  const dir = tmpProject();
  fs.writeFileSync(path.join(dir, "CLAUDE.md"), "x".repeat(5000));
  const report = inspect(dir);
  const finding = report.findings.find((f) => f.title.includes("CLAUDE.md"));
  assert.ok(finding);
  assert.equal(finding.severity, "warn");
  assert.match(finding.suggestion ?? "", /skills/i);
});

test("inspect treats a small instruction file as info", () => {
  const dir = tmpProject();
  fs.writeFileSync(path.join(dir, "AGENTS.md"), "short and sweet");
  const report = inspect(dir);
  const finding = report.findings.find((f) => f.title.includes("AGENTS.md"));
  assert.equal(finding?.severity, "info");
});

test("inspect detects the adapter wired into opencode.json", () => {
  const dir = tmpProject();
  fs.writeFileSync(
    path.join(dir, "opencode.json"),
    JSON.stringify({ plugin: [["@harnesstrim/adapter-opencode", { mode: "active" }]] })
  );
  const report = inspect(dir);
  const finding = report.findings.find((f) => f.title.includes("adapter is wired in"));
  assert.equal(finding?.severity, "ok");
});

test("inspect warns when opencode.json lacks the adapter", () => {
  const dir = tmpProject();
  fs.writeFileSync(path.join(dir, "opencode.json"), JSON.stringify({ plugin: ["other-plugin"] }));
  const report = inspect(dir);
  const finding = report.findings.find((f) => f.title.includes("adapter not installed"));
  assert.equal(finding?.severity, "warn");
  assert.match(finding?.suggestion ?? "", /install opencode/);
});

test("inspect counts skills", () => {
  const dir = tmpProject();
  fs.mkdirSync(path.join(dir, "skills", "foo"), { recursive: true });
  fs.writeFileSync(path.join(dir, "skills", "foo", "SKILL.md"), "---\nname: foo\n---");
  const report = inspect(dir);
  const finding = report.findings.find((f) => f.title.includes("on-demand skill"));
  assert.equal(finding?.severity, "ok");
  assert.match(finding?.title ?? "", /1 on-demand skill/);
});
