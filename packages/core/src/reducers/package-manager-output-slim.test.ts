import { test } from "node:test";
import assert from "node:assert/strict";
import { packageManagerOutputSlim } from "./package-manager-output-slim.ts";

const noisy = `Scope: all 6 workspace projects
Lockfile is up to date, resolution step is skipped
Progress: resolved 1, reused 0, downloaded 0, added 0
Packages: +125
++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
Progress: resolved 62, reused 60, downloaded 2, added 59
WARN deprecated inflight@1.0.6: This module is not supported
Progress: resolved 125, reused 120, downloaded 5, added 124
Progress: resolved 125, reused 120, downloaded 5, added 125, done

devDependencies:
+ prettier 3.6.2
+ typescript 5.9.3

Done in 1.8s using pnpm v10.33.4`;

test("packageManagerOutputSlim collapses intermediate pnpm progress while preserving signal", () => {
  const result = packageManagerOutputSlim.reduce(noisy);

  assert.equal(result.changed, true);
  assert.match(result.output, /omitted 3 intermediate progress snapshot\(s\)/);
  assert.match(result.output, /Packages: \+125/);
  assert.match(result.output, /WARN deprecated inflight@1\.0\.6/);
  assert.match(
    result.output,
    /Progress: resolved 125, reused 120, downloaded 5, added 125, done/,
  );
  assert.match(result.output, /\+ typescript 5\.9\.3/);
  assert.match(result.output, /Done in 1\.8s using pnpm v10\.33\.4/);
  assert.doesNotMatch(result.output, /\+{40,}/);
  assert.ok(result.output.length < noisy.length);
});

test("packageManagerOutputSlim is idempotent", () => {
  const first = packageManagerOutputSlim.reduce(noisy);
  const second = packageManagerOutputSlim.reduce(first.output);

  assert.equal(second.changed, false);
  assert.equal(second.output, first.output);
});

test("packageManagerOutputSlim leaves one or two progress snapshots untouched", () => {
  const short = `Progress: resolved 1, reused 0, downloaded 0, added 0\nProgress: resolved 1, reused 1, downloaded 0, added 1, done`;
  assert.deepEqual(packageManagerOutputSlim.reduce(short), { output: short, changed: false });
});

test("packageManagerOutputSlim does not treat arbitrary progress text as pnpm output", () => {
  const other = `Progress: indexing repository\nProgress: parsing AST\nProgress: writing report\n++++++++++++++++++++++++++++`;
  assert.deepEqual(packageManagerOutputSlim.reduce(other), { output: other, changed: false });
});

test("packageManagerOutputSlim preserves lifecycle errors byte-for-byte", () => {
  const failing = `${noisy}\nERR_PNPM_RECURSIVE_RUN_FIRST_FAIL package failed\nELIFECYCLE Command failed with exit code 1`;
  const result = packageManagerOutputSlim.reduce(failing);

  assert.match(result.output, /ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL package failed/);
  assert.match(result.output, /ELIFECYCLE Command failed with exit code 1/);
});
