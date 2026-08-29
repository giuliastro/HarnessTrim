import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runInstallHermes, hermesPluginListed } from "./install-hermes.ts";
import { HERMES_PLUGIN_NAME } from "@harnesstrim/adapter-hermes";

function tmpProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "htrim-hermes-"));
}

test("hermesPluginListed finds the plugin in hermes plugins list output of any layout", () => {
  assert.equal(hermesPluginListed(`✓ ${HERMES_PLUGIN_NAME}\t enabled`), true);
  assert.equal(hermesPluginListed(`${HERMES_PLUGIN_NAME}  enabled`), true);
  assert.equal(hermesPluginListed("security-guidance\tdisabled\nrich-messages-html  disabled"), false);
  assert.equal(hermesPluginListed(""), false);
});

test("runInstallHermes --apply copies the bundle and bakes config", () => {
  const project = tmpProject();
  const result = runInstallHermes(project, true, { mode: "dryrun", minLength: 300 });
  assert.equal(result.applied, true);
  assert.ok(result.copiedFiles.includes(".installed"));
  assert.ok(result.copiedFiles.includes("config.json"));
  const pluginDest = result.plan.pluginDest;
  assert.ok(fs.existsSync(path.join(pluginDest, ".installed")));
  assert.deepEqual(result.config, { mode: "dryrun", minLength: 300 });
});

test("runInstallHermes can copy the bundle without mutating Hermes enablement", () => {
  const project = tmpProject();
  const result = runInstallHermes(project, true, {
    mode: "active",
    minLength: 400,
    enable: false,
  });

  assert.equal(result.applied, true);
  assert.equal(result.enabled, null);
  assert.equal(result.pluginListed, null);
  assert.equal(result.enableMessage, "Hermes plugin enablement was intentionally skipped.");
  assert.deepEqual(result.config, { mode: "active", minLength: 400 });
  assert.ok(fs.existsSync(path.join(result.plan.pluginDest, ".installed")));
  assert.ok(fs.existsSync(path.join(result.plan.pluginDest, "config.json")));
});

test("runInstallHermes dry-run writes nothing", () => {
  const project = tmpProject();
  const result = runInstallHermes(project, false, { mode: "active" });
  assert.equal(result.applied, false);
  assert.ok(!fs.existsSync(path.join(project, ".hermes", "plugins")));
});