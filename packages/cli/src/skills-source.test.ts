import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";

import { existingSkillNames } from "./skills-source.ts";

const scratch: string[] = [];

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "harnesstrim-skills-"));
  scratch.push(dir);
  return dir;
}

afterEach(() => {
  while (scratch.length > 0) fs.rmSync(scratch.pop()!, { recursive: true, force: true });
});

test("existingSkillNames ignores empty directories left by transactional file removal", () => {
  const dest = tempDir();
  fs.mkdirSync(path.join(dest, "compact-handoff", "references"), { recursive: true });
  assert.deepEqual(existingSkillNames(dest), []);
});

test("existingSkillNames recognizes a real skill entry file", () => {
  const dest = tempDir();
  fs.mkdirSync(path.join(dest, "delta-response"), { recursive: true });
  fs.writeFileSync(path.join(dest, "delta-response", "SKILL.md"), "# skill\n");
  assert.deepEqual(existingSkillNames(dest), ["delta-response"]);
});
