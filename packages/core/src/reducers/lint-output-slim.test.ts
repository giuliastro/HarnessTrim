import { test } from "node:test";
import assert from "node:assert/strict";
import { lintOutputSlim } from "./lint-output-slim.ts";

const eslintWall = `src/auth.js:20:15  warning  no-console - line should match project style (auto-fixable)
src/auth.js:21:16  warning  no-debugger - line should match project style (auto-fixable)
src/auth.js:22:17  warning  prefer-const - line should match project style (auto-fixable)
src/users.js:20:15  warning  no-console - line should match project style (auto-fixable)
src/users.js:21:16  warning  no-debugger - line should match project style (auto-fixable)
src/billing.js:18:13  error  no-empty - line should match project style (auto-fixable)

✖ 6 warnings
  1 errors
  3 files checked, 3 had style suggestions
  Run eslint --fix to apply automatic fixes.`;

test("lint-output-slim: collapses a wall into a per-rule marker, keeps the summary", () => {
  const result = lintOutputSlim.reduce(eslintWall);
  assert.equal(result.changed, true);
  assert.match(result.output, /omitted \d+ lint line\(s\)/);
  assert.match(result.output, /no-console ×2/);
  assert.match(result.output, /no-debugger ×2/);
  assert.match(result.output, /error\(s\) and warning\(s\)/);
  assert.match(result.output, /✖ 6 warnings/);
  assert.match(result.output, /1 errors/);
  assert.match(result.output, /Run eslint --fix/);
  assert.equal(result.output.split("\n").filter((l) => l.length > 0).length, 5);
});

test("lint-output-slim: is idempotent", () => {
  const once = lintOutputSlim.reduce(eslintWall).output;
  const twice = lintOutputSlim.reduce(once).output;
  assert.equal(once, twice);
});

test("lint-output-slim: leaves short output with no repeated lint lines unchanged", () => {
  const short = "src/auth.js:20:15  warning  no-console - only one line here";
  const result = lintOutputSlim.reduce(short);
  assert.equal(result.changed, false);
  assert.equal(result.output, short);
});

test("lint-output-slim: truncates the rule list past MAX_RULES_IN_MARKER", () => {
  const lines: string[] = [];
  for (let i = 0; i < 12; i++) {
    lines.push(`src/a${i}.js:1:2  warning  rule-${i} - msg`);
  }
  const result = lintOutputSlim.reduce(lines.join("\n"));
  assert.match(result.output, /\+4 more rule/);
});
