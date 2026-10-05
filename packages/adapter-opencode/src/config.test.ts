import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveConfig } from "./config.ts";

const cases: { option: unknown; env: string | undefined; debug: boolean; trackPassThrough: boolean }[] = [
  { option: false, env: "true", debug: false, trackPassThrough: false },
  { option: false, env: "1", debug: false, trackPassThrough: false },
  { option: true, env: "false", debug: true, trackPassThrough: true },
  { option: true, env: "0", debug: true, trackPassThrough: true },
  { option: undefined, env: undefined, debug: false, trackPassThrough: true },
  { option: undefined, env: "true", debug: true, trackPassThrough: true },
  { option: undefined, env: "false", debug: false, trackPassThrough: false },
  { option: undefined, env: "other", debug: false, trackPassThrough: true },
  { option: "false", env: "true", debug: true, trackPassThrough: true },
  { option: "true", env: "false", debug: false, trackPassThrough: false },
  { option: null, env: "1", debug: true, trackPassThrough: true },
  { option: 0, env: "0", debug: false, trackPassThrough: false },
];

for (const [option, variable] of [
  ["debug", "HARNESSTRIM_DEBUG"],
  ["trackPassThrough", "HARNESSTRIM_TRACK_PASSTHROUGH"],
] as const) {
  test(`${option}: explicit booleans override the environment; other values preserve fallback`, (t) => {
    const previous = process.env[variable];
    t.after(() => {
      if (previous === undefined) delete process.env[variable];
      else process.env[variable] = previous;
    });

    for (const row of cases) {
      if (row.env === undefined) delete process.env[variable];
      else process.env[variable] = row.env;
      const options = row.option === undefined ? {} : { [option]: row.option };
      assert.equal(
        resolveConfig(options)[option],
        row[option],
        `option=${String(row.option)}, env=${String(row.env)}`,
      );
    }
  });
}
