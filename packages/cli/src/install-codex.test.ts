import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runInstallCodex, runInstallCodexGlobalHook } from "./install-codex.ts";

function tmpProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "htrim-codex-"));
}

test("installs the optional Codex hook only when requested", () => {
  const dir = tmpProject();
  runInstallCodex(dir, true);
  assert.equal(fs.existsSync(path.join(dir, ".codex", "hooks.json")), false);

  const result = runInstallCodex(dir, true, true);
  assert.equal(result.hookPlan?.action, "create");
  const written = JSON.parse(fs.readFileSync(path.join(dir, ".codex", "hooks.json"), "utf8"));
  assert.match(JSON.stringify(written), /harnesstrim hook codex --metrics/);
});

test("Codex hook install is idempotent", () => {
  const dir = tmpProject();
  runInstallCodex(dir, true, true);
  const second = runInstallCodex(dir, true, true);
  assert.equal(second.hookPlan?.action, "present");
});

test("global hook install writes only the Codex-home hooks file", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "htrim-codex-home-"));
  const codexHome = path.join(home, ".codex");
  const result = runInstallCodexGlobalHook(codexHome, true);
  assert.equal(result.hookPlan.hooksFile, path.join(codexHome, "hooks.json"));
  assert.equal(fs.existsSync(path.join(home, "AGENTS.md")), false);
  assert.equal(fs.existsSync(path.join(codexHome, "skills")), false);
  assert.match(fs.readFileSync(path.join(codexHome, "hooks.json"), "utf8"), /harnesstrim hook codex/);
});
