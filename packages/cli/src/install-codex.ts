import fs from "node:fs";
import path from "node:path";
import { planCodexHookInstall, planCodexInstall, type CodexHookInstallPlan, type CodexInstallPlan } from "@harnesstrim/adapter-codex";
import { resolveSkillsSourceDir, listShippedSkills, existingSkillNames } from "./skills-source.ts";

export interface CodexInstallResult {
  plan: CodexInstallPlan;
  hookPlan: CodexHookInstallPlan | null;
  applied: boolean;
  copied: string[];
}

/**
 * Compute (and optionally apply) a Codex install: copy the shipped skill pack into
 * `<dir>/.codex/skills` and add the reduce-pipe instruction to AGENTS.md. Dry-run by
 * default; skills already present are skipped and the AGENTS.md snippet is only added
 * once (idempotent via its marker).
 */
export function runInstallCodex(dir: string, apply: boolean, hook: boolean = false): CodexInstallResult {
  const skillsSourceDir = resolveSkillsSourceDir();
  const skillNames = listShippedSkills(skillsSourceDir);
  const skillsDest = path.join(dir, ".codex", "skills");

  const agentsPath = path.join(dir, "AGENTS.md");
  let agentsMdContent: string | null = null;
  try {
    agentsMdContent = fs.readFileSync(agentsPath, "utf8");
  } catch {
    agentsMdContent = null;
  }

  const plan = planCodexInstall({
    projectDir: dir,
    skillsSourceDir,
    skillNames,
    agentsMdContent,
    existingSkillNames: existingSkillNames(skillsDest),
  });

  const hooksPath = path.join(dir, ".codex", "hooks.json");
  let hooksJsonContent: string | null = null;
  if (hook) {
    try {
      hooksJsonContent = fs.readFileSync(hooksPath, "utf8");
    } catch {
      hooksJsonContent = null;
    }
  }
  const hookPlan = hook ? planCodexHookInstall({ projectDir: dir, hooksJsonContent }) : null;

  const copied: string[] = [];
  let applied = false;
  if (apply) {
    for (const skill of plan.skills) {
      if (skill.present) continue;
      fs.cpSync(skill.from, skill.to, { recursive: true });
      copied.push(skill.name);
    }
    if (plan.instructionsAction === "create") {
      fs.writeFileSync(plan.instructionsFile, plan.instructionsSnippet + "\n");
    } else if (plan.instructionsAction === "append") {
      fs.appendFileSync(plan.instructionsFile, "\n\n" + plan.instructionsSnippet + "\n");
    }
    if (hookPlan && hookPlan.action !== "present") {
      fs.mkdirSync(path.dirname(hookPlan.hooksFile), { recursive: true });
      fs.writeFileSync(hookPlan.hooksFile, JSON.stringify(hookPlan.nextHooks, null, 2) + "\n");
    }
    applied = true;
  }

  return { plan, hookPlan, applied, copied };
}
