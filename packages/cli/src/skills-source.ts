import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Locate the shipped skill pack. In the monorepo this resolves to the repo's `skills/`
 * directory (packages/cli/src -> repo root -> skills). A published build would bundle
 * the skills with the CLI package; this resolver is the single place to change for that.
 */
export function resolveSkillsSourceDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../..", "skills");
}

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
