import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { planPiInstall, markerFileContent, PI_EXTENSION_NAME } from "./index.ts";

const base = {
  installDir: "/proj",
  extensionSourceDir: "/repo/packages/adapter-pi/extension",
  extensionDirExists: false,
  markerPresent: false,
};

test("plans the extension into .pi/extensions/harnesstrim", () => {
  const plan = planPiInstall(base);
  assert.equal(plan.extensionDest, path.join("/proj", ".pi", "extensions", PI_EXTENSION_NAME));
  assert.equal(plan.extensionSource, "/repo/packages/adapter-pi/extension");
  assert.equal(plan.alreadyInstalled, false);
});

test("not already-installed when the dir exists but the marker is missing", () => {
  const plan = planPiInstall({ ...base, extensionDirExists: true, markerPresent: false });
  assert.equal(plan.alreadyInstalled, false);
});

test("already-installed only when dir exists AND marker present", () => {
  const plan = planPiInstall({ ...base, extensionDirExists: true, markerPresent: true });
  assert.equal(plan.alreadyInstalled, true);
});

test("marker content mentions the extension and dryrun default", () => {
  assert.match(markerFileContent(), /pi-extension/);
  assert.match(markerFileContent(), /HARNESSTRIM_MODE=active/);
});
