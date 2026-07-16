import fs from "node:fs";
import path from "node:path";
import { resolveSkillsSourceDir } from "./assets.ts";

// The skill-pack directory resolver lives in ./assets.ts (shared with the Hermes/Pi
// installers, and layout-aware for both the published bundle and the monorepo).
export { resolveSkillsSourceDir };

/** List skill directory names that contain a SKILL.md, under `skillsSourceDir`. */
export function listShippedSkills(skillsSourceDir: string): string[] {
  try {
    return fs
      .readdirSync(skillsSourceDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && fs.existsSync(path.join(skillsSourceDir, e.name, "SKILL.md")))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}

/** Names of skill subdirectories already present at `dest` (empty if dest is missing). */
export function existingSkillNames(dest: string): string[] {
  try {
    return fs
      .readdirSync(dest, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return [];
  }
}
