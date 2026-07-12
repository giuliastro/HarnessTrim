import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { planHermesInstall, HERMES_PLUGIN_MARKER } from "./index.ts";

const base = {
  installDir: "/home/user",
  pluginSourceDir: "/repo/packages/adapter-hermes/plugin",
  pluginDirExists: false as boolean,
  markerPresent: false as boolean,
};

test("planHermesInstall targets .hermes/plugins/harnesstrim/", () => {
  const plan = planHermesInstall(base);
  assert.equal(plan.pluginDest, path.join("/home/user", ".hermes", "plugins", "harnesstrim"));
});

test("planHermesInstall not installed when plugin dir is absent", () => {
  const plan = planHermesInstall({ ...base, pluginDirExists: false, markerPresent: false });
  assert.equal(plan.alreadyInstalled, false);
});

test("planHermesInstall not installed when marker is absent", () => {
  const plan = planHermesInstall({ ...base, pluginDirExists: true, markerPresent: false });
  assert.equal(plan.alreadyInstalled, false);
});

test("planHermesInstall is idempotent (marker present = already installed)", () => {
  const plan = planHermesInstall({ ...base, pluginDirExists: true, markerPresent: true });
  assert.equal(plan.alreadyInstalled, true);
});

test("planHermesInstall preserves the source path", () => {
  const plan = planHermesInstall(base);
  assert.equal(plan.pluginSource, "/repo/packages/adapter-hermes/plugin");
});
