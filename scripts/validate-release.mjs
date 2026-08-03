#!/usr/bin/env node
/**
 * Release pre-flight: verify a v* tag matches the published CLI version, and that the
 * version is not already on npm. Called by .github/workflows/release.yml before the
 * publish job. Exits non-zero on any mismatch so a bad tag can never publish.
 *
 * Usage: node scripts/validate-release.mjs [tag]
 *   tag    The pushed tag (e.g. "v0.1.0"). Omitted for workflow_dispatch runs,
 *          where only the npm-exists check applies.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliPkg = JSON.parse(fs.readFileSync(path.join(repoRoot, "packages/cli/package.json"), "utf8"));
const version = cliPkg.version;
const tag = process.argv[2];

if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`FAIL: packages/cli/package.json version is not semver: ${version}`);
  process.exit(1);
}

if (tag) {
  const expected = `v${version}`;
  if (!/^v\d+\.\d+\.\d+/.test(tag)) {
    console.error(`FAIL: tag "${tag}" is not a vX.Y.Z tag`);
    process.exit(1);
  }
  if (tag !== expected) {
    console.error(`FAIL: tag "${tag}" does not match packages/cli/package.json version ${version} (expected "${expected}")`);
    process.exit(1);
  }
  console.log(`OK: tag ${tag} matches package version ${version}`);
} else {
  console.log(`OK: no tag provided (manual run) — validating version ${version} against npm`);
}

let published = "";
try {
  published = execFileSync("npm", ["view", `harnesstrim@${version}`, "version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
} catch {
  published = "";
}
if (published) {
  console.error(`FAIL: harnesstrim@${version} is already published on npm`);
  process.exit(1);
}
console.log(`OK: harnesstrim@${version} is not on npm yet — publishable`);
