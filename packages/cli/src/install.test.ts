import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  planOpencodeInstall,
  runInstallOpencode,
  buildOpencodeWrapper,
  OPENCODE_PLUGIN_NAME,
} from "./install.ts";

function tmpProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "htrim-install-"));
}

test("buildOpencodeWrapper imports the adapter and inlines the options", () => {
  const wrapper = buildOpencodeWrapper({ mode: "active", telemetry: true });
  assert.match(wrapper, new RegExp(`from "${OPENCODE_PLUGIN_NAME.replace(/[/\\]/g, "\\$&")}"`));
  assert.match(wrapper, /"telemetry": true/);
  assert.match(wrapper, /HarnessTrim\(input,/);
});

test("planOpencodeInstall installs into an empty project", () => {
  const plan = planOpencodeInstall({
    existingWrapper: null,
    existingPackageJson: null,
    existingOpencodeJson: null,
  });
  assert.equal(plan.changed, true);
  assert.equal(plan.alreadyInstalled, false);
  assert.match(plan.wrapperContent, new RegExp(OPENCODE_PLUGIN_NAME.replace(/[/\\]/g, "\\$&")));
  assert.match(plan.packageJsonContent, /"@harnesstrim\/adapter-opencode"/);
  assert.equal(plan.opencodeJsonContent, null); // nothing to clean
});

test("planOpencodeInstall is idempotent when the wrapper + package.json already match", () => {
  const first = planOpencodeInstall({
    existingWrapper: null,
    existingPackageJson: null,
    existingOpencodeJson: null,
  });
  const second = planOpencodeInstall({
    existingWrapper: first.wrapperContent,
    existingPackageJson: first.packageJsonContent,
    existingOpencodeJson: null,
  });
  assert.equal(second.changed, false);
  assert.equal(second.alreadyInstalled, true);
});

test("planOpencodeInstall cleans a stale adapter tuple out of opencode.json", () => {
  const stale = JSON.stringify({
    $schema: "https://opencode.ai/config.json",
    plugin: [[OPENCODE_PLUGIN_NAME, { mode: "active", telemetry: true }]],
  });
  const plan = planOpencodeInstall({
    existingWrapper: null,
    existingPackageJson: null,
    existingOpencodeJson: stale,
  });
  assert.notEqual(plan.opencodeJsonContent, null);
  const cleaned = JSON.parse(plan.opencodeJsonContent as string);
  assert.equal(cleaned.plugin, undefined); // sole plugin removed → key dropped
  assert.equal(cleaned.$schema, "https://opencode.ai/config.json"); // other keys preserved
  assert.equal(plan.changed, true);
});

test("planOpencodeInstall preserves other plugins when cleaning opencode.json", () => {
  const stale = JSON.stringify({ plugin: ["other-plugin", OPENCODE_PLUGIN_NAME] });
  const plan = planOpencodeInstall({
    existingWrapper: null,
    existingPackageJson: null,
    existingOpencodeJson: stale,
  });
  const cleaned = JSON.parse(plan.opencodeJsonContent as string);
  assert.deepEqual(cleaned.plugin, ["other-plugin"]);
});

test("runInstallOpencode dry-run writes nothing", () => {
  const dir = tmpProject();
  const result = runInstallOpencode(dir, false);
  assert.equal(result.applied, false);
  assert.equal(result.changed, true);
  assert.equal(fs.existsSync(result.wrapperPath), false);
  assert.equal(fs.existsSync(result.packageJsonPath), false);
});

test("runInstallOpencode --apply writes the wrapper + package.json (deps skipped)", () => {
  const dir = tmpProject();
  const result = runInstallOpencode(dir, true, undefined, false);
  assert.equal(result.applied, true);
  assert.ok(fs.existsSync(result.wrapperPath));
  const wrapper = fs.readFileSync(result.wrapperPath, "utf8");
  assert.match(wrapper, new RegExp(OPENCODE_PLUGIN_NAME.replace(/[/\\]/g, "\\$&")));
  const pkg = JSON.parse(fs.readFileSync(result.packageJsonPath, "utf8"));
  assert.ok(pkg.dependencies[OPENCODE_PLUGIN_NAME]);
});

test("runInstallOpencode --apply is idempotent (second run makes no change)", () => {
  const dir = tmpProject();
  runInstallOpencode(dir, true, undefined, false);
  const second = runInstallOpencode(dir, true, undefined, false);
  assert.equal(second.changed, false);
  assert.equal(second.applied, false);
  assert.equal(second.alreadyInstalled, true);
});

test("runInstallOpencode --apply migrates a stale opencode.json tuple", () => {
  const dir = tmpProject();
  fs.writeFileSync(
    path.join(dir, "opencode.json"),
    JSON.stringify({ plugin: [[OPENCODE_PLUGIN_NAME, { mode: "active" }]] }),
  );
  const result = runInstallOpencode(dir, true, undefined, false);
  assert.ok(fs.existsSync(result.wrapperPath));
  const opencodeJson = JSON.parse(fs.readFileSync(result.opencodeJsonPath, "utf8"));
  assert.equal(opencodeJson.plugin, undefined); // stale entry removed
});

test("runInstallOpencode throws on malformed opencode.json", () => {
  const dir = tmpProject();
  fs.writeFileSync(path.join(dir, "opencode.json"), "{ not json");
  assert.throws(() => runInstallOpencode(dir, false), /not valid JSON/);
});

test("runInstallOpencode bakes a preset's adapter config into the wrapper", () => {
  const dir = tmpProject();
  const result = runInstallOpencode(dir, true, "lean-debug", false);
  assert.equal(result.preset?.name, "lean-debug");
  const wrapper = fs.readFileSync(result.wrapperPath, "utf8");
  assert.match(wrapper, /"minLength": 300/);
});

test("runInstallOpencode throws on an unknown preset", () => {
  const dir = tmpProject();
  assert.throws(() => runInstallOpencode(dir, false, "nope"), /Unknown preset/);
});
