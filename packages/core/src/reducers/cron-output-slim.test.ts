import assert from "node:assert/strict";
import test from "node:test";
import { cronOutputSlim } from "./cron-output-slim.ts";

const cronOutput = `# Cron Job: Daily report

## Prompt

[IMPORTANT: full skill content is loaded below]
# Long skill
line one
line two
line three

## Response

# Daily result

- Completed the important action.
`;

test("cron-output-slim: removes archived prompt but preserves the response", () => {
  const result = cronOutputSlim.reduce(cronOutput);
  assert.equal(result.changed, true);
  assert.match(result.output, /# Cron Job: Daily report/);
  assert.match(result.output, /omitted 5 archived prompt\/skill line/);
  assert.match(result.output, /## Response/);
  assert.match(result.output, /Completed the important action/);
  assert.doesNotMatch(result.output, /# Long skill/);
});

test("cron-output-slim: leaves non-cron content alone", () => {
  assert.equal(cronOutputSlim.reduce("## Prompt\ntext\n## Response\ntext").changed, false);
});

test("cron-output-slim: is idempotent", () => {
  const once = cronOutputSlim.reduce(cronOutput).output;
  assert.equal(cronOutputSlim.reduce(once).changed, false);
});
