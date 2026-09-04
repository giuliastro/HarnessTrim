import { test } from "node:test";
import assert from "node:assert/strict";
import { ciLogSlim } from "./ci-log-slim.ts";

const setupNoise = [
  "Syncing repository: giuliastro/HarnessTrim",
  "Getting Git version info",
  "Temporarily overriding HOME=/home/runner/work/_temp/abc before making global git config changes",
  "Adding repository directory to the temporary git global config as a safe directory",
  "/usr/bin/git config --global --add safe.directory /home/runner/work/HarnessTrim/HarnessTrim",
  "Disabling automatic garbage collection",
  "Setting up auth",
  "Fetching the repository",
  "Determining the checkout info",
  "Checking out the ref",
].join("\n");

test("ciLogSlim collapses known-benign checkout boilerplate", () => {
  const input = `##[group]Run actions/checkout@v4\n${setupNoise}\n##[endgroup]\nRun pnpm test`;
  const result = ciLogSlim.reduce(input);

  assert.equal(result.changed, true);
  assert.match(result.output, /\[harnesstrim:ci-log-slim\] omitted 10 CI setup\/debug line\(s\)/);
  assert.match(result.output, /##\[group\]Run actions\/checkout@v4/);
  assert.match(result.output, /Run pnpm test/);
  assert.doesNotMatch(result.output, /Temporarily overriding HOME=/);
});

test("ciLogSlim preserves errors warnings failures and exit codes", () => {
  const input = [
    "##[debug]Evaluating condition for step: test",
    "##[debug]Starting: test",
    "##[debug]Loading inputs",
    "error: package build failed",
    "warning: cache restore was skipped",
    "FAIL src/example.test.ts",
    "Process completed with exit code 1.",
  ].join("\n");
  const result = ciLogSlim.reduce(input);

  assert.equal(result.changed, true);
  assert.match(result.output, /error: package build failed/);
  assert.match(result.output, /warning: cache restore was skipped/);
  assert.match(result.output, /FAIL src\/example\.test\.ts/);
  assert.match(result.output, /Process completed with exit code 1\./);
});

test("ciLogSlim understands gh run view tab prefixes", () => {
  const prefix = "quality\tCheckout\t2026-09-04T06:00:00Z\t";
  const input = [
    `${prefix}##[debug]Starting checkout`,
    `${prefix}##[debug]Loading inputs`,
    `${prefix}##[debug]Resolving repository`,
    `${prefix}fatal: repository unavailable`,
  ].join("\n");
  const result = ciLogSlim.reduce(input);

  assert.equal(result.changed, true);
  assert.match(result.output, /omitted 3 CI setup\/debug line\(s\)/);
  assert.match(result.output, /fatal: repository unavailable/);
});

test("ciLogSlim leaves short noise runs alone", () => {
  const input = "##[debug]one\n##[debug]two\nRun pnpm test";
  const result = ciLogSlim.reduce(input);
  assert.equal(result.changed, false);
  assert.equal(result.output, input);
});

test("ciLogSlim is idempotent", () => {
  const input = `##[group]Run actions/checkout@v4\n${setupNoise}\n##[endgroup]`;
  const once = ciLogSlim.reduce(input);
  const twice = ciLogSlim.reduce(once.output);
  assert.equal(once.changed, true);
  assert.equal(twice.changed, false);
  assert.equal(twice.output, once.output);
});
