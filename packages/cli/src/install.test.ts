import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { planOpencodeInstall, runInstallOpencode, OPENCODE_PLUGIN_NAME } from "./install.ts";

function tmpProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "htrim-install-"));
}

test("planOpencodeInstall adds the plugin to an empty config", () => {
  const plan = planOpencodeInstall({});
  assert.equal(plan.changed, true);
  assert.equal(plan.alreadyInstalled, false);
  assert.deepEqual(plan.nextConfig.plugin, [OPENCODE_PLUGIN_NAME]);
});

test("planOpencodeInstall preserves existing plugins and keys", () => {
  const plan = planOpencodeInstall({ model: "x", plugin: ["other"] });
  assert.deepEqual(plan.nextConfig.plugin, ["other", OPENCODE_PLUGIN_NAME]);
  assert.equal(plan.nextConfig.model, "x");
});

test("planOpencodeInstall is a no-op when already installed", () => {
  const plan = planOpencodeInstall({ plugin: [[OPENCODE_PLUGIN_NAME, { mode: "active" }]] });
  assert.equal(plan.changed, false);
  assert.equal(plan.alreadyInstalled, true);
});

test("runInstallOpencode dry-run does not write the file", () => {
  const dir = tmpProject();
  const result = runInstallOpencode(dir, false);
  assert.equal(result.existed, false);
  assert.equal(result.changed, true);
  assert.equal(result.applied, false);
  assert.equal(fs.existsSync(result.configPath), false);
});

test("runInstallOpencode --apply writes valid JSON with the plugin", () => {
  const dir = tmpProject();
  const result = runInstallOpencode(dir, true);
  assert.equal(result.applied, true);
  const written = JSON.parse(fs.readFileSync(result.configPath, "utf8"));
  assert.deepEqual(written.plugin, [OPENCODE_PLUGIN_NAME]);
});

test("runInstallOpencode --apply is idempotent (second run makes no change)", () => {
  const dir = tmpProject();
  runInstallOpencode(dir, true);
  const second = runInstallOpencode(dir, true);
  assert.equal(second.alreadyInstalled, true);
  assert.equal(second.changed, false);
  assert.equal(second.applied, false);
});

test("runInstallOpencode throws on malformed opencode.json", () => {
  const dir = tmpProject();
  fs.writeFileSync(path.join(dir, "opencode.json"), "{ not json");
  assert.throws(() => runInstallOpencode(dir, false), /not valid JSON/);
});

test("runInstallOpencode with a preset bakes the adapter config into a tuple", () => {
  const dir = tmpProject();
  const result = runInstallOpencode(dir, true, "lean-debug");
  assert.equal(result.preset?.name, "lean-debug");
  const written = JSON.parse(fs.readFileSync(result.configPath, "utf8"));
  const entry = written.plugin[0];
  assert.equal(entry[0], OPENCODE_PLUGIN_NAME);
  assert.equal(entry[1].mode, "active");
  assert.equal(entry[1].minLength, 300);
});

test("runInstallOpencode throws on an unknown preset", () => {
  const dir = tmpProject();
  assert.throws(() => runInstallOpencode(dir, false, "nope"), /Unknown preset/);
});

test("runInstallOpencode --preset updates an existing bare install to the tuple", () => {
  const dir = tmpProject();
  runInstallOpencode(dir, true); // bare string install
  const second = runInstallOpencode(dir, true, "lean-review");
  assert.equal(second.changed, true);
  assert.equal(second.alreadyInstalled, true);
  const written = JSON.parse(fs.readFileSync(second.configPath, "utf8"));
  assert.equal(written.plugin.length, 1);
  assert.equal(written.plugin[0][1].minLength, 400);
});
