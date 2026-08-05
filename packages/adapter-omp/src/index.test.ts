import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  planOmpInstall,
  DEFAULT_OMP_ADAPTER_CONFIG,
  resolveOmpConfig,
  bakeOmpConfig,
  OMP_HOOK_NAME,
  OMP_CONFIG_NAME,
  OMP_HOOK_MARKER,
} from "./index.ts";

const base = {
  installDir: "/proj",
  hookSourceDir: "/repo/packages/adapter-omp/hook",
  hookFileExists: false,
  hookContent: null,
};

test("plans a project hook into .omp/hooks/post/harnesstrim.ts", () => {
  const plan = planOmpInstall(base);
  assert.equal(plan.hookDest, path.join("/proj", ".omp", "hooks", "post", OMP_HOOK_NAME));
  assert.equal(plan.configDest, path.join("/proj", ".omp", "hooks", OMP_CONFIG_NAME));
  assert.equal(plan.alreadyInstalled, false);
});

test("plans a user hook into ~/.omp/agent/hooks/post", () => {
  const plan = planOmpInstall({ ...base, scope: "user" });
  assert.equal(plan.hookDest, path.join("/proj", ".omp", "agent", "hooks", "post", OMP_HOOK_NAME));
});

test("not already-installed when the file exists but is not ours (no marker)", () => {
  const plan = planOmpInstall({ ...base, hookFileExists: true, hookContent: "export default () => {}" });
  assert.equal(plan.alreadyInstalled, false);
});

test("already-installed only when the file exists AND carries our marker", () => {
  const plan = planOmpInstall({
    ...base,
    hookFileExists: true,
    hookContent: `// ${OMP_HOOK_MARKER}\nexport default function (pi) {}`,
  });
  assert.equal(plan.alreadyInstalled, true);
});

test("default config is dryrun/400 and bakes deterministically", () => {
  assert.deepEqual(DEFAULT_OMP_ADAPTER_CONFIG, { mode: "dryrun", minLength: 400 });
  assert.equal(bakeOmpConfig(DEFAULT_OMP_ADAPTER_CONFIG), '{\n  "mode": "dryrun",\n  "minLength": 400\n}\n');
});

test("resolveOmpConfig preserves a baked config and applies overrides", () => {
  const baked = { mode: "active" as const, minLength: 2000 };
  assert.deepEqual(resolveOmpConfig(baked), { mode: "active", minLength: 2000 });
  assert.deepEqual(resolveOmpConfig(baked, { mode: "off" }), { mode: "off", minLength: 2000 });
  const withMetrics = resolveOmpConfig(null, { metrics: ".harnesstrim/m.jsonl" });
  assert.equal(withMetrics.metrics, ".harnesstrim/m.jsonl");
});