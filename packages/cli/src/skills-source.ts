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

/**
 * Names of skills already present at `dest`.
 *
 * A directory by itself is not an installed skill. Transactional managers can remove the owned
 * files while deliberately leaving empty directories behind; treating those directories as
 * "present" makes a later install skip the copy and leaves the skill broken. Require the skill's
 * entry file before considering it installed. A same-named user skill that still has SKILL.md
 * remains untouched, preserving the existing non-overwrite behavior.
 */
export function existingSkillNames(dest: string): string[] {
  try {
    return fs
      .readdirSync(dest, { withFileTypes: true })
      .filter(
        (e) =>
          e.isDirectory() &&
          fs.existsSync(path.join(dest, e.name, "SKILL.md")) &&
          fs.statSync(path.join(dest, e.name, "SKILL.md")).isFile(),
      )
      .map((e) => e.name);
  } catch {
    return [];
  }
}
