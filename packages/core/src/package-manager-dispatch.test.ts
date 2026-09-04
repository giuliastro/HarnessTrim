import { test } from "node:test";
import assert from "node:assert/strict";
import { pickReducer, reduceAuto } from "./dispatch.ts";

function pnpmWall(): string {
  const progress = Array.from(
    { length: 12 },
    (_, index) =>
      `Progress: resolved ${index + 1}, reused ${index}, downloaded 0, added ${index}`,
  ).join("\n");
  return `Scope: all 6 workspace projects\n${progress}\nPackages: +125\nWARN deprecated sample@1.0.0\nProgress: resolved 125, reused 125, downloaded 0, added 125, done\nDone in 1.2s`;
}

test("package-manager dispatch selects the pnpm reducer for a noisy progress wall", () => {
  const input = pnpmWall();
  assert.ok(input.length > 400);
  assert.equal(pickReducer(input)?.name, "package-manager-output-slim");

  const result = reduceAuto(input);
  assert.equal(result.reducer, "package-manager-output-slim");
  assert.equal(result.changed, true);
  assert.match(result.output, /WARN deprecated sample@1\.0\.0/);
  assert.match(
    result.output,
    /Progress: resolved 125, reused 125, downloaded 0, added 125, done/,
  );
});

test("package-manager dispatch fails closed when too few progress lines are present", () => {
  const input = `${"context filler ".repeat(40)}\nProgress: resolved 1, reused 0, downloaded 0, added 0\nProgress: resolved 1, reused 1, downloaded 0, added 1, done`;
  const result = reduceAuto(input);
  assert.equal(result.changed, false);
  assert.equal(result.reducer, null);
  assert.equal(result.output, input);
});
