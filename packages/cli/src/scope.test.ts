import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scopeOf, piExtensionDir, ompHooksDir } from "./scope.ts";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "htrim-scope-"));
}

/**
 * The default must recognize the home directory as user scope, and must derive it from
 * `os.homedir()` rather than `process.env.HOME`. Those agree on POSIX but not on Windows,
 * where HOME is usually unset outside a POSIX shell: `path.resolve("")` then collapses to
 * the cwd and the user's own home comes back as "project", so `uninstall` looks for a
 * layout `install` never wrote.
 *
 * HOME is unset for the duration so the assertion holds on every platform and shell —
 * both sides read whatever `os.homedir()` reports, so only a HOME-derived implementation
 * can fail it.
 */
test("the home directory is user scope by default, independent of HOME", () => {
  const previous = process.env.HOME;
  delete process.env.HOME;
  try {
    assert.equal(scopeOf(os.homedir()), "user");
  } finally {
    if (previous !== undefined) process.env.HOME = previous;
  }
});

test("any other directory is project scope by default", () => {
  assert.equal(scopeOf(tmpDir()), "project");
});

test("an injected home decides the scope without touching the environment", () => {
  const home = tmpDir();
  const other = tmpDir();
  assert.equal(scopeOf(home, home), "user");
  assert.equal(scopeOf(other, home), "project");
});

test("layouts follow the resolved scope", () => {
  const home = tmpDir();
  const project = tmpDir();

  assert.equal(piExtensionDir(home, home), path.join(home, ".pi", "agent", "extensions", "harnesstrim"));
  assert.equal(piExtensionDir(project, home), path.join(project, ".pi", "extensions", "harnesstrim"));

  assert.equal(ompHooksDir(home, home), path.join(home, ".omp", "agent", "hooks"));
  assert.equal(ompHooksDir(project, home), path.join(project, ".omp", "hooks"));
});
