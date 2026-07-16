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

export interface CodexGlobalHookInstallResult {
  hookPlan: CodexHookInstallPlan;
  applied: boolean;
}

function readHooksJson(hooksPath: string): string | null {
  try {
    return fs.readFileSync(hooksPath, "utf8");
  } catch {
    return null;
  }
}

function applyHookPlan(plan: CodexHookInstallPlan, apply: boolean): boolean {
  if (!apply || plan.action === "present") return false;
  fs.mkdirSync(path.dirname(plan.hooksFile), { recursive: true });
  fs.writeFileSync(plan.hooksFile, JSON.stringify(plan.nextHooks, null, 2) + "\n");
  return true;
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
  const hooksJsonContent = hook ? readHooksJson(hooksPath) : null;
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
    if (hookPlan) applyHookPlan(hookPlan, true);
    applied = true;
  }

  return { plan, hookPlan, applied, copied };
}

/**
 * Install only the optional hook in Codex's user-level config directory. This avoids
 * modifying a repository's skills or AGENTS.md while letting trusted projects inherit
 * the hook. The hook itself writes metrics relative to each session's cwd.
 */
export function runInstallCodexGlobalHook(codexHome: string, apply: boolean): CodexGlobalHookInstallResult {
  const hooksPath = path.join(codexHome, "hooks.json");
  const hookPlan = planCodexHookInstall({
    // The planner expects the directory that contains .codex; for a user-level config
    // the Codex home is itself that directory, so add its parent and use a normal path.
    projectDir: path.dirname(codexHome),
    hooksJsonContent: readHooksJson(hooksPath),
  });
  // `planCodexHookInstall` produces <projectDir>/.codex/hooks.json. With the parent of
  // CODEX_HOME above, that is exactly the requested user-level hooks file.
  return { hookPlan, applied: applyHookPlan(hookPlan, apply) };
}
