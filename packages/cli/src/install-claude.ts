import fs from "node:fs";
import path from "node:path";
import { planClaudeInstall, type ClaudeInstallPlan } from "@harnesstrim/adapter-claude";
import { resolveSkillsSourceDir, listShippedSkills, existingSkillNames } from "./skills-source.ts";

export interface ClaudeInstallResult {
  plan: ClaudeInstallPlan;
  applied: boolean;
  copied: string[];
}

/**
 * Compute (and optionally apply) a Claude Code install: copy the shipped skill pack into
 * `<dir>/.claude/skills` and add a PostToolUse reducer hook to `.claude/settings.json`.
 * Dry-run by default; skills already present are skipped and the hook is added only once.
 */
export function runInstallClaude(dir: string, apply: boolean): ClaudeInstallResult {
  const skillsSourceDir = resolveSkillsSourceDir();
  const skillNames = listShippedSkills(skillsSourceDir);
  const skillsDest = path.join(dir, ".claude", "skills");
  const settingsPath = path.join(dir, ".claude", "settings.json");

  let settingsJsonContent: string | null = null;
  try {
    settingsJsonContent = fs.readFileSync(settingsPath, "utf8");
  } catch {
    settingsJsonContent = null;
  }

  const plan = planClaudeInstall({
    projectDir: dir,
    skillsSourceDir,
    skillNames,
    settingsJsonContent,
    existingSkillNames: existingSkillNames(skillsDest),
  });

  const copied: string[] = [];
  let applied = false;
  if (apply) {
    for (const skill of plan.skills) {
      if (skill.present) continue;
      fs.cpSync(skill.from, skill.to, { recursive: true });
      copied.push(skill.name);
    }
    if (plan.settingsAction !== "present") {
      fs.mkdirSync(path.dirname(plan.settingsFile), { recursive: true });
      fs.writeFileSync(plan.settingsFile, JSON.stringify(plan.nextSettings, null, 2) + "\n");
    }
    applied = true;
  }

  return { plan, applied, copied };
}
