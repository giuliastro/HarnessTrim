import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runInstallOmp, readOmpConfigFile } from "./install-omp.ts";
import { OMP_HOOK_MARKER } from "@harnesstrim/adapter-omp";

test("runInstallOmp --apply writes the hook and baked config", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "htrim-omp-install-"));
  const result = runInstallOmp(project, true, { mode: "active", minLength: 300, metrics: "m.jsonl" });

  assert.equal(result.applied, true);
  const hook = path.join(project, ".omp", "hooks", "post", "harnesstrim.ts");
  const config = path.join(project, ".omp", "hooks", "harnesstrim.json");
  assert.ok(fs.existsSync(hook));
  assert.match(fs.readFileSync(hook, "utf8"), new RegExp(OMP_HOOK_MARKER));
  assert.ok(fs.existsSync(config));
  const baked = readOmpConfigFile(config);
  assert.deepEqual(baked, { mode: "active", minLength: 300, metrics: "m.jsonl" });
});

test("runInstallOmp --apply is idempotent and preserves the baked config", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "htrim-omp-install-"));
  runInstallOmp(project, true, { mode: "active", minLength: 300 });

  // A plain re-`--apply` (no options) must not reset the baked state.
  const again = runInstallOmp(project, true);
  assert.equal(again.plan.alreadyInstalled, true);
  assert.deepEqual(readOmpConfigFile(again.configPath), { mode: "active", minLength: 300 });

  // Explicit options override the baked state.
  const overridden = runInstallOmp(project, true, { mode: "off" });
  assert.equal(overridden.config.mode, "off");
  assert.deepEqual(readOmpConfigFile(overridden.configPath), { mode: "off", minLength: 300 });
});

test("runInstallOmp dry-run writes nothing", () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "htrim-omp-install-"));
  const result = runInstallOmp(project, false, { mode: "active" });
  assert.equal(result.applied, false);
  assert.ok(!fs.existsSync(path.join(project, ".omp", "hooks", "post", "harnesstrim.ts")));
  assert.ok(!fs.existsSync(path.join(project, ".omp", "hooks", "harnesstrim.json")));
});
