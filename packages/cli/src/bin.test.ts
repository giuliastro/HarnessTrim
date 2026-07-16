import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const bin = path.resolve(here, "..", "bin", "harnesstrim.mjs");

test("published CLI bin runs from outside the repository", () => {
  const result = spawnSync(process.execPath, [bin, "--help"], {
    cwd: path.parse(process.cwd()).root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /harnesstrim — one token policy/);
});
